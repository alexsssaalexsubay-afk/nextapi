package gateway

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
)

func (h *Handlers) Usage(c *gin.Context) {
	org := auth.OrgFrom(c)
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	pts, err := h.Billing.UsageDaily(c.Request.Context(), org.ID, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": pts})
}

type rechargeReq struct {
	Credits int64  `json:"credits" binding:"required"`
	Note    string `json:"note"`
}

// Recharge is a placeholder — real payment lands W7 (Stripe/Alipay/WeChat).
func (h *Handlers) Recharge(c *gin.Context) {
	org := auth.OrgFrom(c)
	var r rechargeReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	if err := h.Billing.Recharge(c.Request.Context(), org.ID, r.Credits, r.Note); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
