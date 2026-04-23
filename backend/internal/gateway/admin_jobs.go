package gateway

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/infra/httpx"
	"github.com/sanidg/nextapi/backend/internal/job"
	"github.com/sanidg/nextapi/backend/internal/provider"
	"gorm.io/gorm"
)

// AdminJobHandlers provides operator-facing job management endpoints.
// All routes require AdminMiddleware authentication.
type AdminJobHandlers struct {
	DB      *gorm.DB
	JobSvc  *job.Service
	Billing *billing.Service
}

// GET /v1/internal/admin/jobs
//
// Query params:
//
//	org_id         filter by org
//	status         comma-separated statuses (queued,running,failed,...)
//	provider       filter by provider name
//	batch_run_id   filter by batch
//	error_code     filter by specific error code
//	from           ISO8601 timestamp (created_at >=)
//	to             ISO8601 timestamp (created_at <=)
//	limit          1–200, default 50
//	offset
func (h *AdminJobHandlers) ListJobs(c *gin.Context) {
	q := h.DB.WithContext(c.Request.Context()).Model(&domain.Job{}).Order("created_at DESC")

	if orgID := c.Query("org_id"); orgID != "" {
		q = q.Where("org_id = ?", orgID)
	}
	if statuses := c.QueryArray("status"); len(statuses) > 0 {
		q = q.Where("status IN ?", statuses)
	}
	if provider := c.Query("provider"); provider != "" {
		q = q.Where("provider = ?", provider)
	}
	if batchRunID := c.Query("batch_run_id"); batchRunID != "" {
		q = q.Where("batch_run_id = ?", batchRunID)
	}
	if errCode := c.Query("error_code"); errCode != "" {
		q = q.Where("error_code = ? OR last_error_code = ?", errCode, errCode)
	}
	if from := c.Query("from"); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err == nil {
			q = q.Where("created_at >= ?", t)
		}
	}
	if to := c.Query("to"); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err == nil {
			q = q.Where("created_at <= ?", t)
		}
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	var total int64
	q.Count(&total)

	var jobs []domain.Job
	if err := q.Limit(limit).Offset(offset).Find(&jobs).Error; err != nil {
		httpx.InternalError(c, "admin_jobs_query_failed", "failed to query jobs")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":   jobs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GET /v1/internal/admin/jobs/:id
func (h *AdminJobHandlers) GetJob(c *gin.Context) {
	jobID := c.Param("id")
	var j domain.Job
	if err := h.DB.WithContext(c.Request.Context()).First(&j, "id = ?", jobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFoundCode(c, "job_not_found", "job not found")
			return
		}
		httpx.InternalError(c, "admin_job_get_failed", "failed to retrieve job")
		return
	}
	c.JSON(http.StatusOK, j)
}

// POST /v1/internal/admin/jobs/:id/retry
//
// Re-enqueues a failed or timed-out job with the original request payload.
// Credits are re-reserved; if the org has insufficient balance the retry
// is rejected. A new job is created (original is left as-is for audit trail).
func (h *AdminJobHandlers) RetryJob(c *gin.Context) {
	jobID := c.Param("id")

	var j domain.Job
	if err := h.DB.WithContext(c.Request.Context()).First(&j, "id = ?", jobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFoundCode(c, "job_not_found", "job not found")
			return
		}
		httpx.InternalError(c, "admin_job_get_failed", "failed to retrieve job")
		return
	}

	if !j.Status.IsRetryable() {
		httpx.BadRequest(c, "job_not_retryable",
			"only failed or timed_out jobs can be retried; current status: "+string(j.Status))
		return
	}

	var req job.CreateInput
	if err := unmarshalJobRequest(j, &req); err != nil {
		httpx.InternalError(c, "job_payload_corrupt", "original job payload could not be decoded")
		return
	}
	req.OrgID = j.OrgID
	req.APIKeyID = j.APIKeyID
	req.BatchRunID = j.BatchRunID

	result, err := h.JobSvc.Create(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, job.ErrInsufficient) {
			httpx.PaymentRequired(c, "insufficient_credits", "organisation has insufficient credits for retry")
			return
		}
		httpx.InternalError(c, "retry_failed", "failed to enqueue retry")
		return
	}

	RecordAudit(c.Request.Context(), h.DB, c, "admin.job.retry", "job", jobID,
		map[string]any{"new_job_id": result.JobID, "original_job_id": jobID})

	c.JSON(http.StatusOK, gin.H{
		"original_job_id": jobID,
		"new_job_id":      result.JobID,
		"status":          result.Status,
	})
}

