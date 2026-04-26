package gateway

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/abuse"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/idempotency"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/moderation"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"github.com/gin-gonic/gin"
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

	// Extended media inputs (Seedance multi-modal).
	Draft         *bool    `json:"draft"`
	ImageURLs     []string `json:"image_urls"`
	VideoURLs     []string `json:"video_urls"`
	AudioURLs     []string `json:"audio_urls"`
	FirstFrameURL *string  `json:"first_frame_url"`
	LastFrameURL  *string  `json:"last_frame_url"`
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
		req.Resolution = provider.DefaultResolution()
	}
	if req.Mode == "" {
		req.Mode = "normal"
	}
	if req.DurationSeconds <= 0 {
		req.DurationSeconds = 5
	}

	// Vendor-SSRF guard, mirrors the new /v1/videos surface.
	if req.ImageURL != nil {
		if err := abuse.ValidatePublicOrAssetURL(*req.ImageURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_image_url",
				"message": err.Error(),
			}})
			return
		}
	}

	// Validate video parameters once, so both endpoints reject the same
	// invalid values with the same error codes.
	if err := validateVideoParams(req.AspectRatio, req.FPS, req.DurationSeconds, req.Resolution); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": err.Error(),
		}})
		return
	}

	if err := validateExtendedMediaParams(req.ImageURLs, req.VideoURLs, req.AudioURLs, req.FirstFrameURL, req.LastFrameURL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": err.Error(),
		}})
		return
	}

	// SSRF guards for extended media URLs.
	for i, u := range req.ImageURLs {
		if err := abuse.ValidatePublicOrAssetURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_image_urls",
				"message": fmt.Sprintf("image_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	for i, u := range req.VideoURLs {
		if err := abuse.ValidatePublicOrAssetURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_video_urls",
				"message": fmt.Sprintf("video_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	for i, u := range req.AudioURLs {
		if err := abuse.ValidatePublicOrAssetURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_audio_urls",
				"message": fmt.Sprintf("audio_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	if req.FirstFrameURL != nil && *req.FirstFrameURL != "" {
		if err := abuse.ValidatePublicOrAssetURL(*req.FirstFrameURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_first_frame_url",
				"message": err.Error(),
			}})
			return
		}
	}
	if req.LastFrameURL != nil && *req.LastFrameURL != "" {
		if err := abuse.ValidatePublicOrAssetURL(*req.LastFrameURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_last_frame_url",
				"message": err.Error(),
			}})
			return
		}
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
			Draft:           req.Draft,
			ImageURLs:       req.ImageURLs,
			VideoURLs:       req.VideoURLs,
			AudioURLs:       req.AudioURLs,
			FirstFrameURL:   req.FirstFrameURL,
			LastFrameURL:    req.LastFrameURL,
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
		var upstreamErr *provider.UpstreamError
		if errors.As(err, &upstreamErr) {
			status := http.StatusBadRequest
			message := "invalid video generation request"
			switch upstreamErr.Code {
			case "error-104", "402":
				status = http.StatusPaymentRequired
				message = "top up to continue"
			case "error-501":
				status = http.StatusTooManyRequests
				message = "rate limited, retry later"
			}
			if upstreamErr.Retryable {
				status = http.StatusServiceUnavailable
				message = "generation provider unavailable"
			}
			c.JSON(status, gin.H{"error": gin.H{"code": upstreamErr.Code, "message": message}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	// Create a mirrored row in videos so the dashboard history is unified.
	// This keeps the legacy job id stable for older clients, but also gives a
	// first-class videos UUID for the modern /v1/videos surface.
	var mirroredVideoID *string
	if h.DB != nil {
		// Persist the legacy request payload as the new surface "input" shape.
		reqJSON, _ := json.Marshal(map[string]any{
			"prompt":           req.Prompt,
			"image_url":        req.ImageURL,
			"duration_seconds": req.DurationSeconds,
			"resolution":       req.Resolution,
			"mode":             req.Mode,
			"aspect_ratio":     req.AspectRatio,
			"fps":              req.FPS,
			"generate_audio":   req.GenerateAudio,
			"watermark":        req.Watermark,
			"seed":             req.Seed,
			"camera_fixed":     req.CameraFixed,
			"draft":            req.Draft,
			"image_urls":       req.ImageURLs,
			"video_urls":       req.VideoURLs,
			"audio_urls":       req.AudioURLs,
			"first_frame_url":  req.FirstFrameURL,
			"last_frame_url":   req.LastFrameURL,
		})
		vid := domain.Video{
			OrgID:              org.ID,
			APIKeyID:           input.APIKeyID,
			Model:              req.Model,
			Status:             "queued",
			Input:              reqJSON,
			Metadata:           json.RawMessage(`{}`),
			UpstreamJobID:      &res.JobID,
			EstimatedCostCents: res.EstimatedCredits,
			ReservedCents:      res.EstimatedCredits,
		}
		if err := h.DB.WithContext(c.Request.Context()).Create(&vid).Error; err == nil {
			mirroredVideoID = &vid.ID
		}
	}
	resp := gin.H{
		"id":                res.JobID,
		"status":            res.Status,
		"estimated_credits": res.EstimatedCredits,
	}
	if mirroredVideoID != nil {
		resp["video_id"] = *mirroredVideoID
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
		"id":            j.ID,
		"status":        j.Status,
		"video_url":     j.VideoURL,
		"tokens_used":   j.TokensUsed,
		"cost_credits":  j.CostCredits,
		"error_code":    j.ErrorCode,
		"error_message": j.ErrorMessage,
		"created_at":    j.CreatedAt,
		"completed_at":  j.CompletedAt,
	})
}
