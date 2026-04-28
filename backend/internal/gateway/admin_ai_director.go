package gateway

import (
	"context"
	"errors"
	"net/http"
	"os"
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
	c.JSON(http.StatusOK, gin.H{
		"providers":    providers,
		"active_vips":  activeVIPs,
		"metering":     metering,
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

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
