package job

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	pricingsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/pricing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
)

const (
	TaskGenerate = "video:generate"
	TaskPoll     = "video:poll"
)

var ErrInsufficient = errors.New("insufficient_credits")

// Enqueuer is the subset of asynq.Client we use; it lets tests inject a fake.
type Enqueuer interface {
	EnqueueContext(ctx context.Context, task *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error)
}

type Service struct {
	db         *gorm.DB
	billing    *billing.Service
	spend      *spend.Service
	throughput *throughput.Service
	pricing    *pricingsvc.Service
	prov       provider.Provider
	queue      Enqueuer
}

func NewService(db *gorm.DB, b *billing.Service, p provider.Provider, q Enqueuer) *Service {
	return &Service{db: db, billing: b, prov: p, queue: q}
}

func (s *Service) SetSpend(sp *spend.Service)           { s.spend = sp }
func (s *Service) SetThroughput(tp *throughput.Service) { s.throughput = tp }
func (s *Service) SetPricing(ps *pricingsvc.Service)    { s.pricing = ps }

type CreateInput struct {
	OrgID             string
	APIKeyID          *string
	BatchRunID        *string
	SkipThroughput    bool // when true, caller has acquired throughput before enqueue
	DeferEnqueue      bool // when true, reserve/create now and dispatch later through the batch scheduler
	CreateVideoRecord bool
	VideoMetadata     json.RawMessage
	Request           provider.GenerationRequest
}

