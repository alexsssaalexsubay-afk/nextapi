package job

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/metrics"
	pricingsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/pricing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/seedance"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/webhook"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
)

type Processor struct {
	DB          *gorm.DB
	Billing     *billing.Service
	Spend       *spend.Service
	Prov        provider.Provider
	Queue       *asynq.Client
	Webhooks    *webhook.Service
	Throughput  *throughput.Service
	Pricing     *pricingsvc.Service
	RetryPolicy RetryPolicy
	TempStorage interface {
		Delete(ctx context.Context, key string) error
	}
}

func NewProcessor(db *gorm.DB, b *billing.Service, p provider.Provider, q *asynq.Client) *Processor {
	return &Processor{
		DB:          db,
		Billing:     b,
		Prov:        p,
		Queue:       q,
		RetryPolicy: DefaultRetryPolicy,
	}
}

type payload struct {
	JobID string `json:"job_id"`
}

// HandleGenerate calls provider.GenerateVideo, stores provider_job_id,
// flips status to running/retrying, enqueues first poll.
//
// Retry strategy:
//   - Retryable errors: update job to 'retrying', increment retry_count, return
//     error so Asynq schedules the next attempt with backoff.
//   - Non-retryable errors OR last attempt exhausted: call fail() immediately.
func (p *Processor) HandleGenerate(ctx context.Context, t *asynq.Task) error {
	retryCount, _ := asynq.GetRetryCount(ctx)
	maxRetry, _ := asynq.GetMaxRetry(ctx)
	isLastAttempt := retryCount >= maxRetry

	var pl payload
	if err := json.Unmarshal(t.Payload(), &pl); err != nil {
		return err
	}
	var j domain.Job
	if err := p.DB.WithContext(ctx).First(&j, "id = ?", pl.JobID).Error; err != nil {
		return err
	}

	// Already terminal — Asynq may call us again on dead-task sweeps.
	if j.Status.IsTerminal() {
		return nil
	}

	// Mark as submitting (first transition from queued → submitting).
	if j.Status == domain.JobQueued || j.Status == domain.JobRetrying {
		now := time.Now()
		previousStatus := j.Status
		if err := p.DB.WithContext(ctx).Model(&j).Updates(map[string]any{
			"status":        domain.JobSubmitting,
			"submitting_at": now,
		}).Error; err != nil {
			return err
		}
		if previousStatus == domain.JobQueued && j.BatchRunID != nil {
			markBatchJobStarted(ctx, p.DB, *j.BatchRunID)
		}
		p.DB.WithContext(ctx).Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(map[string]any{
			"status":     "submitting",
			"started_at": now,
		})
		j.Status = domain.JobSubmitting
	}

	var req provider.GenerationRequest
	if err := json.Unmarshal(j.Request, &req); err != nil {
		// Corrupt stored payload — hard fail, refund.
		return p.fail(ctx, &j, "invalid_request_payload", "stored job payload could not be decoded")
	}

	provStarted := time.Now()
	providerID, err := p.Prov.GenerateVideo(ctx, req)
	provLatencyMs := time.Since(provStarted).Milliseconds()

	if err != nil {
		classified := ClassifyError(err)
		p.recordUpstreamObservability(ctx, j.ID, &provider.JobStatus{
			Status:       "failed",
			ErrorCode:    &classified.Code,
			ErrorMessage: &classified.Msg,
		}, "server.submit.response", "error", "Platform rejected task")

		// Track the attempt on the job row.
		now := time.Now()
		errorUpdates := map[string]any{
			"retry_count":     retryCount + 1,
			"last_error_code": classified.Code,
			"last_error_msg":  classified.Msg,
		}
		if meta, ok := submitFailureMetadata(p.Prov.Name(), classified, retryCount+1, isLastAttempt); ok {
			errorUpdates["exec_metadata"] = meta
		}
		p.DB.WithContext(ctx).Model(&j).Updates(errorUpdates)

		if classified.Retryable && !isLastAttempt {
			// Set retrying status and let Asynq retry.
			p.DB.WithContext(ctx).Model(&j).Updates(map[string]any{
				"status":      domain.JobRetrying,
				"retrying_at": now,
			})
			p.DB.WithContext(ctx).Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(map[string]any{
				"status": "retrying",
			})
			metrics.RetryTotal.WithLabelValues(p.Prov.Name(), classified.Code).Inc()
			return err // Asynq will re-schedule with backoff
		}

		// Non-retryable or exhausted — move to dead-letter and fail.
		if j.RetryCount > 0 {
			p.archiveDLQ(ctx, &j, classified.Code, classified.Msg)
		}
		metrics.JobsFailedTotal.WithLabelValues(p.Prov.Name(), classified.Code).Inc()
		return p.fail(ctx, &j, classified.Code, submitFailureMessage(classified))
	}

	now := time.Now()
	p.recordUpstreamObservability(ctx, j.ID, &provider.JobStatus{
		Status: "queued",
	}, "server.submit.response", "success", "Platform accepted task")
	execMeta, _ := json.Marshal(map[string]any{
		"provider_latency_ms": provLatencyMs,
		"submit_attempt":      retryCount + 1,
	})
	if err := p.DB.WithContext(ctx).Model(&j).Updates(map[string]any{
		"provider_job_id": providerID,
		"status":          domain.JobRunning,
		"running_at":      now,
		"exec_metadata":   execMeta,
	}).Error; err != nil {
		return err
	}
	p.DB.WithContext(ctx).Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(map[string]any{
		"status":     "running",
		"started_at": now,
	})

	metrics.ProviderLatency.WithLabelValues(p.Prov.Name()).Observe(float64(provLatencyMs))

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
	if j.Status.IsTerminal() {
		return nil
	}
	if j.ProviderJobID == nil {
		return nil
	}
	st, err := p.Prov.GetJobStatus(ctx, *j.ProviderJobID)
	if err != nil {
		// Provider poll errors are retried by Asynq automatically
		// (MaxRetry(60)) — don't change job status here.
		metrics.RetryTotal.WithLabelValues(p.Prov.Name(), "poll_error").Inc()
		return err
	}
	eventTitle := "Task status: " + st.Status
	eventLevel := "info"
	if st.Status == "failed" {
		eventLevel = "error"
	} else if st.Status == "succeeded" {
		eventLevel = "success"
	}
	p.recordUpstreamObservability(ctx, j.ID, st, "server.poll.response", eventLevel, eventTitle)
	switch st.Status {
	case "succeeded":
		return p.succeed(ctx, &j, st)
	case "failed":
		code := "provider_failed"
		if st.ErrorCode != nil {
			code = *st.ErrorCode
		}
		msg := "video generation failed"
		if st.ErrorMessage != nil && *st.ErrorMessage != "" {
			msg = *st.ErrorMessage
		}
		metrics.JobsFailedTotal.WithLabelValues(p.Prov.Name(), code).Inc()
		return p.fail(ctx, &j, code, msg)
	default:
		// Still running → re-enqueue poll
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
	now := time.Now()

	// Reconcile final customer charge from actual upstream tokens when the
	// provider reports them. Stored markup/source keep in-flight jobs stable if
	// an operator changes global pricing while a generation is running.
	var req provider.GenerationRequest
	var videoSeconds *float64
	if len(j.Request) > 0 {
		if err := json.Unmarshal(j.Request, &req); err == nil && req.DurationSeconds > 0 {
			vs := float64(req.DurationSeconds)
			videoSeconds = &vs
		}
	}
	upstreamActual := j.ReservedCredits
	if j.UpstreamEstimateCents != nil {
		upstreamActual = *j.UpstreamEstimateCents
	}
	if st.ActualTokensUsed != nil && *st.ActualTokensUsed > 0 {
		if usdCents := seedance.USDCentsFromTokens(req, *st.ActualTokensUsed); usdCents > 0 {
			upstreamActual = usdCents
		}
	}
	actualQuote, err := p.finalQuote(ctx, j, upstreamActual)
	if err != nil {
		return err
	}
	actualCredits := actualQuote.CustomerChargeCents
	err = p.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		jobUpdates := map[string]any{
			"status":       domain.JobSucceeded,
			"video_url":    st.VideoURL,
			"tokens_used":  st.ActualTokensUsed,
			"cost_credits": actualCredits,
			"completed_at": now,
		}
		if p.Pricing != nil {
			jobUpdates["upstream_actual_cents"] = actualQuote.UpstreamCostCents
			jobUpdates["margin_cents"] = actualQuote.MarginCents
			jobUpdates["pricing_markup_bps"] = actualQuote.MarkupBPS
			jobUpdates["pricing_source"] = actualQuote.Source
		}
		if err := tx.Model(j).Updates(jobUpdates).Error; err != nil {
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
		videoUpdates := map[string]any{
			"status":            "succeeded",
			"output":            outputJSON,
			"actual_cost_cents": actualCredits,
			"upstream_tokens":   st.ActualTokensUsed,
			"video_seconds":     videoSeconds,
			"finished_at":       now,
		}
		if p.Pricing != nil {
			videoUpdates["upstream_actual_cents"] = actualQuote.UpstreamCostCents
			videoUpdates["margin_cents"] = actualQuote.MarginCents
			videoUpdates["pricing_markup_bps"] = actualQuote.MarkupBPS
			videoUpdates["pricing_source"] = actualQuote.Source
		}
		if err := tx.Model(&domain.Video{}).Where("upstream_job_id = ?", j.ID).Updates(videoUpdates).Error; err != nil {
			return err
		}
		updateWorkflowRun(ctx, tx, j.ID, "succeeded", outputJSON)
		// Update batch counters if this job belongs to a batch.
		if j.BatchRunID != nil {
			tx.Model(&domain.BatchRun{}).Where("id = ?", *j.BatchRunID).
				Updates(map[string]any{
					"succeeded_count": gorm.Expr("succeeded_count + 1"),
					"running_count":   decrementCounter("running_count"),
				})
			p.maybeCloseBatch(ctx, tx, *j.BatchRunID)
		}
		return nil
	})
	if p.Throughput != nil {
		_ = p.Throughput.ReleaseForKey(ctx, j.OrgID, j.APIKeyID, j.ID)
	}
	if p.Spend != nil {
		p.Spend.DecrInflight(ctx, j.OrgID, j.ReservedCredits)
	}
	if err == nil {
		if j.BatchRunID != nil {
			_, _ = DispatchBatch(ctx, p.DB, p.Spend, p.Throughput, p.Queue, *j.BatchRunID)
		}
		p.cleanupTempMedia(ctx, j)
		metrics.JobsTotal.WithLabelValues(p.Prov.Name(), "succeeded").Inc()
		if p.Webhooks != nil {
			videoID := lookupVideoID(ctx, p.DB, j.ID)
			_ = p.Webhooks.Enqueue(ctx, j.OrgID, "job.succeeded", map[string]any{
				"id":           videoID,
				"job_id":       j.ID,
				"video_id":     videoID,
				"status":       "succeeded",
				"video_url":    st.VideoURL,
				"cost_credits": actualCredits,
				"created_at":   now.UTC().Format(time.RFC3339),
			})
		}
	}
	return err
}

