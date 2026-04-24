package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/abuse"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/idempotency"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/moderation"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"gorm.io/gorm"
)

type VideosHandlers struct {
	Jobs       *job.Service
	DB         *gorm.DB
	Spend      *spend.Service
	Throughput *throughput.Service
}

type videoCreateReq struct {
	Model          string          `json:"model"`
	Input          json.RawMessage `json:"input" binding:"required"`
	WebhookURL     *string         `json:"webhook_url"`
	IdempotencyKey *string         `json:"idempotency_key"`
}

type videoInput struct {
	Prompt          string  `json:"prompt"`
	ImageURL        *string `json:"image_url"`
	DurationSeconds int     `json:"duration_seconds"`
	Resolution      string  `json:"resolution"`
	Mode            string  `json:"mode"`

	// Parameters forwarded to the generation pipeline (Seedance-family models). Left
	// as pointers where "unset" and "false" mean different things
	// (so we don't force-disable audio for a customer who just
	// didn't pass the field).
	AspectRatio   string `json:"aspect_ratio"`
	FPS           int    `json:"fps"`
	GenerateAudio *bool  `json:"generate_audio"`
	Watermark     *bool  `json:"watermark"`
	Seed          *int64 `json:"seed"`
	CameraFixed   *bool  `json:"camera_fixed"`

	// Extended media inputs (Seedance multi-modal).
	Draft         *bool    `json:"draft"`
	ImageURLs     []string `json:"image_urls"`
	VideoURLs     []string `json:"video_urls"`
	AudioURLs     []string `json:"audio_urls"`
	FirstFrameURL *string  `json:"first_frame_url"`
	LastFrameURL  *string  `json:"last_frame_url"`
}

// Create handles POST /v1/videos — new B2B surface.
// Pipeline: moderation -> spend -> throughput -> enqueue.
func (h *VideosHandlers) Create(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req videoCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid JSON body"}})
		return
	}

	var input videoInput
	if err := json.Unmarshal(req.Input, &input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid input"}})
		return
	}
	if input.Resolution == "" {
		input.Resolution = "1080p"
	}
	if input.Mode == "" {
		input.Mode = "normal"
	}
	if input.DurationSeconds <= 0 {
		input.DurationSeconds = 5
	}

	if strings.TrimSpace(input.Prompt) == "" && input.ImageURL == nil &&
		len(input.ImageURLs) == 0 && len(input.VideoURLs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": "prompt or at least one media input is required",
		}})
		return
	}

	// SSRF guard: the worker fetches image_url server-side. Block
	// the obvious metadata/loopback hosts so a customer can't make the
	// generation pipeline hit internal networks.
	if input.ImageURL != nil {
		if err := abuse.ValidatePublicURL(*input.ImageURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_image_url",
				"message": err.Error(),
			}})
			return
		}
	}

	if err := validateVideoParams(input.AspectRatio, input.FPS, input.DurationSeconds); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": err.Error(),
		}})
		return
	}

	if err := validateExtendedMediaParams(input.ImageURLs, input.VideoURLs, input.AudioURLs, input.FirstFrameURL, input.LastFrameURL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": err.Error(),
		}})
		return
	}

	// SSRF guards for extended media URLs.
	for i, u := range input.ImageURLs {
		if err := abuse.ValidatePublicURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_image_urls",
				"message": fmt.Sprintf("image_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	for i, u := range input.VideoURLs {
		if err := abuse.ValidatePublicURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_video_urls",
				"message": fmt.Sprintf("video_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	for i, u := range input.AudioURLs {
		if err := abuse.ValidatePublicURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_audio_urls",
				"message": fmt.Sprintf("audio_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	if input.FirstFrameURL != nil && *input.FirstFrameURL != "" {
		if err := abuse.ValidatePublicURL(*input.FirstFrameURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_first_frame_url",
				"message": err.Error(),
			}})
			return
		}
	}
	if input.LastFrameURL != nil && *input.LastFrameURL != "" {
		if err := abuse.ValidatePublicURL(*input.LastFrameURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_last_frame_url",
				"message": err.Error(),
			}})
			return
		}
	}

	var apiKeyID *string
	if ak := auth.APIKeyFrom(c); ak != nil {
		apiKeyID = &ak.ID
	}
	res, err := h.Jobs.Create(c.Request.Context(), job.CreateInput{
		OrgID:    org.ID,
		APIKeyID: apiKeyID,
		Request: provider.GenerationRequest{
			Model:           req.Model,
			Prompt:          input.Prompt,
			ImageURL:        input.ImageURL,
			DurationSeconds: input.DurationSeconds,
			Resolution:      input.Resolution,
			Mode:            input.Mode,
			AspectRatio:     input.AspectRatio,
			FPS:             input.FPS,
			GenerateAudio:   input.GenerateAudio,
			Watermark:       input.Watermark,
			Seed:            input.Seed,
			CameraFixed:     input.CameraFixed,
			Draft:           input.Draft,
			ImageURLs:       input.ImageURLs,
			VideoURLs:       input.VideoURLs,
			AudioURLs:       input.AudioURLs,
			FirstFrameURL:   input.FirstFrameURL,
			LastFrameURL:    input.LastFrameURL,
		},
	})
	if err != nil {
		h.handleJobError(c, err)
		return
	}

	// Write a record to videos table for the new surface.
	vid := domain.Video{
		OrgID:              org.ID,
		APIKeyID:           apiKeyID,
		Model:              req.Model,
		Status:             "queued",
		Input:              req.Input,
		Metadata:           json.RawMessage(`{}`),
		UpstreamJobID:      &res.JobID,
		EstimatedCostCents: res.EstimatedCredits,
		ReservedCents:      res.EstimatedCredits,
		WebhookURL:         req.WebhookURL,
		IdempotencyKey:     req.IdempotencyKey,
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&vid).Error; err != nil {
		// Catastrophic: the job was already queued + reservation taken,
		// but we can't write the video row that the customer-facing API
		// hangs off. The reconciliation worker will refund the reservation
		// within an hour, but mark the job failed eagerly so the user
		// doesn't see phantom progress.
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = h.DB.WithContext(bgCtx).Model(&domain.Job{}).
			Where("id = ?", res.JobID).
			Updates(map[string]any{
				"status":        domain.JobFailed,
				"error_code":    "video_record_failed",
				"error_message": "could not persist video record",
				"completed_at":  time.Now(),
			}).Error
		if h.Throughput != nil {
			_ = h.Throughput.ReleaseForKey(bgCtx, org.ID, apiKeyID, res.JobID)
		}
		// Refund inline so the customer's balance is correct before the
		// next request lands; ledger uniqueness will deduplicate against
		// any later reconcile pass.
		if res.EstimatedCredits > 0 {
			refundCents := res.EstimatedCredits
			_ = h.DB.WithContext(bgCtx).Create(&domain.CreditsLedger{
				OrgID:        org.ID,
				DeltaCredits: res.EstimatedCredits,
				DeltaCents:   &refundCents,
				Reason:       domain.ReasonRefund,
				JobID:        &res.JobID,
				Note:         "refund: video record write failed",
			}).Error
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal", "message": "failed to create video record"}})
		return
	}

	resp := gin.H{
		"id":                   vid.ID,
		"object":               "video",
		"model":                vid.Model,
		"status":               vid.Status,
		"estimated_cost_cents": vid.EstimatedCostCents,
		"created_at":           vid.CreatedAt,
	}
	idempotency.Commit(c.Request.Context(), h.DB, org.ID, c, http.StatusAccepted, resp)
	c.JSON(http.StatusAccepted, resp)
}

