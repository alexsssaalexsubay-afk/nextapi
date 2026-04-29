package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type aiDirectorEntitlementReq struct {
	Enabled   bool   `json:"enabled"`
	Tier      string `json:"tier"`
	ExpiresAt string `json:"expires_at"`
	Note      string `json:"note"`
}

type aiDirectorMeteringEvent struct {
	ID             int64   `json:"id"`
	OrgID          string  `json:"org_id"`
	DirectorJobID  *string `json:"director_job_id,omitempty"`
	StepID         *string `json:"step_id,omitempty"`
	JobID          *string `json:"job_id,omitempty"`
	ProviderID     *string `json:"provider_id,omitempty"`
	MeterType      string  `json:"meter_type"`
	Units          float64 `json:"units"`
	EstimatedCents int64   `json:"estimated_cents"`
	ActualCents    int64   `json:"actual_cents"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"created_at"`
}

type aiDirectorMeteringSummary struct {
	Available     bool                      `json:"available"`
	Calls24h      int64                     `json:"calls_24h"`
	Units24h      float64                   `json:"units_24h"`
	RatedCents24h int64                     `json:"rated_cents_24h"`
	Recent        []aiDirectorMeteringEvent `json:"recent"`
}

type aiDirectorStepEvent struct {
	ID              string  `json:"id"`
	StepKey         string  `json:"step_key"`
	Status          string  `json:"status"`
	ErrorCode       string  `json:"error_code,omitempty"`
	JobID           *string `json:"job_id,omitempty"`
	TextProviderID  string  `json:"text_provider_id,omitempty"`
	ImageProviderID string  `json:"image_provider_id,omitempty"`
	VideoModel      string  `json:"video_model,omitempty"`
	ShotCount       int     `json:"shot_count,omitempty"`
	MaxParallel     int     `json:"max_parallel,omitempty"`
	StartedAt       *string `json:"started_at,omitempty"`
	CompletedAt     *string `json:"completed_at,omitempty"`
	CreatedAt       string  `json:"created_at"`
}

type aiDirectorJobEvent struct {
	ID              string                `json:"id"`
	OrgID           string                `json:"org_id"`
	WorkflowID      *string               `json:"workflow_id,omitempty"`
	WorkflowRunID   *string               `json:"workflow_run_id,omitempty"`
	BatchRunID      *string               `json:"batch_run_id,omitempty"`
	Title           string                `json:"title"`
	Status          string                `json:"status"`
	EngineUsed      string                `json:"engine_used"`
	FallbackUsed    bool                  `json:"fallback_used"`
	CreatedBy       string                `json:"created_by"`
	CreatedAt       string                `json:"created_at"`
	UpdatedAt       string                `json:"updated_at"`
	StepSummary     map[string]int        `json:"step_summary"`
	RecentSteps     []aiDirectorStepEvent `json:"recent_steps"`
	MeteringCents   int64                 `json:"metering_cents"`
	MeteringCalls   int64                 `json:"metering_calls"`
	SelectedAssetCt int                   `json:"selected_asset_count"`
}

type aiDirectorJobsSummary struct {
	Available      bool                 `json:"available"`
	Total          int64                `json:"total"`
	Running        int64                `json:"running"`
	Failed         int64                `json:"failed"`
	FallbackRuns   int64                `json:"fallback_runs"`
	AdvancedRuns   int64                `json:"advanced_runs"`
	Recent         []aiDirectorJobEvent `json:"recent"`
	UnavailableWhy string               `json:"unavailable_why,omitempty"`
}

type aiDirectorRuntimePolicy struct {
	ProductBrand         string `json:"product_brand"`
	PublicEngine         string `json:"public_engine"`
	StorageMode          string `json:"storage_mode"`
	TaskStatusMode       string `json:"task_status_mode"`
	BillingMode          string `json:"billing_mode"`
	WorkflowOutputSchema string `json:"workflow_output_schema"`
	ProviderKeysExposed  bool   `json:"provider_keys_exposed"`
	UpstreamExposed      bool   `json:"upstream_exposed"`
}

