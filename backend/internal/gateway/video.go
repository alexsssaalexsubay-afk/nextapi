package gateway

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/abuse"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/idempotency"
	"github.com/sanidg/nextapi/backend/internal/job"
	"github.com/sanidg/nextapi/backend/internal/moderation"
	"github.com/sanidg/nextapi/backend/internal/provider"
	"github.com/sanidg/nextapi/backend/internal/spend"
	"github.com/sanidg/nextapi/backend/internal/throughput"
	"gorm.io/gorm"
)

type VideoHandlers struct {
	Jobs *job.Service
	DB   *gorm.DB
}

type generateReq struct {
	Prompt          string  `json:"prompt" binding:"required"`
	Model           string  `json:"model"`
	ImageURL        *string `json:"image_url"`
	DurationSeconds int     `json:"duration_seconds"`
	Resolution      string  `json:"resolution"`
	Mode            string  `json:"mode"`

	// Parameters the upstream video model actually consumes. All
	// optional. Validation lives in gateway/videoparams.go so both
	// this legacy endpoint and the new /v1/videos surface agree.
	AspectRatio   string `json:"aspect_ratio"`
	FPS           int    `json:"fps"`
	GenerateAudio *bool  `json:"generate_audio"`
	Watermark     *bool  `json:"watermark"`
	Seed          *int64 `json:"seed"`
	CameraFixed   *bool  `json:"camera_fixed"`
}

func (h *VideoHandlers) Generate(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req generateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "invalid request body"}})
		return
	}
	if req.Resolution == "" {
		req.Resolution = "1080p"
	}
	if req.Mode == "" {
		req.Mode = "normal"
	}
	if req.DurationSeconds <= 0 {
		req.DurationSeconds = 5
	}

	// Vendor-SSRF guard, mirrors the new /v1/videos surface.
	if req.ImageURL != nil {
		if err := abuse.ValidatePublicURL(*req.ImageURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_image_url",
				"message": err.Error(),
			}})
			return
		}
	}

	// Validate the Seedance-facing parameters once, so both endpoints
	// reject the same invalid values with the same error codes.
	if err := validateVideoParams(req.AspectRatio, req.FPS, req.DurationSeconds); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": err.Error(),
		}})
		return
	}

	input := job.CreateInput{
		OrgID: org.ID,
		Request: provider.GenerationRequest{
			Model:           req.Model,
			Prompt:          req.Prompt,
			ImageURL:        req.ImageURL,
			DurationSeconds: req.DurationSeconds,
			Resolution:      req.Resolution,
			Mode:            req.Mode,
			AspectRatio:     req.AspectRatio,
			FPS:             req.FPS,
			GenerateAudio:   req.GenerateAudio,
			Watermark:       req.Watermark,
			Seed:            req.Seed,
			CameraFixed:     req.CameraFixed,
		},
	}
	if apiKey := auth.APIKeyFrom(c); apiKey != nil {
		input.APIKeyID = &apiKey.ID
	}
	res, err := h.Jobs.Create(c.Request.Context(), input)
	if err != nil {
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
				"error": gin.H{"code": "rate_limited.burst_exceeded", "message": "concurrency limit reached, retry later"},
			})
			return
		}
		if errors.Is(err, moderation.ErrBlocked) {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error": gin.H{"code": "content_moderation.blocked", "message": "content rejected by moderation policy"},
			})
			return
		}
		if errors.Is(err, moderation.ErrReviewRequired) {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error": gin.H{"code": "content_moderation.review_required", "message": "content queued for human review"},
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	resp := gin.H{
		"id":                res.JobID,
		"status":            res.Status,
		"estimated_credits": res.EstimatedCredits,
	}
	if h.DB != nil {
		idempotency.Commit(c.Request.Context(), h.DB, org.ID, c, http.StatusAccepted, resp)
	}
	c.JSON(http.StatusAccepted, resp)
}

func (h *VideoHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	j, err := h.Jobs.Get(c.Request.Context(), org.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":             j.ID,
		"status":         j.Status,
		"video_url":      j.VideoURL,
		"tokens_used":    j.TokensUsed,
		"cost_credits":   j.CostCredits,
		"error_code":     j.ErrorCode,
		"error_message":  j.ErrorMessage,
		"created_at":     j.CreatedAt,
		"completed_at":   j.CompletedAt,
	})
}