// Get handles GET /v1/videos/:id.
func (h *VideosHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id := c.Param("id")

	var v domain.Video
	err := h.DB.WithContext(c.Request.Context()).
		Where("id = ? AND org_id = ?", id, org.ID).First(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Fall back to legacy jobs table.
		j, jErr := h.Jobs.Get(c.Request.Context(), org.ID, id)
		if jErr != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
			return
		}
		// Map legacy Job fields to the Video response shape.
		resp := gin.H{
			"id":                   j.ID,
			"object":               "video",
			"model":                j.Provider,
			"status":               j.Status,
			"estimated_cost_cents": j.ReservedCredits,
			"actual_cost_cents":    j.CostCredits,
			"error_code":           j.ErrorCode,
			"error_message":        j.ErrorMessage,
			"created_at":           j.CreatedAt,
		}
		if j.VideoURL != nil {
			resp["output"] = gin.H{"url": *j.VideoURL}
		}
		if j.RunningAt != nil {
			resp["started_at"] = j.RunningAt
		}
		if j.CompletedAt != nil {
			resp["finished_at"] = j.CompletedAt
		}
		c.JSON(http.StatusOK, resp)
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":                   v.ID,
		"object":               "video",
		"model":                v.Model,
		"status":               v.Status,
		"input":                v.Input,
		"output":               v.Output,
		"estimated_cost_cents": v.EstimatedCostCents,
		"actual_cost_cents":    v.ActualCostCents,
		"error_code":           v.ErrorCode,
		"error_message":        v.ErrorMessage,
		"created_at":           v.CreatedAt,
		"started_at":           v.StartedAt,
		"finished_at":          v.FinishedAt,
	})
}

// List handles GET /v1/videos.
func (h *VideosHandlers) List(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var videos []domain.Video
	q := h.DB.WithContext(c.Request.Context()).Where("org_id = ?", org.ID)
	if statusFilter := c.Query("status"); statusFilter != "" {
		q = q.Where("status = ?", statusFilter)
	}
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&videos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	items := make([]gin.H, 0, len(videos))
	for _, v := range videos {
		item := gin.H{
			"id":                   v.ID,
			"object":               "video",
			"model":                v.Model,
			"status":               v.Status,
			"estimated_cost_cents": v.EstimatedCostCents,
			"created_at":           v.CreatedAt,
		}
		// Extract prompt and duration_seconds from the input blob so the
		// dashboard list view can show the prompt without a per-row lookup.
		if len(v.Input) > 0 {
			var inp struct {
				Prompt          string `json:"prompt"`
				DurationSeconds int    `json:"duration_seconds"`
			}
			if err := json.Unmarshal(v.Input, &inp); err == nil {
				item["prompt"] = inp.Prompt
				if inp.DurationSeconds > 0 {
					item["duration_seconds"] = inp.DurationSeconds
				}
			}
		}
		items = append(items, item)
	}
	c.JSON(http.StatusOK, gin.H{"data": items, "has_more": len(videos) == limit})
}