// POST /v1/internal/admin/jobs/:id/cancel
//
// Cancels a queued or running job. Credits are refunded.
func (h *AdminJobHandlers) CancelJob(c *gin.Context) {
	jobID := c.Param("id")

	var j domain.Job
	if err := h.DB.WithContext(c.Request.Context()).First(&j, "id = ?", jobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFoundCode(c, "job_not_found", "job not found")
			return
		}
		httpx.InternalError(c, "admin_job_get_failed", "failed to retrieve job")
		return
	}

	if j.Status.IsTerminal() {
		httpx.BadRequest(c, "job_already_terminal",
			"job is already in a terminal state: "+string(j.Status))
		return
	}

	now := time.Now()
	err := h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&j).Updates(map[string]any{
			"status":       domain.JobCanceled,
			"canceled_at":  now,
			"completed_at": now,
			"error_code":   "admin_canceled",
			"error_message": "canceled by operator",
		}).Error; err != nil {
			return err
		}
		if j.ReservedCredits > 0 {
			refundCents := j.ReservedCredits
			return tx.Create(&domain.CreditsLedger{
				OrgID:        j.OrgID,
				DeltaCredits: j.ReservedCredits,
				DeltaCents:   &refundCents,
				Reason:       domain.ReasonRefund,
				JobID:        &j.ID,
				Note:         "refund: admin canceled",
			}).Error
		}
		return nil
	})
	if err != nil {
		httpx.InternalError(c, "cancel_failed", "failed to cancel job")
		return
	}

	RecordAudit(c.Request.Context(), h.DB, c, "admin.job.cancel", "job", jobID, nil)

	c.JSON(http.StatusOK, gin.H{"id": jobID, "status": "canceled"})
}

// GET /v1/internal/admin/request-logs
//
// Query params: org_id, job_id, from, to, status, limit, offset
func (h *AdminJobHandlers) ListRequestLogs(c *gin.Context) {
	q := h.DB.WithContext(c.Request.Context()).Model(&domain.RequestLog{}).Order("created_at DESC")

	if orgID := c.Query("org_id"); orgID != "" {
		q = q.Where("org_id = ?", orgID)
	}
	if jobID := c.Query("job_id"); jobID != "" {
		q = q.Where("job_id = ?", jobID)
	}
	if statusStr := c.Query("status"); statusStr != "" {
		s, err := strconv.Atoi(statusStr)
		if err == nil {
			q = q.Where("response_status = ?", s)
		}
	}
	if from := c.Query("from"); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err == nil {
			q = q.Where("created_at >= ?", t)
		}
	}
	if to := c.Query("to"); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err == nil {
			q = q.Where("created_at <= ?", t)
		}
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	var total int64
	q.Count(&total)

	var logs []domain.RequestLog
	if err := q.Limit(limit).Offset(offset).Find(&logs).Error; err != nil {
		httpx.InternalError(c, "request_logs_query_failed", "failed to query request logs")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":   logs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GET /v1/internal/admin/dead-letter
func (h *AdminJobHandlers) ListDeadLetter(c *gin.Context) {
	q := h.DB.WithContext(c.Request.Context()).Model(&domain.DeadLetterJob{}).Order("archived_at DESC")
	if orgID := c.Query("org_id"); orgID != "" {
		q = q.Where("org_id = ?", orgID)
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	var total int64
	q.Count(&total)

	var rows []domain.DeadLetterJob
	if err := q.Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		httpx.InternalError(c, "dlq_query_failed", "failed to query dead-letter queue")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":   rows,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// POST /v1/internal/admin/dead-letter/:id/replay
//
// Replays a dead-letter job by creating a new job with the same payload.
func (h *AdminJobHandlers) ReplayDeadLetter(c *gin.Context) {
	dlqIDStr := c.Param("id")
	dlqID, err := strconv.ParseInt(dlqIDStr, 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid_id", "dead-letter ID must be an integer")
		return
	}

	var dlq domain.DeadLetterJob
	if err := h.DB.WithContext(c.Request.Context()).First(&dlq, dlqID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFoundCode(c, "dlq_not_found", "dead-letter job not found")
			return
		}
		httpx.InternalError(c, "dlq_get_failed", "failed to retrieve dead-letter job")
		return
	}

	var orig domain.Job
	if err := h.DB.WithContext(c.Request.Context()).First(&orig, "id = ?", dlq.JobID).Error; err != nil {
		httpx.InternalError(c, "dlq_job_missing", "original job not found")
		return
	}

	var req job.CreateInput
	if err := unmarshalJobRequest(orig, &req); err != nil {
		httpx.InternalError(c, "dlq_payload_corrupt", "original job payload could not be decoded")
		return
	}
	req.OrgID = orig.OrgID
	req.APIKeyID = orig.APIKeyID
	req.BatchRunID = orig.BatchRunID

	result, err := h.JobSvc.Create(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, job.ErrInsufficient) {
			httpx.PaymentRequired(c, "insufficient_credits", "insufficient credits for replay")
			return
		}
		httpx.InternalError(c, "replay_failed", "failed to enqueue replay")
		return
	}

	actor := c.GetString(AdminActorCtxKey)
	now := time.Now()
	h.DB.WithContext(c.Request.Context()).Model(&domain.DeadLetterJob{}).Where("id = ?", dlqID).Updates(map[string]any{
		"replayed_at": now,
		"replayed_by": actor,
	})

	RecordAudit(c.Request.Context(), h.DB, c, "admin.dlq.replay", "dead_letter_job", dlqIDStr,
		map[string]any{"new_job_id": result.JobID, "dlq_id": dlqID})

	c.JSON(http.StatusOK, gin.H{
		"dlq_id":     dlqID,
		"new_job_id": result.JobID,
		"status":     result.Status,
	})
}

// unmarshalJobRequest extracts a provider.GenerationRequest from a job's stored payload.
func unmarshalJobRequest(j domain.Job, out *job.CreateInput) error {
	var req provider.GenerationRequest
	if err := json.Unmarshal(j.Request, &req); err != nil {
		return err
	}
	out.Request = req
	return nil
}
