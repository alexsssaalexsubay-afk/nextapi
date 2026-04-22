package gateway

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/webhook"
)

type WebhookDeliveryHandlers struct {
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
func (h *WebhookDeliveryHandlers) AdminReplay(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid delivery id"}})
		return
	}
	if err := h.Webhooks.Replay(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"ok": true})
}
