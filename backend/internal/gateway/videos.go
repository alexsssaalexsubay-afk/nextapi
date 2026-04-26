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

type VideosHandlers struct {
	Jobs       *job.Service
	DB         *gorm.DB
	Spend      *spend.Service
	Throughput *throughput.Service
}

type videoRowWithJoins struct {
	domain.Video  `gorm:"embedded"`
	ProviderJobID *string `gorm:"column:provider_job_id"`
	APIKeyPrefix  *string `gorm:"column:api_key_prefix"`
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
	TempMediaKeys []string `json:"temp_media_keys"`
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
		input.Resolution = provider.DefaultResolution()
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
		if err := abuse.ValidatePublicOrAssetURL(*input.ImageURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_image_url",
				"message": err.Error(),
			}})
			return
		}
	}

	if err := validateVideoParams(input.AspectRatio, input.FPS, input.DurationSeconds, input.Resolution); err != nil {
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
	if err := validateTempMediaKeys(org.ID, input.TempMediaKeys); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_temp_media_keys",
			"message": err.Error(),
		}})
		return
	}

	// SSRF guards for extended media URLs.
	for i, u := range input.ImageURLs {
		if err := abuse.ValidatePublicOrAssetURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_image_urls",
				"message": fmt.Sprintf("image_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	for i, u := range input.VideoURLs {
		if err := abuse.ValidatePublicOrAssetURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_video_urls",
				"message": fmt.Sprintf("video_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	for i, u := range input.AudioURLs {
		if err := abuse.ValidatePublicOrAssetURL(u); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_audio_urls",
				"message": fmt.Sprintf("audio_urls[%d]: %s", i, err.Error()),
			}})
			return
		}
	}
	if input.FirstFrameURL != nil && *input.FirstFrameURL != "" {
		if err := abuse.ValidatePublicOrAssetURL(*input.FirstFrameURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"code":    "invalid_first_frame_url",
				"message": err.Error(),
			}})
			return
		}
	}
	if input.LastFrameURL != nil && *input.LastFrameURL != "" {
		if err := abuse.ValidatePublicOrAssetURL(*input.LastFrameURL); err != nil {
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
		Request:  videoGenerationRequest(req.Model, input),
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

// Retry handles POST /v1/videos/:id/retry by creating a fresh video/job pair
// from the original input. The old row remains immutable for audit/history.
func (h *VideosHandlers) Retry(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id := c.Param("id")

	var original domain.Video
	err := h.DB.WithContext(c.Request.Context()).
		Where("id = ? AND org_id = ?", id, org.ID).
		First(&original).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	if original.Status != "failed" && original.Status != string(domain.JobTimedOut) {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{
			"code":    "invalid_state",
			"message": "only failed or timed_out videos can be retried",
		}})
		return
	}

	var input videoInput
	if err := json.Unmarshal(original.Input, &input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "invalid_original_input", "message": "original video input could not be decoded"}})
		return
	}
	if len(input.TempMediaKeys) > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{
			"code":    "temporary_media_not_retryable",
			"message": "this job used temporary uploaded media that may have been deleted; upload the media again and submit a new task",
		}})
		return
	}

	res, err := h.Jobs.Create(c.Request.Context(), job.CreateInput{
		OrgID:    org.ID,
		APIKeyID: original.APIKeyID,
		Request:  videoGenerationRequest(original.Model, input),
	})
	if err != nil {
		h.handleJobError(c, err)
		return
	}

	metadata, _ := json.Marshal(map[string]any{"retry_of": original.ID})
	vid := domain.Video{
		OrgID:              org.ID,
		APIKeyID:           original.APIKeyID,
		Model:              original.Model,
		Status:             "queued",
		Input:              original.Input,
		Metadata:           metadata,
		UpstreamJobID:      &res.JobID,
		EstimatedCostCents: res.EstimatedCredits,
		ReservedCents:      res.EstimatedCredits,
		WebhookURL:         original.WebhookURL,
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&vid).Error; err != nil {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = h.DB.WithContext(bgCtx).Model(&domain.Job{}).
			Where("id = ?", res.JobID).
			Updates(map[string]any{
				"status":        domain.JobFailed,
				"error_code":    "video_record_failed",
				"error_message": "could not persist retried video record",
				"completed_at":  time.Now(),
			}).Error
		if h.Throughput != nil {
			_ = h.Throughput.ReleaseForKey(bgCtx, org.ID, original.APIKeyID, res.JobID)
		}
		if res.EstimatedCredits > 0 {
			refundCents := res.EstimatedCredits
			_ = h.DB.WithContext(bgCtx).Create(&domain.CreditsLedger{
				OrgID:        org.ID,
				DeltaCredits: res.EstimatedCredits,
				DeltaCents:   &refundCents,
				Reason:       domain.ReasonRefund,
				JobID:        &res.JobID,
				Note:         "refund: retried video record write failed",
			}).Error
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal", "message": "failed to create retried video record"}})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"id":                   vid.ID,
		"object":               "video",
		"model":                vid.Model,
		"status":               vid.Status,
		"estimated_cost_cents": vid.EstimatedCostCents,
		"retry_of":             original.ID,
		"created_at":           vid.CreatedAt,
	})
}