type CreateResult struct {
	JobID                 string
	VideoID               string
	Status                string
	EstimatedCredits      int64
	UpstreamEstimateCents int64
	PricingMarkupBPS      int
	PricingSource         string
	MarginCents           int64
	PricingApplied        bool
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*CreateResult, error) {
	tokens, upstreamCredits, err := s.prov.EstimateCost(in.Request)
	if err != nil {
		return nil, err
	}
	_ = tokens
	quote, err := s.quoteEstimate(ctx, in.OrgID, upstreamCredits)
	if err != nil {
		return nil, err
	}
	credits := quote.CustomerChargeCents

	reqJSON, _ := json.Marshal(in.Request)

	// Financial kill switch: fast Redis-based in-flight liability check.
	if s.spend != nil {
		if preErr := s.spend.PreCheck(ctx, in.OrgID, credits); preErr != nil {
			if errors.Is(preErr, spend.ErrInFlightExceeded) {
				return nil, ErrInsufficient
			}
			return nil, preErr
		}
	}

	var job domain.Job
	var video domain.Video
	var decision *spend.Decision

	negCredits := -credits
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if s.spend != nil {
			d, enforceErr := s.spend.Enforce(ctx, tx, in.OrgID, credits)
			if enforceErr != nil {
				if errors.Is(enforceErr, spend.ErrInsufficientBalance) {
					return ErrInsufficient
				}
				return enforceErr
			}
			decision = d
		} else {
			bal, balErr := s.billing.GetBalance(ctx, in.OrgID)
			if balErr != nil {
				return balErr
			}
			if bal < credits {
				return ErrInsufficient
			}
		}

		job = domain.Job{
			OrgID:           in.OrgID,
			APIKeyID:        in.APIKeyID,
			BatchRunID:      in.BatchRunID,
			Provider:        s.prov.Name(),
			Request:         reqJSON,
			Status:          domain.JobQueued,
			ReservedCredits: credits,
		}
		if s.pricing != nil {
			job.UpstreamEstimateCents = &quote.UpstreamCostCents
			job.MarginCents = &quote.MarginCents
			job.PricingMarkupBPS = &quote.MarkupBPS
			job.PricingSource = &quote.Source
		}
		createDB := tx
		if s.pricing == nil {
			createDB = createDB.Omit("UpstreamEstimateCents", "UpstreamActualCents", "MarginCents", "PricingMarkupBPS", "PricingSource")
		}
		if err := createDB.Create(&job).Error; err != nil {
			return err
		}
		if in.CreateVideoRecord {
			metadata := in.VideoMetadata
			if len(metadata) == 0 {
				metadata = json.RawMessage(`{}`)
			}
			model := in.Request.Model
			if model == "" {
				model = "seedance-2.0-pro"
			}
			upstreamJobID := job.ID
			video = domain.Video{
				OrgID:              in.OrgID,
				APIKeyID:           in.APIKeyID,
				Model:              model,
				Status:             string(job.Status),
				Input:              reqJSON,
				Metadata:           metadata,
				UpstreamJobID:      &upstreamJobID,
				EstimatedCostCents: credits,
				ReservedCents:      credits,
			}
			if s.pricing != nil {
				video.UpstreamEstimateCents = &quote.UpstreamCostCents
				video.MarginCents = &quote.MarginCents
				video.PricingMarkupBPS = &quote.MarkupBPS
				video.PricingSource = &quote.Source
			}
			videoDB := tx
			if s.pricing == nil {
				videoDB = videoDB.Omit("UpstreamEstimateCents", "UpstreamActualCents", "MarginCents", "PricingMarkupBPS", "PricingSource")
			}
			if err := videoDB.Create(&video).Error; err != nil {
				return err
			}
		}
		return tx.Create(&domain.CreditsLedger{
			OrgID:        in.OrgID,
			DeltaCredits: -credits,
			DeltaCents:   &negCredits,
			Reason:       domain.ReasonReservation,
			JobID:        &job.ID,
			Note:         "reserved for " + job.ID,
		}).Error
	})
	if err != nil {
		return nil, err
	}

	// Track in-flight liability in Redis for the financial kill switch.
	if s.spend != nil {
		s.spend.IncrInflight(ctx, in.OrgID, credits)
	}

	// Post-commit: fire spend alerts (soft alert, auto-pause, monthly limit).
	if s.spend != nil && decision != nil {
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_, _, _ = s.spend.AfterReserve(bgCtx, in.OrgID, decision)
		}()
	}

	if in.DeferEnqueue {
		return &CreateResult{
			JobID:                 job.ID,
			VideoID:               video.ID,
			Status:                string(job.Status),
			EstimatedCredits:      credits,
			UpstreamEstimateCents: quote.UpstreamCostCents,
			PricingMarkupBPS:      quote.MarkupBPS,
			PricingSource:         quote.Source,
			MarginCents:           quote.MarginCents,
			PricingApplied:        s.pricing != nil,
		}, nil
	}

	// Throughput: acquire a concurrency slot before enqueuing direct jobs.
	// Deferred batch jobs are dispatched later by DispatchBatch.
	if s.throughput != nil && !in.SkipThroughput {
		apiKeyStr := ""
		if in.APIKeyID != nil {
			apiKeyStr = *in.APIKeyID
		}
		if acqErr := s.throughput.AcquireForKey(ctx, in.OrgID, apiKeyStr, job.ID); acqErr != nil {
			if s.spend != nil {
				s.spend.DecrInflight(ctx, in.OrgID, credits)
			}
			if refundErr := s.failQueuedJobAndRefund(ctx, job, "throughput_limit", "concurrency limit reached before enqueue", "refund: throughput slot unavailable"); refundErr != nil {
				return nil, refundErr
			}
			return nil, acqErr
		}
	}

	enqErr := enqueueGenerateTask(ctx, s.queue, buildGenerateEnqueueOptions(ctx, s.throughput, in.OrgID, in.APIKeyID), job.ID)
	if enqErr != nil {
		if s.throughput != nil {
			// Symmetric to AcquireForKey above — without this the per-key
			// concurrency slot leaks and a noisy customer can exhaust their
			// own quota without ever running anything.
			_ = s.throughput.ReleaseForKey(context.Background(), in.OrgID, in.APIKeyID, job.ID)
		}
		if s.spend != nil {
			s.spend.DecrInflight(context.Background(), in.OrgID, credits)
		}
		cctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if refundErr := failQueuedJobAndRefund(cctx, s.db, job, "enqueue_failed", "job queue unavailable", "refund: enqueue failed"); refundErr != nil {
			return nil, refundErr
		}
		return nil, enqErr
	}

	return &CreateResult{
		JobID:                 job.ID,
		VideoID:               video.ID,
		Status:                string(job.Status),
		EstimatedCredits:      credits,
		UpstreamEstimateCents: quote.UpstreamCostCents,
		PricingMarkupBPS:      quote.MarkupBPS,
		PricingSource:         quote.Source,
		MarginCents:           quote.MarginCents,
		PricingApplied:        s.pricing != nil,
	}, nil
}

