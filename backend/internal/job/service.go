package job

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/moderation"
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
	moderation *moderation.Service
	pricing    *pricingsvc.Service
	prov       provider.Provider
	queue      Enqueuer
}

func NewService(db *gorm.DB, b *billing.Service, p provider.Provider, q Enqueuer) *Service {
	return &Service{db: db, billing: b, prov: p, queue: q}
}

func (s *Service) SetSpend(sp *spend.Service)           { s.spend = sp }
func (s *Service) SetThroughput(tp *throughput.Service) { s.throughput = tp }
func (s *Service) SetModeration(ms *moderation.Service) { s.moderation = ms }
func (s *Service) SetPricing(ps *pricingsvc.Service)    { s.pricing = ps }

type CreateInput struct {
	OrgID             string
	APIKeyID          *string
	BatchRunID        *string
	SkipThroughput    bool // when true, caller has acquired throughput before enqueue
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

	// Moderation check before any billing.
	if s.moderation != nil {
		_, modErr := s.moderation.Check(ctx, moderation.CheckInput{
			OrgID:    in.OrgID,
			APIKeyID: in.APIKeyID,
			Prompt:   in.Request.Prompt,
			ImageURL: in.Request.ImageURL,
		})
		if modErr != nil {
			return nil, modErr
		}
	}

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

	// Throughput: acquire concurrency slot before enqueuing.
	// Batch submissions handle throughput externally via AcquireBatch.
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

	enqOpts := []asynq.Option{
		asynq.MaxRetry(3),
		// 15 minutes: enough to cover the provider create call (~15s) plus
		// the full polling window (MAX_POLL_MINUTES = 15). The old 30s value
		// would race with a slow upstream create and orphan the job.
		asynq.Timeout(15 * time.Minute),
	}
	if s.throughput != nil {
		qName := s.throughput.QueueForKey(ctx, in.OrgID, in.APIKeyID)
		enqOpts = append(enqOpts, asynq.Queue(qName))
	}

	payload, _ := json.Marshal(map[string]string{"job_id": job.ID})
	_, enqErr := s.queue.EnqueueContext(ctx,
		asynq.NewTask(TaskGenerate, payload),
		enqOpts...,
	)
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
		if refundErr := s.failQueuedJobAndRefund(cctx, job, "enqueue_failed", "job queue unavailable", "refund: enqueue failed"); refundErr != nil {
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
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current domain.Job
		if err := tx.Select("status, reserved_credits").First(&current, "id = ?", j.ID).Error; err != nil {
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