func (p *Processor) finalQuote(ctx context.Context, j *domain.Job, upstreamCents int64) (pricingsvc.Quote, error) {
	markup := 0
	source := domain.PricingSourceGlobal
	if j.PricingMarkupBPS != nil {
		markup = *j.PricingMarkupBPS
	}
	if j.PricingSource != nil && *j.PricingSource != "" {
		source = *j.PricingSource
	}
	if p.Pricing == nil {
		return pricingsvc.Quote{
			UpstreamCostCents:   upstreamCents,
			CustomerChargeCents: upstreamCents,
			MarkupBPS:           markup,
			Source:              source,
			MarginCents:         0,
		}, nil
	}
	return p.Pricing.QuoteWithMarkup(ctx, upstreamCents, markup, source)
}

// lookupVideoID returns the UUID of the videos row whose upstream_job_id
// equals jobID, or jobID itself when no video row exists (legacy callers).
func lookupVideoID(ctx context.Context, db *gorm.DB, jobID string) string {
	var v struct{ ID string }
	if err := db.WithContext(ctx).
		Table("videos").Select("id").
		Where("upstream_job_id = ?", jobID).
		Limit(1).Scan(&v).Error; err == nil && v.ID != "" {
		return v.ID
	}
	return jobID
}

func markBatchJobStarted(ctx context.Context, db *gorm.DB, batchID string) {
	_ = db.WithContext(ctx).Model(&domain.BatchRun{}).
		Where("id = ?", batchID).
		Updates(map[string]any{
			"queued_count":  decrementCounter("queued_count"),
			"running_count": gorm.Expr("running_count + 1"),
		}).Error
}