type aiDirectorRuntimeConfig struct {
	SidecarConfigured       bool                    `json:"sidecar_configured"`
	SidecarTokenConfigured  bool                    `json:"sidecar_token_configured"`
	CallbackConfigured      bool                    `json:"callback_configured"`
	CallbackTokenConfigured bool                    `json:"callback_token_configured"`
	FallbackEnabled         bool                    `json:"fallback_enabled"`
	FailClosed              bool                    `json:"fail_closed"`
	ReadyForSidecar         bool                    `json:"ready_for_sidecar"`
	MissingRequirements     []string                `json:"missing_requirements"`
	Policy                  aiDirectorRuntimePolicy `json:"policy"`
}

func (h *AdminHandlers) AdminAIDirectorStatus(c *gin.Context) {
	type providerStatus struct {
		Type       string `json:"type"`
		Configured bool   `json:"configured"`
		DefaultID  string `json:"default_id,omitempty"`
		Model      string `json:"model,omitempty"`
	}
	providers := make([]providerStatus, 0, 3)
	for _, typ := range []string{domain.AIProviderTypeText, domain.AIProviderTypeImage, domain.AIProviderTypeVideo} {
		var row domain.AIProvider
		err := h.DB.WithContext(c.Request.Context()).
			Where("type = ? AND enabled = ? AND is_default = ?", typ, true, true).
			First(&row).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
			return
		}
		configured := err == nil && strings.TrimSpace(row.APIKeyEncrypted) != "" && strings.TrimSpace(row.Model) != ""
		defaultID := row.ID
		model := row.Model
		if typ == domain.AIProviderTypeVideo && !configured {
			configured, defaultID, model = runtimeVideoProviderStatus()
		}
		providers = append(providers, providerStatus{
			Type:       typ,
			Configured: configured,
			DefaultID:  defaultID,
			Model:      model,
		})
	}
	var activeVIPs int64
	if err := h.DB.WithContext(c.Request.Context()).Model(&domain.AIDirectorEntitlement{}).
		Where("enabled = ? AND (expires_at IS NULL OR expires_at > ?)", true, time.Now()).
		Count(&activeVIPs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	metering := h.directorMeteringSummary(c.Request.Context())
	jobs := h.directorJobsSummary(c.Request.Context(), adminDirectorLimit(c, 12))
	c.JSON(http.StatusOK, gin.H{
		"providers":    providers,
		"active_vips":  activeVIPs,
		"runtime":      adminDirectorRuntimeConfig(),
		"metering":     metering,
		"jobs":         jobs,
		"usage_notice": "VIP access unlocks AI Director, but every live generation still consumes credits.",
	})
}

func (h *AdminHandlers) directorMeteringSummary(ctx context.Context) aiDirectorMeteringSummary {
	out := aiDirectorMeteringSummary{Available: true, Recent: []aiDirectorMeteringEvent{}}
	since := time.Now().Add(-24 * time.Hour)
	var agg struct {
		Calls int64
		Units float64
		Cents int64
	}
	if err := h.DB.WithContext(ctx).Raw(`
		SELECT COUNT(*) AS calls,
		       COALESCE(SUM(units), 0) AS units,
		       COALESCE(SUM(actual_cents), 0) AS cents
		FROM director_metering
		WHERE created_at >= ?`, since).Scan(&agg).Error; err != nil {
		return aiDirectorMeteringSummary{Available: false, Recent: []aiDirectorMeteringEvent{}}
	}
	out.Calls24h = agg.Calls
	out.Units24h = agg.Units
	out.RatedCents24h = agg.Cents
	var rows []domain.DirectorMetering
	if err := h.DB.WithContext(ctx).Order("created_at DESC").Limit(20).Find(&rows).Error; err != nil {
		return aiDirectorMeteringSummary{Available: false, Recent: []aiDirectorMeteringEvent{}}
	}
	for _, row := range rows {
		out.Recent = append(out.Recent, aiDirectorMeteringEvent{
			ID:             row.ID,
			OrgID:          row.OrgID,
			DirectorJobID:  row.DirectorJobID,
			StepID:         row.StepID,
			JobID:          row.JobID,
			ProviderID:     row.ProviderID,
			MeterType:      row.MeterType,
			Units:          row.Units,
			EstimatedCents: row.EstimatedCents,
			ActualCents:    row.ActualCents,
			Status:         row.Status,
			CreatedAt:      row.CreatedAt.Format(time.RFC3339),
		})
	}
	return out
}

