package gateway

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

type OrgBillingHandlers struct {
	DB *gorm.DB
}

// GetBillingSettings returns invoice fields for the authenticated org.
func (h *OrgBillingHandlers) GetBillingSettings(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var o domain.Org
	if err := h.DB.WithContext(c.Request.Context()).First(&o, "id = ?", org.ID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"company_name":   o.CompanyName,
		"tax_id":         o.TaxID,
		"billing_email":  o.BillingEmail,
		"country_region": o.CountryRegion,
	})
}

// UpdateBillingSettings updates invoice fields for the authenticated org.
func (h *OrgBillingHandlers) UpdateBillingSettings(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var body struct {
		CompanyName   *string `json:"company_name"`
		TaxID         *string `json:"tax_id"`
		BillingEmail  *string `json:"billing_email"`
		CountryRegion *string `json:"country_region"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	updates := map[string]any{}
	if body.CompanyName != nil {
		updates["company_name"] = *body.CompanyName
	}
	if body.TaxID != nil {
		updates["tax_id"] = *body.TaxID
	}
	if body.BillingEmail != nil {
		updates["billing_email"] = *body.BillingEmail
	}
	if body.CountryRegion != nil {
		updates["country_region"] = *body.CountryRegion
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "no fields to update"}})
		return
	}
	if err := h.DB.WithContext(c.Request.Context()).
		Model(&domain.Org{}).Where("id = ?", org.ID).
		Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	h.GetBillingSettings(c)
}

// AdminUpdateOrg lets operators override billing fields on any org.
func (h *OrgBillingHandlers) AdminUpdateOrg(c *gin.Context) {
	orgID := c.Param("id")
	var body struct {
		CompanyName   *string `json:"company_name"`
		TaxID         *string `json:"tax_id"`
		BillingEmail  *string `json:"billing_email"`
		CountryRegion *string `json:"country_region"`
		Name          *string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	updates := map[string]any{}
	if body.CompanyName != nil {
		updates["company_name"] = *body.CompanyName
	}
	if body.TaxID != nil {
		updates["tax_id"] = *body.TaxID
	}
	if body.BillingEmail != nil {
		updates["billing_email"] = *body.BillingEmail
	}
	if body.CountryRegion != nil {
		updates["country_region"] = *body.CountryRegion
	}
	if body.Name != nil {
		updates["name"] = *body.Name
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "no fields"}})
		return
	}
	if err := h.DB.WithContext(c.Request.Context()).
		Model(&domain.Org{}).Where("id = ?", orgID).
		Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
