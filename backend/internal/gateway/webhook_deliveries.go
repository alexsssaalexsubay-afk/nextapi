package gateway

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/webhook"
	"gorm.io/gorm"
)

type WebhookDeliveryHandlers struct {
	DB       *gorm.DB
	Webhooks *webhook.Service
}

// ListDeliveries returns the delivery log for a specific webhook.
func (h *WebhookDeliveryHandlers) ListDeliveries(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	webhookID := c.Param("id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	rows, err := h.Webhooks.ListDeliveries(c.Request.Context(), org.ID, webhookID, limit, offset)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows, "has_more": len(rows) == limit})
}

// RotateSecret generates a new signing secret for a webhook.
func (h *WebhookDeliveryHandlers) RotateSecret(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	webhookID := c.Param("id")

	secretBytes := make([]byte, 32)
	_, _ = rand.Read(secretBytes)
	newSecret := "whsec_" + hex.EncodeToString(secretBytes)

	wh, err := h.Webhooks.RotateSecret(c.Request.Context(), org.ID, webhookID, newSecret)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":             wh.ID,
		"url":            wh.URL,
		"signing_secret": newSecret,
		"event_types":    wh.EventTypes,
	})
}

// AdminReplay resets a delivery for re-attempt (operator action).
// Looks up the owning webhook + org so the audit log records who got
// re-pinged, and 404s if the delivery has already been purged.
// Requires an email OTP because replaying a webhook triggers real external calls.
func (h *WebhookDeliveryHandlers) AdminReplay(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid delivery id"}})
		return
	}
	ctx := c.Request.Context()

	var d domain.WebhookDelivery
	if err := h.DB.WithContext(ctx).First(&d, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	var wh domain.Webhook
	if err := h.DB.WithContext(ctx).First(&wh, "id = ?", d.WebhookID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "webhook_missing"}})
		return
	}

	if err := h.Webhooks.Replay(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(ctx, h.DB, c, "webhook.replay", "webhook_delivery", strconv.FormatInt(id, 10), gin.H{
		"webhook_id": d.WebhookID,
		"org_id":     wh.OrgID,
		"event_type": d.EventType,
	})
	c.JSON(http.StatusAccepted, gin.H{"ok": true, "org_id": wh.OrgID})
}