func buildGenerateEnqueueOptions(ctx context.Context, tp *throughput.Service, orgID string, apiKeyID *string) []asynq.Option {
	enqOpts := []asynq.Option{
		asynq.MaxRetry(3),
		// 15 minutes: enough to cover the provider create call (~15s) plus
		// the full polling window (MAX_POLL_MINUTES = 15). The old 30s value
		// would race with a slow upstream create and orphan the job.
		asynq.Timeout(15 * time.Minute),
	}
	if tp != nil {
		enqOpts = append(enqOpts, asynq.Queue(tp.QueueForKey(ctx, orgID, apiKeyID)))
	}
	return enqOpts
}

func enqueueGenerateTask(ctx context.Context, queue Enqueuer, opts []asynq.Option, jobID string) error {
	if queue == nil {
		return errors.New("job_queue_unavailable")
	}
	payload, _ := json.Marshal(map[string]string{"job_id": jobID})
	_, err := queue.EnqueueContext(ctx, asynq.NewTask(TaskGenerate, payload), opts...)
	return err
}

func (s *Service) DispatchBatch(ctx context.Context, batchID string) (int, error) {
	return DispatchBatch(ctx, s.db, s.spend, s.throughput, s.queue, batchID)
}

func (s *Service) DispatchQueued(ctx context.Context, jobID string) error {
	return DispatchQueued(ctx, s.db, s.spend, s.throughput, s.queue, jobID)
}

func DispatchBatch(ctx context.Context, db *gorm.DB, sp *spend.Service, tp *throughput.Service, queue Enqueuer, batchID string) (int, error) {
	const defaultBatchMaxParallel = 5
	var br domain.BatchRun
	if err := db.WithContext(ctx).First(&br, "id = ?", batchID).Error; err != nil {
		return 0, err
	}
	if br.Status != "" && br.Status != "running" {
		return 0, nil
	}
	limit := defaultBatchMaxParallel
	if br.MaxParallel != nil && *br.MaxParallel > 0 {
		limit = *br.MaxParallel
	}
	available := limit - br.RunningCount
	if available <= 0 {
		return 0, nil
	}
	var rows []struct {
		ID string
	}
	if err := db.WithContext(ctx).
		Table("jobs").
		Select("id").
		Where("batch_run_id = ? AND status = ?", batchID, domain.JobQueued).
		Order("created_at ASC, id ASC").
		Limit(available).
		Scan(&rows).Error; err != nil {
		return 0, err
	}
	dispatched := 0
	for _, row := range rows {
		if err := DispatchQueued(ctx, db, sp, tp, queue, row.ID); err != nil {
			if errors.Is(err, throughput.ErrBurstExceeded) {
				break
			}
			return dispatched, err
		}
		dispatched++
	}
	return dispatched, nil
}

