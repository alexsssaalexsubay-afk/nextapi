package gateway

import (
	"errors"
	"net/http"
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
		providers = append(providers, providerStatus{
			Type:       typ,
			Configured: err == nil && strings.TrimSpace(row.APIKeyEncrypted) != "" && strings.TrimSpace(row.Model) != "",
			DefaultID:  row.ID,
			Model:      row.Model,
		})
	}
	var activeVIPs int64
	if err := h.DB.WithContext(c.Request.Context()).Model(&domain.AIDirectorEntitlement{}).
		Where("enabled = ? AND (expires_at IS NULL OR expires_at > ?)", true, time.Now()).
		Count(&activeVIPs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"providers":    providers,
		"active_vips":  activeVIPs,
		"usage_notice": "VIP access unlocks AI Director, but every live generation still consumes credits.",
	})
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