func videoGenerationRequest(model string, input videoInput) provider.GenerationRequest {
	return provider.GenerationRequest{
		Model:           model,
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
		TempMediaKeys:   input.TempMediaKeys,
	}
}

func validateTempMediaKeys(orgID string, keys []string) error {
	if len(keys) > 12 {
		return errors.New("temp_media_keys: max 12")
	}
	requiredPrefix := "temp/" + orgID + "/"
	for i, key := range keys {
		if key == "" {
			continue
		}
		if !strings.HasPrefix(key, requiredPrefix) {
			return fmt.Errorf("temp_media_keys[%d] must belong to the authenticated org", i)
		}
		if strings.Contains(key, "..") || strings.Contains(key, "\\") {
			return fmt.Errorf("temp_media_keys[%d] contains an invalid path segment", i)
		}
	}
	return nil
}

// Get handles GET /v1/videos/:id.
func (h *VideosHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id := c.Param("id")

	var v videoRowWithJoins
	err := h.DB.WithContext(c.Request.Context()).
		Table("videos v").
		Select("v.*, j.provider_job_id as provider_job_id, ak.prefix as api_key_prefix").
		// videos.upstream_job_id is TEXT (legacy schema), jobs.id is UUID — cast to compare.
		Joins("LEFT JOIN jobs j ON CAST(j.id AS TEXT) = v.upstream_job_id").
		Joins("LEFT JOIN api_keys ak ON ak.id = v.api_key_id").
		Where("v.id = ? AND v.org_id = ?", id, org.ID).
		Limit(1).
		Scan(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && v.ID == "") {
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

	// Back-compat: older workers stored {"video_url": "..."}; dashboard expects output.url.
	output := v.Output
	if len(output) > 0 {
		var m map[string]any
		if json.Unmarshal(output, &m) == nil {
			if _, hasURL := m["url"]; !hasURL {
				if vu, ok := m["video_url"]; ok && vu != nil {
					m["url"] = vu
					if b, mErr := json.Marshal(m); mErr == nil {
						output = b
					}
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":                   v.ID,
		"object":               "video",
		"model":                v.Model,
		"status":               v.Status,
		"input":                v.Input,
		"output":               output,
		"estimated_cost_cents": v.EstimatedCostCents,
		"actual_cost_cents":    v.ActualCostCents,
		"upstream_tokens":      v.UpstreamTokens,
		"upstream_job_id":      v.UpstreamJobID,
		"provider_job_id":      v.ProviderJobID,
		"api_key_id":           v.APIKeyID,
		"api_key_hint":         v.APIKeyPrefix,
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
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	// Back-compat: some clients still send offset pagination.
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Cursor pagination (preferred): cursor encodes "<unix_ms>.<uuid>" for stable ordering.
	cursor := strings.TrimSpace(c.Query("cursor"))
	var cursorTime *time.Time
	var cursorID string
	if cursor != "" {
		parts := strings.SplitN(cursor, ".", 2)
		if len(parts) == 2 {
			if ms, err := strconv.ParseInt(parts[0], 10, 64); err == nil {
				tm := time.UnixMilli(ms).UTC()
				cursorTime = &tm
				cursorID = parts[1]
			}
		}
	}

	var videos []videoRowWithJoins
	q := h.DB.WithContext(c.Request.Context()).
		Table("videos v").
		Select("v.*, j.provider_job_id as provider_job_id, ak.prefix as api_key_prefix").
		// videos.upstream_job_id is TEXT (legacy schema), jobs.id is UUID — cast to compare.
		Joins("LEFT JOIN jobs j ON CAST(j.id AS TEXT) = v.upstream_job_id").
		Joins("LEFT JOIN api_keys ak ON ak.id = v.api_key_id").
		Where("v.org_id = ?", org.ID)
	if statusFilter := c.Query("status"); statusFilter != "" {
		q = q.Where("v.status = ?", statusFilter)
	}
	if modelFilter := strings.TrimSpace(c.Query("model")); modelFilter != "" {
		q = q.Where("v.model = ?", modelFilter)
	}
	if after := strings.TrimSpace(c.Query("created_after")); after != "" {
		if t, err := time.Parse(time.RFC3339, after); err == nil {
			q = q.Where("v.created_at >= ?", t)
		}
	}
	if before := strings.TrimSpace(c.Query("created_before")); before != "" {
		if t, err := time.Parse(time.RFC3339, before); err == nil {
			q = q.Where("v.created_at <= ?", t)
		}
	}

	// Stable ordering: created_at DESC, id DESC.
	q = q.Order("v.created_at DESC, v.id DESC")
	if cursorTime != nil {
		// Items strictly older than cursor (or same time but smaller id).
		q = q.Where("(v.created_at < ?) OR (v.created_at = ? AND v.id < ?)", *cursorTime, *cursorTime, cursorID)
	}

	if err := q.Limit(limit).Offset(offset).Find(&videos).Error; err != nil {
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
			"actual_cost_cents":    v.ActualCostCents,
			"upstream_tokens":      v.UpstreamTokens,
			"upstream_job_id":      v.UpstreamJobID,
			"provider_job_id":      v.ProviderJobID,
			"api_key_id":           v.APIKeyID,
			"api_key_hint":         v.APIKeyPrefix,
			"error_code":           v.ErrorCode,
			"error_message":        v.ErrorMessage,
			"created_at":           v.CreatedAt,
			"started_at":           v.StartedAt,
			"finished_at":          v.FinishedAt,
		}
		// Extract prompt and duration_seconds from the input blob so the
		// dashboard list view can show the prompt without a per-row lookup.
		if len(v.Input) > 0 {
			var inp struct {
				Prompt          string `json:"prompt"`
				DurationSeconds int    `json:"duration_seconds"`
				Resolution      string `json:"resolution"`
				AspectRatio     string `json:"aspect_ratio"`
			}
			if err := json.Unmarshal(v.Input, &inp); err == nil {
				item["prompt"] = inp.Prompt
				if inp.DurationSeconds > 0 {
					item["duration_seconds"] = inp.DurationSeconds
				}
				if inp.Resolution != "" {
					item["resolution"] = inp.Resolution
				}
				if inp.AspectRatio != "" {
					item["ratio"] = inp.AspectRatio
				}
			}
		}
		// Light output in list for preview/download.
		if len(v.Output) > 0 {
			var m map[string]any
			if json.Unmarshal(v.Output, &m) == nil {
				if _, hasURL := m["url"]; !hasURL {
					if vu, ok := m["video_url"]; ok && vu != nil {
						m["url"] = vu
					}
				}
				item["output"] = m
			} else {
				item["output"] = v.Output
			}
		}
		items = append(items, item)
	}
	var nextCursor any = nil
	if len(videos) == limit {
		last := videos[len(videos)-1]
		nextCursor = fmt.Sprintf("%d.%s", last.CreatedAt.UTC().UnixMilli(), last.ID)
	}
	c.JSON(http.StatusOK, gin.H{"data": items, "has_more": len(videos) == limit, "next_cursor": nextCursor})
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
}
