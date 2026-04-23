package billing

import (
	"context"
	"log"
	"time"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

// ReconcileService scans for jobs/videos that are stuck (status =
// queued/running, no upstream activity for > stuckAfter) and treats
// them as failed: refund the reservation, mark the row failed, fire
// a job.failed webhook so the customer doesn't think we hung.
//
// Why this exists: workers can crash mid-flight (OOM, SIGKILL, k8s
// pod evicted), provider can stop responding, or asynq retries can be
// exhausted silently. Without reconciliation those reservations sit
// forever on the org's balance, eating their concurrency cap and
// confusing the customer ("why does my dashboard say 12 jobs running
// when nothing's happening?").
type ReconcileService struct {
	DB         *gorm.DB
	Billing    *Service
	Hooks      WebhookEnqueuer
	StuckAfter time.Duration
}

// WebhookEnqueuer is the subset of webhook.Service we depend on. Kept
// as an interface so unit tests don't need a real webhook backend.
type WebhookEnqueuer interface {
	Enqueue(ctx context.Context, orgID, eventType string, payload any) error
}

// Run scans once. Call from a ticker.
func (r *ReconcileService) Run(ctx context.Context) error {
	stuckAfter := r.StuckAfter
	if stuckAfter <= 0 {
		stuckAfter = 1 * time.Hour
	}
	cutoff := time.Now().Add(-stuckAfter)

	var jobs []domain.Job
	// jobs table doesn't carry a started_at column (only videos does);
	// fall back to created_at as the staleness floor.
	if err := r.DB.WithContext(ctx).
		Where("status IN ('queued','running') AND created_at < ?", cutoff).
		Limit(500).Find(&jobs).Error; err != nil {
		return err
	}
	if len(jobs) == 0 {
		return nil
	}
	log.Printf("reconcile: found %d stuck jobs older than %s", len(jobs), stuckAfter)

	for _, j := range jobs {
		_ = r.fail(ctx, &j)
	}
	return nil
}

func (r *ReconcileService) fail(ctx context.Context, j *domain.Job) error {
	now := time.Now()
	const code = "stuck_job"
	const msg = "job exceeded the maximum execution window and was reconciled by the system"

	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Re-check inside the txn — another worker may have just resolved it.
		var fresh domain.Job
		if err := tx.Where("id = ?", j.ID).First(&fresh).Error; err != nil {
			return err
		}
		if fresh.Status != domain.JobQueued && fresh.Status != domain.JobRunning {
			return nil
		}
		if err := tx.Model(&fresh).Updates(map[string]any{
			"status":        domain.JobFailed,
			"error_code":    code,
			"error_message": msg,
			"completed_at":  now,
		}).Error; err != nil {
			return err
		}
		if fresh.ReservedCredits > 0 {
			refundCents := fresh.ReservedCredits
			if err := tx.Create(&domain.CreditsLedger{
				OrgID:        fresh.OrgID,
				DeltaCredits: fresh.ReservedCredits,
				DeltaCents:   &refundCents,
				Reason:       domain.ReasonRefund,
				JobID:        &fresh.ID,
				Note:         "auto-refund: " + code,
			}).Error; err != nil {
				return err
			}
		}
		// Mirror the failure to the videos table if a row exists.
		tx.Model(&domain.Video{}).Where("upstream_job_id = ?", fresh.ID).Updates(map[string]any{
			"status":        "failed",
			"error_code":    code,
			"error_message": msg,
			"finished_at":   now,
		})
		return nil
	})
	if err != nil {
		log.Printf("reconcile: failed to recover job %s: %v", j.ID, err)
		return err
	}
	if r.Hooks != nil {
		_ = r.Hooks.Enqueue(ctx, j.OrgID, "job.failed", map[string]any{
			"id":            j.ID,
			"job_id":        j.ID,
			"video_id":      j.ID,
			"status":        "failed",
			"error_code":    code,
			"error_message": msg,
			"reconciled":    true,
		})
	}
	return nil
}