func (h *AdminHandlers) directorJobsSummary(ctx context.Context, limit int) aiDirectorJobsSummary {
	out := aiDirectorJobsSummary{Available: true, Recent: []aiDirectorJobEvent{}}
	db := h.DB.WithContext(ctx)
	if err := db.Model(&domain.DirectorJob{}).Count(&out.Total).Error; err != nil {
		return aiDirectorJobsSummary{Available: false, Recent: []aiDirectorJobEvent{}, UnavailableWhy: "director_jobs_unavailable"}
	}
	_ = db.Model(&domain.DirectorJob{}).Where("status IN ?", []string{"planning", "queued", "running"}).Count(&out.Running).Error
	_ = db.Model(&domain.DirectorJob{}).Where("status = ?", "failed").Count(&out.Failed).Error
	_ = db.Model(&domain.DirectorJob{}).Where("fallback_used = ?", true).Count(&out.FallbackRuns).Error
	_ = db.Model(&domain.DirectorJob{}).Where("engine_used = ?", "advanced_sidecar").Count(&out.AdvancedRuns).Error

	var rows []domain.DirectorJob
	if err := db.Order("updated_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return aiDirectorJobsSummary{Available: false, Recent: []aiDirectorJobEvent{}, UnavailableWhy: "director_jobs_unavailable"}
	}
	for _, row := range rows {
		out.Recent = append(out.Recent, h.directorJobEvent(ctx, row))
	}
	return out
}

func (h *AdminHandlers) directorJobEvent(ctx context.Context, row domain.DirectorJob) aiDirectorJobEvent {
	var steps []domain.DirectorStep
	_ = h.DB.WithContext(ctx).
		Where("director_job_id = ?", row.ID).
		Order("created_at ASC").
		Find(&steps).Error
	stepSummary := map[string]int{}
	recentSteps := make([]aiDirectorStepEvent, 0, len(steps))
	for _, step := range steps {
		stepSummary[step.Status]++
		input := directorStepInputSummary(step.InputSnapshot)
		recentSteps = append(recentSteps, aiDirectorStepEvent{
			ID:              step.ID,
			StepKey:         step.StepKey,
			Status:          step.Status,
			ErrorCode:       step.ErrorCode,
			JobID:           step.JobID,
			TextProviderID:  input.TextProviderID,
			ImageProviderID: input.ImageProviderID,
			VideoModel:      input.VideoModel,
			ShotCount:       input.ShotCount,
			MaxParallel:     input.MaxParallel,
			StartedAt:       formatOptionalTime(step.StartedAt),
			CompletedAt:     formatOptionalTime(step.CompletedAt),
			CreatedAt:       step.CreatedAt.Format(time.RFC3339),
		})
	}
	var meter struct {
		Calls int64
		Cents int64
	}
	_ = h.DB.WithContext(ctx).Raw(`
		SELECT COUNT(*) AS calls,
		       COALESCE(SUM(actual_cents), 0) AS cents
		FROM director_metering
		WHERE director_job_id = ?`, row.ID).Scan(&meter).Error
	return aiDirectorJobEvent{
		ID:              row.ID,
		OrgID:           row.OrgID,
		WorkflowID:      row.WorkflowID,
		WorkflowRunID:   row.WorkflowRunID,
		BatchRunID:      row.BatchRunID,
		Title:           row.Title,
		Status:          row.Status,
		EngineUsed:      row.EngineUsed,
		FallbackUsed:    row.FallbackUsed,
		CreatedBy:       row.CreatedBy,
		CreatedAt:       row.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       row.UpdatedAt.Format(time.RFC3339),
		StepSummary:     stepSummary,
		RecentSteps:     recentSteps,
		MeteringCents:   meter.Cents,
		MeteringCalls:   meter.Calls,
		SelectedAssetCt: jsonArrayLen(row.SelectedCharacterIDs),
	}
}