func decrementCounter(column string) any {
	return gorm.Expr("CASE WHEN " + column + " > 0 THEN " + column + " - 1 ELSE 0 END")
}

func updateWorkflowRun(ctx context.Context, tx *gorm.DB, jobID string, status string, output json.RawMessage) {
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

func updateBatchWorkflowRun(ctx context.Context, tx *gorm.DB, batchID string, status string, output json.RawMessage) {
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

func (p *Processor) recordUpstreamObservability(ctx context.Context, jobID string, st *provider.JobStatus, eventName string, level string, title string) {
	if st == nil {
		return
	}
	var video domain.Video
	if err := p.DB.WithContext(ctx).Where("upstream_job_id = ?", jobID).First(&video).Error; err != nil {
		return
	}
	metadata, changed := mergeObservabilityMetadata(video.Metadata, st, eventName, level, title)
	if !changed {
		return
	}
	_ = p.DB.WithContext(ctx).Model(&domain.Video{}).
		Where("id = ?", video.ID).
		Update("metadata", metadata).Error
}

func mergeObservabilityMetadata(raw json.RawMessage, st *provider.JobStatus, eventName string, level string, title string) (json.RawMessage, bool) {
	root := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &root)
	}
	obs, _ := root["upstream_observability"].(map[string]any)
	if obs == nil {
		obs = map[string]any{}
	}
	if len(st.RequestSummary) > 0 {
		var summary any
		if json.Unmarshal(st.RequestSummary, &summary) == nil {
			obs["request_summary"] = summary
		}
	}
	if len(st.SubmitPayload) > 0 {
		var payload any
		if json.Unmarshal(st.SubmitPayload, &payload) == nil {
			obs["submit_payload"] = payload
		}
	}
	current := map[string]any{
		"status":     st.Status,
		"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
	}
	if st.Progress != nil {
		current["progress"] = *st.Progress
	}
	if st.BillableQuantity != nil {
		current["billable_quantity"] = *st.BillableQuantity
	}
	if st.BillableUnit != nil && strings.TrimSpace(*st.BillableUnit) != "" {
		current["billable_unit"] = *st.BillableUnit
	}
	if st.StoredError != nil && strings.TrimSpace(*st.StoredError) != "" {
		current["stored_error"] = *st.StoredError
	}
	if st.ErrorCode != nil || st.ErrorMessage != nil {
		errObj := map[string]any{}
		if st.ErrorCode != nil {
			errObj["code"] = *st.ErrorCode
		}
		if st.ErrorMessage != nil {
			errObj["message"] = *st.ErrorMessage
		}
		current["error"] = errObj
	}
	if len(st.Debug) > 0 {
		var debug any
		if json.Unmarshal(st.Debug, &debug) == nil {
			current["debug"] = debug
			obs["debug"] = debug
		}
	}
	obs["current"] = current

	events := coerceObservabilityEvents(obs["events"])
	eventPayload := map[string]any{"status": st.Status}
	if st.Progress != nil {
		eventPayload["progress"] = *st.Progress
	}
	if st.BillableQuantity != nil {
		eventPayload["billable_quantity"] = *st.BillableQuantity
	}
	if st.BillableUnit != nil && strings.TrimSpace(*st.BillableUnit) != "" {
		eventPayload["billable_unit"] = *st.BillableUnit
	}
	if st.ErrorCode != nil {
		eventPayload["error_code"] = *st.ErrorCode
	}
	if st.ErrorMessage != nil {
		eventPayload["error_message"] = *st.ErrorMessage
	}
	if st.StoredError != nil && strings.TrimSpace(*st.StoredError) != "" {
		eventPayload["stored_error"] = *st.StoredError
	}
	if len(st.RequestSummary) > 0 {
		var summary any
		if json.Unmarshal(st.RequestSummary, &summary) == nil {
			eventPayload["request_summary"] = summary
		}
	}
	if len(st.SubmitPayload) > 0 {
		var payload any
		if json.Unmarshal(st.SubmitPayload, &payload) == nil {
			eventPayload["submit_payload"] = payload
		}
	}
	events = append(events, map[string]any{
		"ts":      time.Now().UTC().Format(time.RFC3339Nano),
		"event":   eventName,
		"level":   level,
		"title":   title,
		"payload": eventPayload,
	})
	if len(events) > 30 {
		events = events[len(events)-30:]
	}
	obs["events"] = events
	root["upstream_observability"] = obs
	b, err := json.Marshal(root)
	if err != nil {
		return raw, false
	}
	return b, true
}