// Delete handles DELETE /v1/videos/:id — cancels a queued video or marks it deleted.
func (h *VideosHandlers) Delete(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id := c.Param("id")

	var v domain.Video
	err := h.DB.WithContext(c.Request.Context()).
		Where("id = ? AND org_id = ?", id, org.ID).First(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	if v.Status != "queued" && v.Status != "running" {
		c.JSON(http.StatusConflict, gin.H{
			"error": gin.H{"code": "invalid_state", "message": "only queued or running videos can be cancelled"},
		})
		return
	}

	ctx := c.Request.Context()
	now := time.Now()
	if err := h.DB.WithContext(ctx).Model(&v).Updates(map[string]any{"status": "cancelled", "finished_at": now}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	if v.UpstreamJobID != nil {
		var j domain.Job
		if err := h.DB.WithContext(ctx).Where("id = ? AND org_id = ? AND status IN ('queued','running')", *v.UpstreamJobID, org.ID).First(&j).Error; err == nil {
			if err := h.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
				if err := tx.Model(&j).Updates(map[string]any{
					"status": domain.JobFailed, "error_code": "cancelled", "error_message": "cancelled by user", "completed_at": now,
				}).Error; err != nil {
					return err
				}
				if j.ReservedCredits > 0 {
					refund := j.ReservedCredits
					return tx.Create(&domain.CreditsLedger{
						OrgID: j.OrgID, DeltaCredits: refund, DeltaCents: &refund,
						Reason: domain.ReasonRefund, JobID: &j.ID, Note: "user cancelled video",
					}).Error
				}
				return nil
			}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
				return
			}
			if h.Throughput != nil {
				h.Throughput.Release(ctx, j.OrgID, j.ID)
			}
			if h.Spend != nil {
				h.Spend.DecrInflight(ctx, j.OrgID, j.ReservedCredits)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"id": v.ID, "status": "cancelled"})
}

// Wait handles GET /v1/videos/:id/wait — long-polls until the video reaches a terminal state.
func (h *VideosHandlers) Wait(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id := c.Param("id")
	timeoutSec, _ := strconv.Atoi(c.DefaultQuery("timeout", "30"))
	if timeoutSec <= 0 || timeoutSec > 120 {
		timeoutSec = 30
	}

	ctx := c.Request.Context()
	deadline := time.Now().Add(time.Duration(timeoutSec) * time.Second)

	for {
		var v domain.Video
		err := h.DB.WithContext(ctx).
			Where("id = ? AND org_id = ?", id, org.ID).First(&v).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
			return
		}

		if v.Status == "succeeded" || v.Status == "failed" || v.Status == "cancelled" {
			c.JSON(http.StatusOK, gin.H{
				"id":            v.ID,
				"status":        v.Status,
				"output":        v.Output,
				"error_code":    v.ErrorCode,
				"error_message": v.ErrorMessage,
				"finished_at":   v.FinishedAt,
			})
			return
		}

		if time.Now().After(deadline) {
			c.JSON(http.StatusOK, gin.H{
				"id":     v.ID,
				"status": v.Status,
			})
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func (h *VideosHandlers) handleJobError(c *gin.Context, err error) {
	if errors.Is(err, job.ErrInsufficient) || errors.Is(err, spend.ErrInsufficientBalance) {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error": gin.H{"code": "insufficient_quota.balance", "message": "top up to continue"},
		})
		return
	}
	if errors.Is(err, spend.ErrBudgetCap) {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error": gin.H{"code": "insufficient_quota.budget_cap", "message": "period budget cap reached"},
		})
		return
	}
	if errors.Is(err, spend.ErrMonthlyLimit) {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error": gin.H{"code": "insufficient_quota.monthly_limit", "message": "monthly usage limit reached"},
		})
		return
	}
	if errors.Is(err, spend.ErrOrgPaused) {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error": gin.H{"code": "insufficient_quota.org_paused", "message": "organization is paused"},
		})
		return
	}
	if errors.Is(err, throughput.ErrBurstExceeded) {
		c.Header("Retry-After", "5")
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": gin.H{"code": "rate_limited.burst_exceeded", "message": "concurrency limit reached"},
		})
		return
	}
	if errors.Is(err, moderation.ErrBlocked) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": gin.H{"code": "content_moderation.blocked", "message": "content rejected"},
		})
		return
	}
	if errors.Is(err, moderation.ErrReviewRequired) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": gin.H{"code": "content_moderation.review_required", "message": "queued for review"},
		})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
}
