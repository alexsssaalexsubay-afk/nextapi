package gateway

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

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
	case errors.Is(err, aiprovider.ErrEncryptionKeyMissing):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "provider_encryption_unavailable"}})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
	}
}