func coerceObservabilityEvents(raw any) []map[string]any {
	items, ok := raw.([]any)
	if !ok {
		return []map[string]any{}
	}
	events := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if event, ok := item.(map[string]any); ok {
			events = append(events, event)
		}
	}
	return events
}

func (p *Processor) fail(ctx context.Context, j *domain.Job, code, msg string) error {
	// Idempotency guard — if already in a terminal state, skip.
	if j.Status.IsTerminal() {
		return nil
	}
	now := time.Now()
	err := p.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Re-check status inside transaction to avoid double-refund.
		var current domain.Job
		if err := tx.Select("status, reserved_credits").First(&current, "id = ?", j.ID).Error; err != nil {
			return err
		}
		if current.Status.IsTerminal() {
			return nil
		}
		if err := tx.Model(j).Updates(map[string]any{
			"status":        domain.JobFailed,
			"error_code":    code,
			"error_message": msg,
			"completed_at":  now,
		}).Error; err != nil {
			return err
		}
		if current.ReservedCredits > 0 {
			refundCents := current.ReservedCredits
			if err := tx.Create(&domain.CreditsLedger{
				OrgID:        j.OrgID,
				DeltaCredits: current.ReservedCredits,
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
		outputJSON, _ := json.Marshal(map[string]any{"error_code": code, "error_message": msg})
		updateWorkflowRun(ctx, tx, j.ID, "failed", outputJSON)
		// Update batch counters.
		if j.BatchRunID != nil {
			updates := map[string]any{"failed_count": gorm.Expr("failed_count + 1")}
			if current.Status == domain.JobQueued {
				updates["queued_count"] = decrementCounter("queued_count")
			} else {
				updates["running_count"] = decrementCounter("running_count")
			}
			tx.Model(&domain.BatchRun{}).Where("id = ?", *j.BatchRunID).Updates(updates)
			p.maybeCloseBatch(ctx, tx, *j.BatchRunID)
		}
		return nil
	})
	if p.Throughput != nil {
		_ = p.Throughput.ReleaseForKey(ctx, j.OrgID, j.APIKeyID, j.ID)
	}
	if p.Spend != nil {
		p.Spend.DecrInflight(ctx, j.OrgID, j.ReservedCredits)
	}
	if err == nil {
		if j.BatchRunID != nil {
			_, _ = DispatchBatch(ctx, p.DB, p.Spend, p.Throughput, p.Queue, *j.BatchRunID)
		}
		p.cleanupTempMedia(ctx, j)
		if p.Webhooks != nil {
			videoID := lookupVideoID(ctx, p.DB, j.ID)
			_ = p.Webhooks.Enqueue(ctx, j.OrgID, "job.failed", map[string]any{
				"id":            videoID,
				"job_id":        j.ID,
				"video_id":      videoID,
				"status":        "failed",
				"error_code":    code,
				"error_message": msg,
				"created_at":    now.UTC().Format(time.RFC3339),
			})
		}
	}
	return err
}

func submitFailureMessage(classified *RetryError) string {
	if classified == nil {
		return "video generation failed"
	}
	if isStructuredProviderError(classified) {
		return classified.Msg
	}
	if classified.Retryable {
		return "video generation failed after retries"
	}
	return "video generation request was rejected"
}

func isStructuredProviderError(classified *RetryError) bool {
	if classified == nil || strings.TrimSpace(classified.Msg) == "" {
		return false
	}
	return strings.TrimSpace(classified.Type) != "" || strings.HasPrefix(strings.TrimSpace(classified.Code), "error-")
}

func submitFailureMetadata(providerName string, classified *RetryError, attempt int, exhausted bool) ([]byte, bool) {
	if classified == nil {
		return nil, false
	}
	meta := map[string]any{
		"last_provider_error": map[string]any{
			"provider":  providerName,
			"code":      classified.Code,
			"message":   classified.Msg,
			"type":      classified.Type,
			"retryable": classified.Retryable,
			"attempt":   attempt,
			"exhausted": exhausted,
		},
	}
	b, err := json.Marshal(meta)
	if err != nil {
		return nil, false
	}
	return b, true
}

func (p *Processor) cleanupTempMedia(ctx context.Context, j *domain.Job) {
	if p.TempStorage == nil || len(j.Request) == 0 {
		return
	}
	var req provider.GenerationRequest
	if err := json.Unmarshal(j.Request, &req); err != nil || len(req.TempMediaKeys) == 0 {
		return
	}
	requiredPrefix := "temp/" + j.OrgID + "/"
	for _, key := range req.TempMediaKeys {
		if key == "" || !strings.HasPrefix(key, requiredPrefix) {
			continue
		}
		_ = p.TempStorage.Delete(ctx, key)
	}
}

// archiveDLQ moves an exhausted-retry job to the dead-letter queue.
func (p *Processor) archiveDLQ(ctx context.Context, j *domain.Job, code, lastErr string) {
	dlq := domain.DeadLetterJob{
		JobID:      j.ID,
		OrgID:      j.OrgID,
		Reason:     code,
		RetryCount: j.RetryCount,
		LastError:  &lastErr,
		ArchivedAt: time.Now(),
	}
	// Best-effort; if this fails the job still transitions to failed.
	if err := p.DB.WithContext(ctx).Clauses().Create(&dlq).Error; err == nil {
		metrics.DeadLetterTotal.WithLabelValues(p.Prov.Name(), code).Inc()
	}
}

// maybeCloseBatch checks whether all jobs in a batch have reached a
// terminal state and if so closes the batch run.
func (p *Processor) maybeCloseBatch(ctx context.Context, tx *gorm.DB, batchID string) {
	var br domain.BatchRun
	if err := tx.First(&br, "id = ?", batchID).Error; err != nil {
		return
	}
	// A batch is complete when queued + running == 0.
	if br.QueuedCount > 0 || br.RunningCount > 0 {
		return
	}
	now := time.Now()
	status := "completed"
	if br.FailedCount > 0 {
		status = "partial_failure"
	}
	if br.SucceededCount == 0 && br.FailedCount > 0 {
		status = "failed"
	}
	tx.Model(&domain.BatchRun{}).Where("id = ?", batchID).Updates(map[string]any{
		"status":       status,
		"completed_at": now,
	})
	mergeStatus, mergeOutput := updateMergeJobsForBatch(ctx, tx, batchID, status, now)
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
	output, _ := json.Marshal(map[string]any{
		"batch_run_id":    batchID,
		"status":          status,
		"total_shots":     br.TotalShots,
		"succeeded_count": br.SucceededCount,
		"failed_count":    br.FailedCount,
		"merge_status":    mergeStatus,
		"merge":           mergeOutput,
	})
	updateBatchWorkflowRun(ctx, tx, batchID, workflowStatus, output)
	// Fire batch.completed webhook.
	if p.Webhooks != nil {
		_ = p.Webhooks.Enqueue(ctx, br.OrgID, "batch.completed", map[string]any{
			"batch_id":        batchID,
			"status":          status,
			"total_shots":     br.TotalShots,
			"succeeded_count": br.SucceededCount,
			"failed_count":    br.FailedCount,
			"completed_at":    now.UTC().Format(time.RFC3339),
		})
	}
}

func updateMergeJobsForBatch(ctx context.Context, tx *gorm.DB, batchID string, batchStatus string, now time.Time) (string, map[string]any) {
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
	output := map[string]any{
		"batch_run_id": batchID,
		"clips":        clips,
	}
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
