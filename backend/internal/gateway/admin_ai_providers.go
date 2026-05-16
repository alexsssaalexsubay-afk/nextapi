package gateway

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/gin-gonic/gin"
)

type aiProviderReq struct {
	Name       string          `json:"name"`
	Type       string          `json:"type"`
	Provider   string          `json:"provider"`
	BaseURL    string          `json:"base_url"`
	APIKey     string          `json:"api_key"`
	Model      string          `json:"model"`
	Enabled    *bool           `json:"enabled"`
	IsDefault  bool            `json:"is_default"`
	ConfigJSON json.RawMessage `json:"config_json"`
}

type aiProviderQuotaManualReq struct {
	Currency        string `json:"currency"`
	TotalCents      *int64 `json:"total_cents"`
	UsedCents       *int64 `json:"used_cents"`
	RemainingCents  *int64 `json:"remaining_cents"`
	LowBalanceCents *int64 `json:"low_balance_cents"`
	PeriodStart     string `json:"period_start"`
	PeriodEnd       string `json:"period_end"`
	Message         string `json:"message"`
}

func (h *AdminHandlers) ListAIProviders(c *gin.Context) {
	svc := aiprovider.NewService(h.DB)
	rows, err := svc.List(c.Request.Context(), c.Query("type"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *AdminHandlers) CreateAIProvider(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var req aiProviderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	row, err := aiprovider.NewService(h.DB).Upsert(c.Request.Context(), "", providerInput(req))
	if err != nil {
		handleAIProviderError(c, err)
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "ai_provider.create", "ai_provider", row.ID, gin.H{"type": row.Type, "provider": row.Provider})
	c.JSON(http.StatusCreated, row)
}

func (h *AdminHandlers) PatchAIProvider(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var req aiProviderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	row, err := aiprovider.NewService(h.DB).Upsert(c.Request.Context(), c.Param("id"), providerInput(req))
	if err != nil {
		handleAIProviderError(c, err)
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "ai_provider.update", "ai_provider", row.ID, gin.H{"type": row.Type, "provider": row.Provider})
	c.JSON(http.StatusOK, row)
}

func (h *AdminHandlers) DeleteAIProvider(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	if err := aiprovider.NewService(h.DB).Delete(c.Request.Context(), c.Param("id")); err != nil {
		handleAIProviderError(c, err)
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "ai_provider.delete", "ai_provider", c.Param("id"), nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandlers) SetDefaultAIProvider(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	row, err := aiprovider.NewService(h.DB).SetDefault(c.Request.Context(), c.Param("id"))
	if err != nil {
		handleAIProviderError(c, err)
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "ai_provider.default", "ai_provider", row.ID, gin.H{"type": row.Type})
	c.JSON(http.StatusOK, row)
}

func (h *AdminHandlers) TestAIProvider(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	runtime := aiprovider.NewRuntime(aiprovider.NewService(h.DB))
	if err := runtime.TestProvider(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "provider_test_failed"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandlers) ListAIProviderLogs(c *gin.Context) {
	db := h.DB.WithContext(c.Request.Context()).Order("created_at DESC").Limit(200)
	if id := strings.TrimSpace(c.Query("provider_id")); id != "" {
		db = db.Where("provider_id = ?", id)
	}
	var rows []domain.AIProviderLog
	if err := db.Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *AdminHandlers) ListProviderQuotas(c *gin.Context) {
	rows, err := aiprovider.NewService(h.DB).ListQuotaSnapshots(c.Request.Context(), 200)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *AdminHandlers) SyncAIProviderQuota(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	row, err := aiprovider.NewService(h.DB).SyncProviderQuota(c.Request.Context(), c.Param("id"))
	if err != nil {
		handleAIProviderError(c, err)
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "ai_provider.quota_sync", "ai_provider", c.Param("id"), gin.H{"status": row.Status, "remaining_cents": row.RemainingCents})
	c.JSON(http.StatusOK, row)
}

func (h *AdminHandlers) RecordAIProviderQuota(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var req aiProviderQuotaManualReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	periodStart, ok := parseOptionalAdminTime(req.PeriodStart)
	if !ok && strings.TrimSpace(req.PeriodStart) != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_period_start"}})
		return
	}
	periodEnd, ok := parseOptionalAdminTime(req.PeriodEnd)
	if !ok && strings.TrimSpace(req.PeriodEnd) != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_period_end"}})
		return
	}
	row, err := aiprovider.NewService(h.DB).RecordManualQuotaSnapshot(c.Request.Context(), c.Param("id"), aiprovider.ManualQuotaInput{
		Currency:        req.Currency,
		TotalCents:      req.TotalCents,
		UsedCents:       req.UsedCents,
		RemainingCents:  req.RemainingCents,
		LowBalanceCents: req.LowBalanceCents,
		PeriodStart:     periodStart,
		PeriodEnd:       periodEnd,
		Message:         req.Message,
	})
	if err != nil {
		handleAIProviderError(c, err)
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "ai_provider.quota_manual", "ai_provider", c.Param("id"), gin.H{"status": row.Status, "remaining_cents": row.RemainingCents})
	c.JSON(http.StatusOK, row)
}

func providerInput(req aiProviderReq) aiprovider.ProviderInput {
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	return aiprovider.ProviderInput{
		Name:       req.Name,
		Type:       req.Type,
		Provider:   req.Provider,
		BaseURL:    req.BaseURL,
		APIKey:     req.APIKey,
		Model:      req.Model,
		Enabled:    enabled,
		IsDefault:  req.IsDefault,
		ConfigJSON: req.ConfigJSON,
	}
}

func handleAIProviderError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, aiprovider.ErrProviderNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
	case errors.Is(err, aiprovider.ErrInvalidProvider):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_provider"}})
	case errors.Is(err, aiprovider.ErrProviderKeyRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "provider_key_required"}})
	case errors.Is(err, aiprovider.ErrEncryptionKeyMissing):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "provider_encryption_unavailable"}})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
	}
}

func parseOptionalAdminTime(raw string) (*time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, true
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			out := parsed.UTC()
			return &out, true
		}
	}
	return nil, false
}
