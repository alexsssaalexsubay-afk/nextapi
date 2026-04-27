package gateway

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type pricingSettingsReq struct {
	Enabled                *bool  `json:"enabled"`
	DefaultMarkupBPS       *int   `json:"default_markup_bps"`
	MinChargeCents         *int64 `json:"min_charge_cents"`
	RoundingIncrementCents *int64 `json:"rounding_increment_cents"`
}

type tierReq struct {
	Name                  *string `json:"name"`
	MinLifetimeTopupCents *int64  `json:"min_lifetime_topup_cents"`
	MarkupBPS             *int    `json:"markup_bps"`
	Enabled               *bool   `json:"enabled"`
	Description           *string `json:"description"`
}

type orgPricingReq struct {
	OverrideEnabled        *bool   `json:"override_enabled"`
	MarkupBPS              *int    `json:"markup_bps"`
	ManualMembershipTierID *string `json:"manual_membership_tier_id"`
	ClearManualMembership  bool    `json:"clear_manual_membership"`
}

var errInvalidManualMembershipTier = errors.New("invalid manual membership tier")

func (h *AdminHandlers) GetPricingSettings(c *gin.Context) {
	settings, err := h.loadPricingSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandlers) PutPricingSettings(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var req pricingSettingsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	settings, err := h.loadPricingSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	if req.Enabled != nil {
		settings.Enabled = *req.Enabled
	}
	if req.DefaultMarkupBPS != nil {
		if *req.DefaultMarkupBPS < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_markup"}})
			return
		}
		settings.DefaultMarkupBPS = *req.DefaultMarkupBPS
	}
	if req.MinChargeCents != nil {
		if *req.MinChargeCents < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_min_charge"}})
			return
		}
		settings.MinChargeCents = *req.MinChargeCents
	}
	if req.RoundingIncrementCents != nil {
		if *req.RoundingIncrementCents <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_rounding"}})
			return
		}
		settings.RoundingIncrementCents = *req.RoundingIncrementCents
	}
	settings.UpdatedBy = resolveActor(c)
	settings.UpdatedAt = time.Now()
	if err := h.DB.WithContext(c.Request.Context()).Save(&settings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "pricing.settings.update", "platform_pricing_settings", "1", gin.H{
		"default_markup_bps": settings.DefaultMarkupBPS,
		"enabled":            settings.Enabled,
	})
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandlers) ListPricingTiers(c *gin.Context) {
	var tiers []domain.MembershipTier
	if err := h.DB.WithContext(c.Request.Context()).
		Order("min_lifetime_topup_cents ASC").
		Find(&tiers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": tiers})
}

func (h *AdminHandlers) CreatePricingTier(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var req tierReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	tier, ok := tierFromReq(req, nil)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_tier"}})
		return
	}
	tier.ID = uuid.NewString()
	if err := h.DB.WithContext(c.Request.Context()).Create(&tier).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	if err := h.recomputePricingStates(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "pricing.tier.create", "membership_tier", tier.ID, gin.H{"name": tier.Name})
	c.JSON(http.StatusCreated, tier)
}

