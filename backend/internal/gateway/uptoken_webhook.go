package gateway

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	jobdispatcher "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	pricingsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/pricing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/seedance"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type UpTokenWebhookHandlers struct {
	DB         *gorm.DB
	Spend      *spend.Service
	Throughput *throughput.Service
	Pricing    *pricingsvc.Service
	Queue      jobdispatcher.Enqueuer
	Secret     string
}

type uptokenWebhookPayload struct {
	Event     string `json:"event"`
	TaskID    string `json:"task_id"`
	Status    string `json:"status"`
	VideoURL  string `json:"video_url"`
	Timestamp int64  `json:"timestamp"`
	Usage     *struct {
		TotalTokens int64 `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

func (h *UpTokenWebhookHandlers) Handle(c *gin.Context) {
	if h == nil || h.DB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "webhook_unavailable"}})
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	if !h.verifySignature(c, body) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_webhook", "message": "webhook signature verification failed"}})
		return
	}
	var ev uptokenWebhookPayload
	if err := json.Unmarshal(body, &ev); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	taskID := strings.TrimSpace(ev.TaskID)
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "missing task_id"}})
		return
	}
	processed, err := h.apply(c.Request.Context(), ev)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "task_not_found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "processed": processed})
}

func (h *UpTokenWebhookHandlers) verifySignature(c *gin.Context, body []byte) bool {
	secret := strings.TrimSpace(h.Secret)
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("SEEDANCE_RELAY_WEBHOOK_SECRET"))
	}
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("UPTOKEN_WEBHOOK_SECRET"))
	}
	if secret == "" {
		return false
	}
	sig := strings.TrimSpace(c.GetHeader("X-UpToken-Signature"))
	if sig == "" {
		return false
	}
	timestamp := strings.TrimSpace(c.GetHeader("X-UpToken-Timestamp"))
	if timestamp != "" {
		if ts, err := strconv.ParseInt(timestamp, 10, 64); err == nil {
			if d := time.Since(time.Unix(ts, 0)); d > 10*time.Minute || d < -10*time.Minute {
				return false
			}
		}
	}
	payloads := [][]byte{body}
	if timestamp != "" {
		payloads = append(payloads, []byte(timestamp+"."+string(body)))
	}
	for _, payload := range payloads {
		if hmacMatches(secret, payload, sig) {
			return true
		}
	}
	return false
}

func hmacMatches(secret string, payload []byte, sig string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)
	sum := mac.Sum(nil)
	normalized := strings.TrimPrefix(strings.TrimSpace(sig), "sha256=")
	if decoded, err := hex.DecodeString(normalized); err == nil {
		return subtle.ConstantTimeCompare(decoded, sum) == 1
	}
	if decoded, err := base64.StdEncoding.DecodeString(normalized); err == nil {
		return subtle.ConstantTimeCompare(decoded, sum) == 1
	}
	return false
}

func (h *UpTokenWebhookHandlers) apply(ctx context.Context, ev uptokenWebhookPayload) (bool, error) {
	var jobRow domain.Job
	var releaseOrgID string
	var releaseAPIKeyID *string
	var releaseJobID string
	var releaseReserved int64
	var batchToDispatch *string
	processed := false
	now := time.Now()

	err := h.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("provider_job_id = ?", ev.TaskID).
			First(&jobRow).Error; err != nil {
			return err
		}
		if jobRow.Status.IsTerminal() {
			return nil
		}
		releaseOrgID = jobRow.OrgID
		releaseAPIKeyID = jobRow.APIKeyID
		releaseJobID = jobRow.ID
		releaseReserved = jobRow.ReservedCredits
		batchToDispatch = jobRow.BatchRunID

		switch ev.Status {
		case "succeeded":
			upstreamActual := jobRow.ReservedCredits
			if jobRow.UpstreamEstimateCents != nil {
				upstreamActual = *jobRow.UpstreamEstimateCents
			}
			var tokens *int64
			if ev.Usage != nil && ev.Usage.TotalTokens > 0 {
				t := ev.Usage.TotalTokens
				tokens = &t
				var req provider.GenerationRequest
				if err := json.Unmarshal(jobRow.Request, &req); err == nil {
					if cents := seedance.USDCentsFromTokens(req, t); cents > 0 {
						upstreamActual = cents
					}
				}
			}
			actualQuote, err := h.finalQuote(ctx, &jobRow, upstreamActual)
			if err != nil {
				return err
			}
			actualCost := actualQuote.CustomerChargeCents
			jobUpdates := map[string]any{
				"status":       domain.JobSucceeded,
				"video_url":    stringPtr(ev.VideoURL),
				"tokens_used":  tokens,
				"cost_credits": actualCost,
				"completed_at": now,
			}
			if h.Pricing != nil {
				jobUpdates["upstream_actual_cents"] = actualQuote.UpstreamCostCents
				jobUpdates["margin_cents"] = actualQuote.MarginCents
				jobUpdates["pricing_markup_bps"] = actualQuote.MarkupBPS
				jobUpdates["pricing_source"] = actualQuote.Source
			}
			if err := tx.Model(&jobRow).Updates(jobUpdates).Error; err != nil {
				return err
			}
			delta := jobRow.ReservedCredits - actualCost
			if delta != 0 {
				deltaCents := delta
				if err := tx.Create(&domain.CreditsLedger{
					OrgID:        jobRow.OrgID,
					DeltaCredits: delta,
					DeltaCents:   &deltaCents,
					Reason:       domain.ReasonReconciliation,
					JobID:        &jobRow.ID,
					Note:         "uptoken webhook reconcile",
				}).Error; err != nil {
					return err
				}
			}
			outputJSON, _ := json.Marshal(map[string]any{"video_url": ev.VideoURL, "url": ev.VideoURL})
			videoUpdates := map[string]any{
				"status":            "succeeded",
				"output":            outputJSON,
				"actual_cost_cents": actualCost,
				"upstream_tokens":   tokens,
				"finished_at":       now,
			}
			if h.Pricing != nil {
				videoUpdates["upstream_actual_cents"] = actualQuote.UpstreamCostCents
				videoUpdates["margin_cents"] = actualQuote.MarginCents
				videoUpdates["pricing_markup_bps"] = actualQuote.MarkupBPS
				videoUpdates["pricing_source"] = actualQuote.Source
			}
			if err := tx.Model(&domain.Video{}).Where("upstream_job_id = ?", jobRow.ID).Updates(videoUpdates).Error; err != nil {
				return err
			}
			updateWorkflowRunStatus(ctx, tx, jobRow.ID, "succeeded", outputJSON)
			if jobRow.BatchRunID != nil {
				updateWebhookBatchProgress(ctx, tx, *jobRow.BatchRunID, jobRow.Status, true, now)
			}
			processed = true
		case "failed":
			code := "provider_failed"
			message := "video generation failed"
			if ev.Error != nil {
				if strings.TrimSpace(ev.Error.Code) != "" {
					code = ev.Error.Code
				}
				if strings.TrimSpace(ev.Error.Message) != "" {
					message = ev.Error.Message
				}
			}
			if err := tx.Model(&jobRow).Updates(map[string]any{
				"status":        domain.JobFailed,
				"error_code":    code,
				"error_message": message,
				"completed_at":  now,
			}).Error; err != nil {
				return err
			}
			if jobRow.ReservedCredits > 0 {
				refundCents := jobRow.ReservedCredits
				if err := tx.Create(&domain.CreditsLedger{
					OrgID:        jobRow.OrgID,
					DeltaCredits: jobRow.ReservedCredits,
					DeltaCents:   &refundCents,
					Reason:       domain.ReasonRefund,
					JobID:        &jobRow.ID,
					Note:         "uptoken webhook refund",
				}).Error; err != nil {
					return err
				}
			}
			if err := tx.Model(&domain.Video{}).Where("upstream_job_id = ?", jobRow.ID).Updates(map[string]any{
				"status":        "failed",
				"error_code":    code,
				"error_message": message,
				"finished_at":   now,
			}).Error; err != nil {
				return err
			}
			failJSON, _ := json.Marshal(map[string]any{"error_code": code, "error_message": message})
			updateWorkflowRunStatus(ctx, tx, jobRow.ID, "failed", failJSON)
			if jobRow.BatchRunID != nil {
				updateWebhookBatchProgress(ctx, tx, *jobRow.BatchRunID, jobRow.Status, false, now)
			}
			processed = true
		default:
			return nil
		}
		return nil
	})
	if err != nil || !processed {
		return processed, err
	}
	if h.Throughput != nil {
		_ = h.Throughput.ReleaseForKey(ctx, releaseOrgID, releaseAPIKeyID, releaseJobID)
	}
	if h.Spend != nil {
		h.Spend.DecrInflight(ctx, releaseOrgID, releaseReserved)
	}
	if batchToDispatch != nil {
		_, _ = jobdispatcher.DispatchBatch(ctx, h.DB, h.Spend, h.Throughput, h.Queue, *batchToDispatch)
	}
	return processed, nil
}

func stringPtr(v string) *string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return &v
}

func (h *UpTokenWebhookHandlers) finalQuote(ctx context.Context, j *domain.Job, upstreamCents int64) (pricingsvc.Quote, error) {
	markup := 0
	source := domain.PricingSourceGlobal
	if j.PricingMarkupBPS != nil {
		markup = *j.PricingMarkupBPS
	}
	if j.PricingSource != nil && *j.PricingSource != "" {
		source = *j.PricingSource
	}
	if h.Pricing == nil {
		return pricingsvc.Quote{
			UpstreamCostCents:   upstreamCents,
			CustomerChargeCents: upstreamCents,
			MarkupBPS:           markup,
			Source:              source,
			MarginCents:         0,
		}, nil
	}
	return h.Pricing.QuoteWithMarkup(ctx, upstreamCents, markup, source)
}

// updateWorkflowRunStatus mirrors job/processor.updateWorkflowRun so webhook-
// triggered completions keep the canvas/workflow audit row in sync with the
// underlying job. Best-effort: absent table or no matching row is ignored so
// legacy direct-API jobs keep working.
func updateWorkflowRunStatus(ctx context.Context, tx *gorm.DB, jobID string, status string, output json.RawMessage) {
	if tx == nil {
		return
	}
	if !tx.Migrator().HasTable(&domain.WorkflowRun{}) {
		return
	}
	updates := map[string]any{
		"status":     status,
		"updated_at": time.Now(),
	}
	if len(output) > 0 {
		updates["output_snapshot"] = output
	}
	_ = tx.WithContext(ctx).Model(&domain.WorkflowRun{}).
		Where("job_id = ? AND batch_run_id IS NULL", jobID).
		Updates(updates).Error
}

func updateWebhookBatchProgress(ctx context.Context, tx *gorm.DB, batchID string, previousStatus domain.JobStatus, succeeded bool, now time.Time) {
	updates := map[string]any{}
	if previousStatus == domain.JobQueued {
		updates["queued_count"] = decrementRequestCounter("queued_count")
	} else {
		updates["running_count"] = decrementRequestCounter("running_count")
	}
	if succeeded {
		updates["succeeded_count"] = gorm.Expr("succeeded_count + 1")
	} else {
		updates["failed_count"] = gorm.Expr("failed_count + 1")
	}
	if err := tx.WithContext(ctx).Model(&domain.BatchRun{}).Where("id = ?", batchID).Updates(updates).Error; err != nil {
		return
	}
	var br domain.BatchRun
	if err := tx.WithContext(ctx).First(&br, "id = ?", batchID).Error; err != nil {
		return
	}
	if br.QueuedCount > 0 || br.RunningCount > 0 {
		return
	}
	status := "completed"
	if br.FailedCount > 0 {
		status = "partial_failure"
	}
	if br.SucceededCount == 0 && br.FailedCount > 0 {
		status = "failed"
	}
	_ = tx.WithContext(ctx).Model(&domain.BatchRun{}).Where("id = ?", batchID).Updates(map[string]any{
		"status":       status,
		"completed_at": now,
	}).Error
	mergeStatus, mergeOutput := updateWebhookMergeJobsForBatch(ctx, tx, batchID, status, now)
	workflowStatus := "succeeded"
	if mergeStatus == "ready_for_merge" {
		workflowStatus = "merging"
	}
	if status == "failed" {
		workflowStatus = "failed"
	} else if status == "partial_failure" {
		workflowStatus = "partial_failure"
	}
	if mergeStatus == "blocked_no_clips" || mergeStatus == "merge_manifest_failed" {
		workflowStatus = "failed"
	}
	outputJSON, _ := json.Marshal(map[string]any{
		"batch_run_id":    batchID,
		"status":          status,
		"total_shots":     br.TotalShots,
		"succeeded_count": br.SucceededCount,
		"failed_count":    br.FailedCount,
		"merge_status":    mergeStatus,
		"merge":           mergeOutput,
	})
	updateBatchWorkflowRunStatus(ctx, tx, batchID, workflowStatus, outputJSON)
}

func updateWebhookMergeJobsForBatch(ctx context.Context, tx *gorm.DB, batchID string, batchStatus string, now time.Time) (string, map[string]any) {
	if !tx.Migrator().HasTable(&domain.VideoMergeJob{}) {
		return "", nil
	}
	type clipRow struct {
		JobID    string
		VideoID  string
		VideoURL string
		Status   string
	}
	var clips []clipRow
	if err := tx.WithContext(ctx).
		Table("jobs").
		Select("jobs.id AS job_id, COALESCE(videos.id, '') AS video_id, COALESCE(jobs.video_url, '') AS video_url, jobs.status AS status").
		Joins("LEFT JOIN videos ON videos.upstream_job_id = jobs.id").
		Where("jobs.batch_run_id = ?", batchID).
		Order("jobs.created_at ASC").
		Scan(&clips).Error; err != nil {
		return "merge_manifest_failed", map[string]any{"error": "failed to collect shot urls"}
	}
	output := map[string]any{"batch_run_id": batchID, "clips": clips}
	mergeStatus := "ready_for_merge"
	if batchStatus != "completed" {
		mergeStatus = "blocked_by_failed_shot"
	}
	if len(clips) == 0 {
		mergeStatus = "blocked_no_clips"
	}
	snapshot, _ := json.Marshal(output)
	res := tx.WithContext(ctx).Model(&domain.VideoMergeJob{}).
		Where("batch_run_id = ? AND status IN ?", batchID, []string{"waiting_for_shots", "ready_for_merge", "blocked_by_failed_shot"}).
		Updates(map[string]any{
			"status":          mergeStatus,
			"output_snapshot": snapshot,
			"updated_at":      now,
		})
	if res.Error != nil {
		return "merge_manifest_failed", map[string]any{"error": "failed to update merge job"}
	}
	if res.RowsAffected == 0 {
		return "", nil
	}
	return mergeStatus, output
}

func decrementRequestCounter(column string) any {
	return gorm.Expr("CASE WHEN " + column + " > 0 THEN " + column + " - 1 ELSE 0 END")
}

func updateBatchWorkflowRunStatus(ctx context.Context, tx *gorm.DB, batchID string, status string, output json.RawMessage) {
	if !tx.Migrator().HasTable(&domain.WorkflowRun{}) {
		return
	}
	updates := map[string]any{
		"status":     status,
		"updated_at": time.Now(),
	}
	if len(output) > 0 {
		updates["output_snapshot"] = output
	}
	_ = tx.WithContext(ctx).Model(&domain.WorkflowRun{}).
		Where("batch_run_id = ?", batchID).
		Updates(updates).Error
}