type aiDirectorStepInputSummary struct {
	TextProviderID  string
	ImageProviderID string
	VideoModel      string
	ShotCount       int
	MaxParallel     int
}

func directorStepInputSummary(raw json.RawMessage) aiDirectorStepInputSummary {
	if len(raw) == 0 {
		return aiDirectorStepInputSummary{}
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return aiDirectorStepInputSummary{}
	}
	return aiDirectorStepInputSummary{
		TextProviderID:  jsonMapString(payload, "text_provider_id"),
		ImageProviderID: jsonMapString(payload, "image_provider_id"),
		VideoModel:      jsonMapString(payload, "video_model"),
		ShotCount:       jsonMapInt(payload, "shot_count"),
		MaxParallel:     jsonMapInt(payload, "max_parallel"),
	}
}

func jsonMapString(payload map[string]any, key string) string {
	value, ok := payload[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func jsonMapInt(payload map[string]any, key string) int {
	switch value := payload[key].(type) {
	case float64:
		return int(value)
	case int:
		return value
	default:
		return 0
	}
}

func adminDirectorLimit(c *gin.Context, fallback int) int {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(fallback)))
	if err != nil || limit <= 0 {
		return fallback
	}
	if limit > 50 {
		return 50
	}
	return limit
}

func formatOptionalTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.Format(time.RFC3339)
	return &formatted
}

func jsonArrayLen(raw []byte) int {
	if len(raw) == 0 {
		return 0
	}
	var values []any
	if err := json.Unmarshal(raw, &values); err != nil {
		return 0
	}
	return len(values)
}

func (h *AdminHandlers) GetAIDirectorEntitlement(c *gin.Context) {
	var row domain.AIDirectorEntitlement
	err := h.DB.WithContext(c.Request.Context()).First(&row, "org_id = ?", c.Param("id")).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusOK, gin.H{"org_id": c.Param("id"), "enabled": false, "tier": "vip"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *AdminHandlers) PutAIDirectorEntitlement(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var req aiDirectorEntitlementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	tier := strings.TrimSpace(req.Tier)
	if tier == "" {
		tier = "vip"
	}
	var expiresAt *time.Time
	if strings.TrimSpace(req.ExpiresAt) != "" {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(req.ExpiresAt))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_expires_at"}})
			return
		}
		expiresAt = &parsed
	}
	now := time.Now()
	row := domain.AIDirectorEntitlement{
		OrgID:     c.Param("id"),
		Tier:      tier,
		Enabled:   req.Enabled,
		ExpiresAt: expiresAt,
		Note:      strings.TrimSpace(req.Note),
		UpdatedBy: adminActor(c),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := h.DB.WithContext(c.Request.Context()).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "org_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"tier", "enabled", "expires_at", "note", "updated_by", "updated_at"}),
		}).
		Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "ai_director.entitlement", "org", row.OrgID, gin.H{"enabled": row.Enabled, "tier": row.Tier})
	c.JSON(http.StatusOK, row)
}

func adminActor(c *gin.Context) string {
	if v, ok := c.Get(AdminActorCtxKey); ok {
		if actor, ok := v.(string); ok {
			return actor
		}
	}
	return "unknown"
}