func DispatchQueued(ctx context.Context, db *gorm.DB, sp *spend.Service, tp *throughput.Service, queue Enqueuer, jobID string) error {
	var j domain.Job
	if err := db.WithContext(ctx).First(&j, "id = ?", jobID).Error; err != nil {
		return err
	}
	if j.Status != domain.JobQueued {
		return nil
	}
	if tp != nil {
		apiKeyStr := ""
		if j.APIKeyID != nil {
			apiKeyStr = *j.APIKeyID
		}
		if err := tp.AcquireForKey(ctx, j.OrgID, apiKeyStr, j.ID); err != nil {
			return err
		}
	}

	now := time.Now()
	res := db.WithContext(ctx).Model(&domain.Job{}).
		Where("id = ? AND status = ?", j.ID, domain.JobQueued).
		Updates(map[string]any{
			"status":        domain.JobSubmitting,
			"submitting_at": now,
		})
	if res.Error != nil {
		if tp != nil {
			_ = tp.ReleaseForKey(context.Background(), j.OrgID, j.APIKeyID, j.ID)
		}
		return res.Error
	}
	if res.RowsAffected == 0 {
		if tp != nil {
			_ = tp.ReleaseForKey(context.Background(), j.OrgID, j.APIKeyID, j.ID)
		}
		return nil
	}
	if j.BatchRunID != nil {
		db.WithContext(ctx).Model(&domain.BatchRun{}).Where("id = ?", *j.BatchRunID).
			Updates(map[string]any{
				"queued_count":  decrementBatchCounter("queued_count"),
				"running_count": gorm.Expr("running_count + 1"),
			})
	}
	db.WithContext(ctx).Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(map[string]any{
		"status":     "submitting",
		"started_at": now,
	})

	if err := enqueueGenerateTask(ctx, queue, buildGenerateEnqueueOptions(ctx, tp, j.OrgID, j.APIKeyID), j.ID); err != nil {
		if tp != nil {
			_ = tp.ReleaseForKey(context.Background(), j.OrgID, j.APIKeyID, j.ID)
		}
		if sp != nil {
			sp.DecrInflight(context.Background(), j.OrgID, j.ReservedCredits)
		}
		if refundErr := failQueuedJobAndRefund(ctx, db, j, "enqueue_failed", "job queue unavailable", "refund: deferred enqueue failed"); refundErr != nil {
			return refundErr
		}
		return err
	}
	return nil
}

func decrementBatchCounter(column string) any {
	return gorm.Expr("CASE WHEN " + column + " > 0 THEN " + column + " - 1 ELSE 0 END")
}

func (s *Service) quoteEstimate(ctx context.Context, orgID string, upstreamCents int64) (pricingsvc.Quote, error) {
	if s.pricing == nil {
		return pricingsvc.Quote{
			UpstreamCostCents:   upstreamCents,
			CustomerChargeCents: upstreamCents,
			MarkupBPS:           0,
			Source:              domain.PricingSourceGlobal,
			MarginCents:         0,
		}, nil
	}
	return s.pricing.QuoteEstimate(ctx, orgID, upstreamCents)
}

func (s *Service) failQueuedJobAndRefund(ctx context.Context, j domain.Job, code, msg, note string) error {
	return failQueuedJobAndRefund(ctx, s.db, j, code, msg, note)
}

func failQueuedJobAndRefund(ctx context.Context, db *gorm.DB, j domain.Job, code, msg, note string) error {
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current domain.Job
		if err := tx.Select("status, reserved_credits, batch_run_id").First(&current, "id = ?", j.ID).Error; err != nil {
			return err
		}
		if current.Status.IsTerminal() {
			return nil
		}
		now := time.Now()
		if err := tx.Model(&domain.Job{}).
			Where("id = ?", j.ID).
			Updates(map[string]any{
				"status":        domain.JobFailed,
				"error_code":    code,
				"error_message": msg,
				"completed_at":  now,
			}).Error; err != nil {
			return err
		}
		tx.Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(map[string]any{
			"status":        "failed",
			"error_code":    code,
			"error_message": msg,
			"finished_at":   now,
		})
		if current.BatchRunID != nil {
			updates := map[string]any{"failed_count": gorm.Expr("failed_count + 1")}
			if current.Status == domain.JobQueued {
				updates["queued_count"] = decrementBatchCounter("queued_count")
			} else {
				updates["running_count"] = decrementBatchCounter("running_count")
			}
			tx.Model(&domain.BatchRun{}).Where("id = ?", *current.BatchRunID).Updates(updates)
		}
		if current.ReservedCredits <= 0 {
			return nil
		}
		refundCents := current.ReservedCredits
		return tx.Create(&domain.CreditsLedger{
			OrgID:        j.OrgID,
			DeltaCredits: current.ReservedCredits,
			DeltaCents:   &refundCents,
			Reason:       domain.ReasonRefund,
			JobID:        &j.ID,
			Note:         note,
		}).Error
	})
}

func (s *Service) Get(ctx context.Context, orgID, jobID string) (*domain.Job, error) {
	var j domain.Job
	err := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", jobID, orgID).First(&j).Error
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (s *Service) List(ctx context.Context, orgID string, limit, offset int) ([]domain.Job, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []domain.Job
	err := s.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&out).Error
	return out, err
}
