package job

import (
	"context"
	"encoding/json"
	"time"

	"github.com/hibiken/asynq"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/provider"
	"github.com/sanidg/nextapi/backend/internal/spend"
	"github.com/sanidg/nextapi/backend/internal/throughput"
	"github.com/sanidg/nextapi/backend/internal/webhook"
	"gorm.io/gorm"
)

type Processor struct {
	DB         *gorm.DB
	Billing    *billing.Service
	Spend      *spend.Service
	Prov       provider.Provider
	Queue      *asynq.Client
	Webhooks   *webhook.Service
	Throughput *throughput.Service
}

type payload struct {
	JobID string `json:"job_id"`
}

// HandleGenerate calls provider.GenerateVideo, stores provider_job_id,
// flips status to running, enqueues first poll.
func (p *Processor) HandleGenerate(ctx context.Context, t *asynq.Task) error {
	var pl payload
	if err := json.Unmarshal(t.Payload(), &pl); err != nil {
		return err
	}
	var j domain.Job
	if err := p.DB.WithContext(ctx).First(&j, "id = ?", pl.JobID).Error; err != nil {
		return err
	}
	var req provider.GenerationRequest
	_ = json.Unmarshal(j.Request, &req)

	providerID, err := p.Prov.GenerateVideo(ctx, req)
	if err != nil {
		return p.fail(ctx, &j, "provider_error", "video generation failed")
	}
	now := time.Now()
	if err := p.DB.WithContext(ctx).Model(&j).Updates(map[string]any{
		"provider_job_id": providerID,
		"status":          domain.JobRunning,
	}).Error; err != nil {
		return err
	}
	p.DB.WithContext(ctx).Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(map[string]any{
		"status":     "running",
		"started_at": now,
	})
	buf, _ := json.Marshal(payload{JobID: j.ID})
	_, err = p.Queue.EnqueueContext(ctx,
		asynq.NewTask(TaskPoll, buf),
		asynq.ProcessIn(10*time.Second),
		asynq.MaxRetry(60),
	)
	return err
}

// HandlePoll fetches provider status; on terminal, reconciles credits.
func (p *Processor) HandlePoll(ctx context.Context, t *asynq.Task) error {
	var pl payload
	if err := json.Unmarshal(t.Payload(), &pl); err != nil {
		return err
	}
	var j domain.Job
	if err := p.DB.WithContext(ctx).First(&j, "id = ?", pl.JobID).Error; err != nil {
		return err
	}
	if j.Status == domain.JobSucceeded || j.Status == domain.JobFailed {
		return nil
	}
	if j.ProviderJobID == nil {
		return nil
	}
	st, err := p.Prov.GetJobStatus(ctx, *j.ProviderJobID)
	if err != nil {
		return err
	}
	switch st.Status {
	case "succeeded":
		return p.succeed(ctx, &j, st)
	case "failed":
		code := "provider_failed"
		if st.ErrorCode != nil {
			code = *st.ErrorCode
		}
		return p.fail(ctx, &j, code, "video generation failed")
	default:
		// still running → re-enqueue poll
		buf, _ := json.Marshal(payload{JobID: j.ID})
		_, err = p.Queue.EnqueueContext(ctx,
			asynq.NewTask(TaskPoll, buf),
			asynq.ProcessIn(10*time.Second),
			asynq.MaxRetry(60),
		)
		return err
	}
}

func (p *Processor) succeed(ctx context.Context, j *domain.Job, st *provider.JobStatus) error {
	actualCredits := j.ReservedCredits
	if st.ActualTokensUsed != nil {
		actualCredits = *st.ActualTokensUsed
	}
	now := time.Now()
	err := p.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(j).Updates(map[string]any{
			"status":       domain.JobSucceeded,
			"video_url":    st.VideoURL,
			"tokens_used":  st.ActualTokensUsed,
			"cost_credits": actualCredits,
			"completed_at": now,
		}).Error; err != nil {
			return err
		}
		delta := j.ReservedCredits - actualCredits
		if delta != 0 {
			deltaCents := delta
			if err := tx.Create(&domain.CreditsLedger{
				OrgID:        j.OrgID,
				DeltaCredits: delta,
				DeltaCents:   &deltaCents,
				Reason:       domain.ReasonReconciliation,
				JobID:        &j.ID,
				Note:         "reconcile",
			}).Error; err != nil {
				return err
			}
		}
		outputJSON, _ := json.Marshal(map[string]any{"video_url": st.VideoURL})
		tx.Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(map[string]any{
			"status":           "succeeded",
			"output":           outputJSON,
			"actual_cost_cents": actualCredits,
			"upstream_tokens":  st.ActualTokensUsed,
			"finished_at":     now,
		})
		return nil
	})
	if p.Throughput != nil {
		_ = p.Throughput.ReleaseForKey(ctx, j.OrgID, j.APIKeyID, j.ID)
	}
	if p.Spend != nil {
		p.Spend.DecrInflight(ctx, j.OrgID, j.ReservedCredits)
	}
	if err == nil && p.Webhooks != nil {
		// Carry both job_id (legacy SDK contract) and video_id (current /v1/videos
		// surface) so customers on either generation of the SDK can pick up the
		// event without code change.
		_ = p.Webhooks.Enqueue(ctx, j.OrgID, "job.succeeded", map[string]any{
			"id":           j.ID,
			"job_id":       j.ID,
			"video_id":     j.ID,
			"status":       "succeeded",
			"video_url":    st.VideoURL,
			"cost_credits": actualCredits,
			"created_at":   now.UTC().Format(time.RFC3339),
		})
	}
	return err
}

func (p *Processor) fail(ctx context.Context, j *domain.Job, code, msg string) error {
	now := time.Now()
	err := p.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(j).Updates(map[string]any{
			"status":        domain.JobFailed,
			"error_code":    code,
			"error_message": msg,
			"completed_at":  now,
		}).Error; err != nil {
			return err
		}
		if j.ReservedCredits > 0 {
			refundCents := j.ReservedCredits
			if err := tx.Create(&domain.CreditsLedger{
				OrgID:        j.OrgID,
				DeltaCredits: j.ReservedCredits,
				DeltaCents:   &refundCents,
				Reason:       domain.ReasonRefund,
				JobID:        &j.ID,
				Note:         "refund on failure",
			}).Error; err != nil {
				return err
			}
		}
		tx.Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(map[string]any{
			"status":        "failed",
			"error_code":    code,
			"error_message": msg,
			"finished_at":   now,
		})
		return nil
	})
	if p.Throughput != nil {
		_ = p.Throughput.ReleaseForKey(ctx, j.OrgID, j.APIKeyID, j.ID)
	}
	if p.Spend != nil {
		p.Spend.DecrInflight(ctx, j.OrgID, j.ReservedCredits)
	}
	if err == nil && p.Webhooks != nil {
		_ = p.Webhooks.Enqueue(ctx, j.OrgID, "job.failed", map[string]any{
			"id":            j.ID,
			"job_id":        j.ID,
			"video_id":      j.ID,
			"status":        "failed",
			"error_code":    code,
			"error_message": msg,
			"created_at":    now.UTC().Format(time.RFC3339),
		})
	}
	return err
}