func runtimeVideoProviderStatus() (bool, string, string) {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("PROVIDER_MODE")))
	if mode == "" || mode == "mock" {
		return false, "", ""
	}
	switch mode {
	case "live":
		if strings.TrimSpace(os.Getenv("VOLC_API_KEY")) == "" {
			return false, "", ""
		}
		model := strings.TrimSpace(os.Getenv("SEEDANCE_MODEL"))
		if model == "" {
			model = "seedance-v2-pro"
		}
		return true, "runtime:volcengine", model
	case "seedance_relay", "seedance-relay", "relay", "uptoken":
		if strings.TrimSpace(os.Getenv("SEEDANCE_RELAY_API_KEY")) == "" && strings.TrimSpace(os.Getenv("UPTOKEN_API_KEY")) == "" {
			return false, "", ""
		}
		model := strings.TrimSpace(firstNonEmpty(os.Getenv("SEEDANCE_RELAY_MODEL"), os.Getenv("UPTOKEN_MODEL")))
		if model == "" {
			model = "seedance-2.0-pro"
		}
		return true, "runtime:seedance-relay", model
	default:
		return false, "", ""
	}
}

func adminDirectorRuntimeConfig() aiDirectorRuntimeConfig {
	sidecarConfigured := strings.TrimSpace(os.Getenv("VIMAX_RUNTIME_URL")) != ""
	sidecarTokenConfigured := strings.TrimSpace(os.Getenv("DIRECTOR_SIDECAR_TOKEN")) != ""
	callbackConfigured := strings.TrimSpace(os.Getenv("DIRECTOR_RUNTIME_CALLBACK_URL")) != ""
	callbackTokenConfigured := strings.TrimSpace(os.Getenv("DIRECTOR_RUNTIME_TOKEN")) != ""
	fallbackEnabled := adminDirectorRuntimeAllowFallback()
	missing := adminDirectorRuntimeMissingRequirements(sidecarConfigured, sidecarTokenConfigured, callbackConfigured, callbackTokenConfigured)
	return aiDirectorRuntimeConfig{
		SidecarConfigured:       sidecarConfigured,
		SidecarTokenConfigured:  sidecarTokenConfigured,
		CallbackConfigured:      callbackConfigured,
		CallbackTokenConfigured: callbackTokenConfigured,
		FallbackEnabled:         fallbackEnabled,
		FailClosed:              !fallbackEnabled,
		ReadyForSidecar:         len(missing) == 0,
		MissingRequirements:     missing,
		Policy: aiDirectorRuntimePolicy{
			ProductBrand:         "NextAPI Director",
			PublicEngine:         "advanced",
			StorageMode:          "nextapi_assets",
			TaskStatusMode:       "nextapi_workflow_jobs",
			BillingMode:          "nextapi_billing",
			WorkflowOutputSchema: "nextapi.director.storyboard.v1",
			ProviderKeysExposed:  false,
			UpstreamExposed:      false,
		},
	}
}

func adminDirectorRuntimeMissingRequirements(sidecarConfigured bool, sidecarTokenConfigured bool, callbackConfigured bool, callbackTokenConfigured bool) []string {
	missing := make([]string, 0, 4)
	if !sidecarConfigured {
		missing = append(missing, "sidecar_endpoint")
	}
	if !sidecarTokenConfigured {
		missing = append(missing, "sidecar_auth")
	}
	if !callbackConfigured {
		missing = append(missing, "callback_endpoint")
	}
	if !callbackTokenConfigured {
		missing = append(missing, "callback_auth")
	}
	return missing
}

func adminDirectorRuntimeAllowFallback() bool {
	if envFlag("VIMAX_RUNTIME_DISABLE_FALLBACK") {
		return false
	}
	return envFlag("VIMAX_RUNTIME_ALLOW_FALLBACK")
}

func envFlag(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
