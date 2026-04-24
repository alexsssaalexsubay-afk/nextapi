package gateway

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
)

type createManagedAccountReq struct {
	Email          string `json:"email" binding:"required"`
	Password       string `json:"password" binding:"required"`
	OrgName        string `json:"org_name"`
	InitialCredits int64  `json:"initial_credits"`
	Note           string `json:"note"`
}

func (h *AccountAuthHandlers) AdminCreateManagedAccount(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var req createManagedAccountReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	if req.InitialCredits < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_initial_credits"}})
		return
	}
	user, org, err := h.createPasswordAccount(c.Request.Context(), createPasswordAccountInput{
		Email:          req.Email,
		Password:       req.Password,
		OrgName:        req.OrgName,
		InitialCredits: req.InitialCredits,
		Note:           req.Note,
	})
	if err != nil {
		if errors.Is(err, errAccountExists) {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "account_exists"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "account_create_failed"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "account.create_managed", "user", user.ID, gin.H{
		"email":           strings.ToLower(strings.TrimSpace(user.Email)),
		"org_id":          org.ID,
		"initial_credits": req.InitialCredits,
	})
	c.JSON(http.StatusCreated, gin.H{
		"user": gin.H{"id": user.ID, "email": user.Email},
		"org":  gin.H{"id": org.ID, "name": org.Name},
	})
}

func (h *AccountAuthHandlers) AdminSetPassword(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_password"}})
		return
	}
	hash, err := auth.Hash(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "password_hash_failed"}})
		return
	}
	userID := c.Param("id")
	if err := h.DB.WithContext(c.Request.Context()).
		Model(&domain.User{}).
		Where("id = ?", userID).
		Update("password_hash", hash).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "password_update_failed"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "account.set_password", "user", userID, nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