func (h *AdminHandlers) PatchPricingTier(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var tier domain.MembershipTier
	if err := h.DB.WithContext(c.Request.Context()).First(&tier, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	var req tierReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	updated, ok := tierFromReq(req, &tier)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_tier"}})
		return
	}
	if err := h.DB.WithContext(c.Request.Context()).Save(&updated).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	if err := h.recomputePricingStates(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "pricing.tier.update", "membership_tier", updated.ID, gin.H{"name": updated.Name})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminHandlers) DeletePricingTier(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	id := c.Param("id")
	if err := h.DB.WithContext(c.Request.Context()).Delete(&domain.MembershipTier{}, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	if err := h.recomputePricingStates(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "pricing.tier.delete", "membership_tier", id, nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandlers) GetOrgPricing(c *gin.Context) {
	orgID := c.Param("id")
	payload, err := h.orgPricingPayload(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, payload)
}

func (h *AdminHandlers) PatchOrgPricing(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	orgID := c.Param("id")
	var req orgPricingReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	if req.MarkupBPS != nil && *req.MarkupBPS < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_markup"}})
		return
	}
	now := time.Now()
	err := h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var override domain.OrgPricingOverride
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&override, "org_id = ?", orgID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			override = domain.OrgPricingOverride{OrgID: orgID, CreatedAt: now}
		} else if err != nil {
			return err
		}
		if req.OverrideEnabled != nil {
			override.OverrideEnabled = *req.OverrideEnabled
		}
		if req.MarkupBPS != nil {
			override.MarkupBPS = req.MarkupBPS
		}
		if req.ClearManualMembership {
			override.ManualMembershipTierID = nil
		} else if req.ManualMembershipTierID != nil {
			trimmed := strings.TrimSpace(*req.ManualMembershipTierID)
			if trimmed == "" {
				override.ManualMembershipTierID = nil
			} else {
				var tier domain.MembershipTier
				if err := tx.First(&tier, "id = ?", trimmed).Error; err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						return errInvalidManualMembershipTier
					}
					return err
				}
				override.ManualMembershipTierID = &trimmed
			}
		}
		override.UpdatedBy = resolveActor(c)
		override.UpdatedAt = now
		if err := tx.Save(&override).Error; err != nil {
			return err
		}
		var state domain.OrgPricingState
		err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&state, "org_id = ?", orgID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state = domain.OrgPricingState{OrgID: orgID, CreatedAt: now}
		} else if err != nil {
			return err
		}
		state.EffectiveMembershipTierID = state.AutoMembershipTierID
		if override.ManualMembershipTierID != nil {
			state.EffectiveMembershipTierID = override.ManualMembershipTierID
		}
		state.UpdatedAt = now
		return tx.Save(&state).Error
	})
	if err != nil {
		if errors.Is(err, errInvalidManualMembershipTier) {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_membership_tier"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "pricing.org.update", "org", orgID, nil)
	payload, _ := h.orgPricingPayload(c.Request.Context(), orgID)
	c.JSON(http.StatusOK, payload)
}

func (h *AdminHandlers) PricingMargins(c *gin.Context) {
	days := 30
	if c.Query("window") == "7d" {
		days = 7
	}
	since := time.Now().AddDate(0, 0, -days)
	db := h.DB.WithContext(c.Request.Context()).Model(&domain.Video{}).
		Where("created_at >= ?", since)
	if orgID := strings.TrimSpace(c.Query("org_id")); orgID != "" {
		db = db.Where("org_id = ?", orgID)
	}
	var out struct {
		CustomerRevenueCents int64 `json:"customer_revenue_cents"`
		UpstreamCostCents    int64 `json:"upstream_cost_cents"`
		MarginCents          int64 `json:"margin_cents"`
		Jobs                 int64 `json:"jobs"`
	}
	if err := db.Select(
		"COALESCE(SUM(actual_cost_cents), 0) AS customer_revenue_cents, " +
			"COALESCE(SUM(upstream_actual_cents), 0) AS upstream_cost_cents, " +
			"COALESCE(SUM(margin_cents), 0) AS margin_cents, " +
			"COUNT(*) AS jobs",
	).Scan(&out).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *AdminHandlers) loadPricingSettings(ctx context.Context) (domain.PlatformPricingSettings, error) {
	settings := domain.PlatformPricingSettings{ID: 1, Enabled: true, MinChargeCents: 1, RoundingIncrementCents: 1}
	err := h.DB.WithContext(ctx).First(&settings, "id = ?", 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return settings, nil
	}
	return settings, err
}

func tierFromReq(req tierReq, existing *domain.MembershipTier) (domain.MembershipTier, bool) {
	tier := domain.MembershipTier{Enabled: true}
	if existing != nil {
		tier = *existing
	}
	if req.Name != nil {
		tier.Name = strings.TrimSpace(*req.Name)
	}
	if req.MinLifetimeTopupCents != nil {
		tier.MinLifetimeTopupCents = *req.MinLifetimeTopupCents
	}
	if req.MarkupBPS != nil {
		tier.MarkupBPS = *req.MarkupBPS
	}
	if req.Enabled != nil {
		tier.Enabled = *req.Enabled
	}
	if req.Description != nil {
		tier.Description = strings.TrimSpace(*req.Description)
	}
	tier.UpdatedAt = time.Now()
	if existing == nil {
		tier.CreatedAt = tier.UpdatedAt
	}
	return tier, tier.Name != "" && tier.MinLifetimeTopupCents >= 0 && tier.MarkupBPS >= 0
}

func (h *AdminHandlers) orgPricingPayload(ctx context.Context, orgID string) (gin.H, error) {
	var override domain.OrgPricingOverride
	if err := h.DB.WithContext(ctx).First(&override, "org_id = ?", orgID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	var state domain.OrgPricingState
	if err := h.DB.WithContext(ctx).First(&state, "org_id = ?", orgID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	settings, err := h.loadPricingSettings(ctx)
	if err != nil {
		return nil, err
	}
	source := domain.PricingSourceGlobal
	markup := settings.DefaultMarkupBPS
	if state.EffectiveMembershipTierID != nil {
		var tier domain.MembershipTier
		if err := h.DB.WithContext(ctx).First(&tier, "id = ?", *state.EffectiveMembershipTierID).Error; err == nil && tier.Enabled {
			source = domain.PricingSourceMembership
			markup = tier.MarkupBPS
		}
	}
	if override.OverrideEnabled && override.MarkupBPS != nil {
		source = domain.PricingSourceOrgOverride
		markup = *override.MarkupBPS
	}
	return gin.H{
		"override":             override,
		"state":                state,
		"effective_markup_bps": markup,
		"pricing_source":       source,
	}, nil
}

func (h *AdminHandlers) recomputePricingStates(ctx context.Context) error {
	var states []domain.OrgPricingState
	if err := h.DB.WithContext(ctx).Find(&states).Error; err != nil {
		return err
	}
	for _, state := range states {
		autoID, err := h.bestMembershipTierID(ctx, state.LifetimeTopupCents)
		if err != nil {
			return err
		}
		state.AutoMembershipTierID = autoID
		state.EffectiveMembershipTierID = autoID
		var override domain.OrgPricingOverride
		if err := h.DB.WithContext(ctx).First(&override, "org_id = ?", state.OrgID).Error; err == nil && override.ManualMembershipTierID != nil {
			state.EffectiveMembershipTierID = override.ManualMembershipTierID
		}
		state.UpdatedAt = time.Now()
		if err := h.DB.WithContext(ctx).Save(&state).Error; err != nil {
			return err
		}
	}
	return nil
}

func (h *AdminHandlers) bestMembershipTierID(ctx context.Context, lifetimeTopupCents int64) (*string, error) {
	var tier domain.MembershipTier
	err := h.DB.WithContext(ctx).
		Where("enabled = ? AND min_lifetime_topup_cents <= ?", true, lifetimeTopupCents).
		Order("min_lifetime_topup_cents DESC").
		First(&tier).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &tier.ID, nil
}
