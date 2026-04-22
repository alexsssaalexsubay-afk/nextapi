package gateway

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/moderation"
)

type ModerationHandlers struct {
	Svc *moderation.Service
}

func (h *ModerationHandlers) GetProfile(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	p, err := h.Svc.GetProfile(c.Request.Context(), org.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"profile":      p.Profile,
		"custom_rules": p.CustomRules,
	})
}

func (h *ModerationHandlers) UpsertProfile(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var body moderation.UpsertInput
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": err.Error()}})
		return
	}
	p, err := h.Svc.UpsertProfile(c.Request.Context(), org.ID, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"profile":      p.Profile,
		"custom_rules": p.CustomRules,
	})
}

func (h *ModerationHandlers) AdminListEvents(c *gin.Context) {
	orgID := c.Query("org_id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	events, err := h.Svc.ListEvents(c.Request.Context(), orgID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": events, "has_more": len(events) == limit})
}

func (h *ModerationHandlers) AdminAddNote(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid event id"}})
		return
	}
	var body struct {
		InternalNote string `json:"internal_note" binding:"required"`
		Reviewer     string `json:"reviewer" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": err.Error()}})
		return
	}
	if err := h.Svc.AddReviewNote(c.Request.Context(), id, body.InternalNote, body.Reviewer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
