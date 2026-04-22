package gateway

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/job"
	"github.com/sanidg/nextapi/backend/internal/moderation"
	"github.com/sanidg/nextapi/backend/internal/provider"
	"github.com/sanidg/nextapi/backend/internal/spend"
	"github.com/sanidg/nextapi/backend/internal/throughput"
)

type VideoHandlers struct {
	Jobs *job.Service
}

type generateReq struct {
	Prompt          string  `json:"prompt" binding:"required"`
	Model           string  `json:"model"`
	ImageURL        *string `json:"image_url"`
	DurationSeconds int     `json:"duration_seconds"`
	Resolution      string  `json:"resolution"`
	Mode            string  `json:"mode"`
}

func (h *VideoHandlers) Generate(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req generateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": err.Error()}})
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

	input := job.CreateInput{
		OrgID: org.ID,
		Request: provider.GenerationRequest{
			Prompt:          req.Prompt,
			ImageURL:        req.ImageURL,
			DurationSeconds: req.DurationSeconds,
			Resolution:      req.Resolution,
			Mode:            req.Mode,
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{
		"id":                res.JobID,
		"status":            res.Status,
		"estimated_credits": res.EstimatedCredits,
	})
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
