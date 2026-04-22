package gateway

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/lib/pq"
	"gorm.io/gorm"
)

type WebhookHandlers struct{ DB *gorm.DB }

type createWebhookReq struct {
	URL        string   `json:"url" binding:"required,url"`
	EventTypes []string `json:"event_types"`
}

func (h *WebhookHandlers) Create(c *gin.Context) {
	org := auth.OrgFrom(c)
	var req createWebhookReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": err.Error()}})
		return
	}
	if len(req.EventTypes) == 0 {
		req.EventTypes = []string{"job.succeeded", "job.failed"}
	}
	secretBytes := make([]byte, 32)
	_, _ = rand.Read(secretBytes)
	secret := "whsec_" + hex.EncodeToString(secretBytes)

	row := domain.Webhook{
		OrgID:      org.ID,
		URL:        req.URL,
		Secret:     secret,
		EventTypes: pq.StringArray(req.EventTypes),
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"id":          row.ID,
		"url":         row.URL,
		"secret":      row.Secret, // shown once
		"event_types": row.EventTypes,
	})
}

func (h *WebhookHandlers) List(c *gin.Context) {
	org := auth.OrgFrom(c)
	var rows []domain.Webhook
	h.DB.WithContext(c.Request.Context()).
		Where("org_id = ?", org.ID).
		Order("created_at DESC").Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		out = append(out, gin.H{
			"id":          r.ID,
			"url":         r.URL,
			"event_types": r.EventTypes,
			"created_at":  r.CreatedAt,
			"disabled_at": r.DisabledAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *WebhookHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	id := c.Param("id")
	var row domain.Webhook
	err := h.DB.WithContext(c.Request.Context()).
		Where("id = ? AND org_id = ?", id, org.ID).
		First(&row).Error
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":          row.ID,
		"url":         row.URL,
		"event_types": row.EventTypes,
		"created_at":  row.CreatedAt,
		"disabled_at": row.DisabledAt,
	})
}

func (h *WebhookHandlers) Delete(c *gin.Context) {
	org := auth.OrgFrom(c)
	id := c.Param("id")
	res := h.DB.WithContext(c.Request.Context()).
		Where("id = ? AND org_id = ?", id, org.ID).
		Delete(&domain.Webhook{})
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": res.Error.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
