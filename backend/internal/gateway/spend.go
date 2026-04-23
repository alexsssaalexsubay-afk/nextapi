package gateway

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/spend"
	"gorm.io/gorm"
)

type SpendHandlers struct {
	Svc *spend.Service
	DB  *gorm.DB // required for admin OTP gate on Unpause
}

func (h *SpendHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	ctx := c.Request.Context()
	sc, err := h.Svc.Get(ctx, org.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	burnRate, _ := h.Svc.BurnRateCentsPerDay(ctx, org.ID)

	var pausedAt, pauseReason any
	var orgRow struct {
		PausedAt    *string
		PauseReason *string
	}
	h.Svc.DB().WithContext(ctx).Raw(
		`SELECT paused_at, pause_reason FROM orgs WHERE id = ?`, org.ID).Scan(&orgRow)
	pausedAt = orgRow.PausedAt
	pauseReason = orgRow.PauseReason

	c.JSON(http.StatusOK, gin.H{
		"hard_cap_cents":             sc.HardCapCents,
		"soft_alert_cents":           sc.SoftAlertCents,
		"auto_pause_below_cents":     sc.AutoPauseBelowCents,
		"monthly_limit_cents":        sc.MonthlyLimitCents,
		"period_resets_on":           sc.PeriodResetsOn,
		"burn_rate_cents_per_day":    burnRate,
		"paused_at":                  pausedAt,
		"pause_reason":               pauseReason,
	})
}

type spendPutReq struct {
	HardCapCents        *int64 `json:"hard_cap_cents"`
	SoftAlertCents      *int64 `json:"soft_alert_cents"`
	AutoPauseBelowCents *int64 `json:"auto_pause_below_cents"`
	MonthlyLimitCents   *int64 `json:"monthly_limit_cents"`
	PeriodResetsOn      *int16 `json:"period_resets_on"`
}

func (h *SpendHandlers) Put(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var r spendPutReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	sc, err := h.Svc.Upsert(c.Request.Context(), org.ID, spend.UpdateInput{
		HardCapCents: r.HardCapCents, SoftAlertCents: r.SoftAlertCents,
		AutoPauseBelowCents: r.AutoPauseBelowCents,
		MonthlyLimitCents:   r.MonthlyLimitCents,
		PeriodResetsOn:      r.PeriodResetsOn,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, sc)
}

func (h *SpendHandlers) ListAlerts(c *gin.Context) {
	org := auth.OrgFrom(c)
	var rows []domain.SpendAlert
	// Uses the same db via spend service's hidden field; simpler: inline query.
	tx := h.Svc.DB()
	if tx == nil {
		c.JSON(http.StatusOK, gin.H{"data": []any{}, "has_more": false})
		return
	}
	tx.WithContext(c.Request.Context()).
		Where("org_id = ?", org.ID).
		Order("fired_at DESC").Limit(50).Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows, "has_more": false})
}

// Unpause removes the pause flag on an org. This is a high-risk operation
// (it re-enables billing) so it requires an email OTP in addition to admin auth.
func (h *SpendHandlers) Unpause(c *gin.Context) {
	if h.DB != nil && !RequireOTP(c, h.DB) {
		return
	}
	id := c.Param("id")
	if err := h.Svc.Unpause(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

var _ = gorm.DB{}
