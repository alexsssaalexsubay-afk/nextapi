package gateway

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/spend"
	"github.com/sanidg/nextapi/backend/internal/throughput"
	"gorm.io/gorm"
)

// AdminMiddleware gates /v1/internal/admin/* by a simple shared token
// (X-Admin-Token) plus optional email allowlist via ADMIN_EMAILS.
// Real SSO / RBAC arrives in W8.
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		want := os.Getenv("ADMIN_TOKEN")
		if want == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "admin_disabled"}})
			return
		}
		got := c.GetHeader("X-Admin-Token")
		if subtle.ConstantTimeCompare([]byte(got), []byte(want)) != 1 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "forbidden"}})
			return
		}
		c.Next()
	}
}

type AdminHandlers struct {
	DB         *gorm.DB
	Billing    *billing.Service
	Spend      *spend.Service
	Throughput *throughput.Service
}

func (h *AdminHandlers) Orgs(c *gin.Context) {
	var rows []domain.Org
	if err := h.DB.WithContext(c.Request.Context()).Order("created_at DESC").Limit(500).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *AdminHandlers) PauseOrg(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)
	now := time.Now()
	reason := body.Reason
	if reason == "" {
		reason = "admin paused"
	}
	if err := h.DB.WithContext(c.Request.Context()).
		Model(&domain.Org{}).Where("id = ?", id).
		Updates(map[string]any{"paused_at": now, "pause_reason": reason}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandlers) Users(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	db := h.DB.WithContext(c.Request.Context()).Model(&domain.User{})
	if q != "" {
		db = db.Where("email ILIKE ?", "%"+q+"%")
	}
	var rows []domain.User
	if err := db.Order("created_at DESC").Limit(200).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *AdminHandlers) Jobs(c *gin.Context) {
	status := c.Query("status")
	db := h.DB.WithContext(c.Request.Context()).Model(&domain.Job{})
	if status != "" {
		db = db.Where("status = ?", status)
	}
	var rows []domain.Job
	if err := db.Order("created_at DESC").Limit(200).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

type adjustReq struct {
	OrgID string `json:"org_id" binding:"required"`
	Delta int64  `json:"delta" binding:"required"`
	Note  string `json:"note"`
}

func (h *AdminHandlers) AdjustCredits(c *gin.Context) {
	var r adjustReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "invalid request body"}})
		return
	}
	err := h.Billing.AddCredits(c.Request.Context(), billing.Entry{
		OrgID:  r.OrgID,
		Delta:  r.Delta,
		Reason: domain.ReasonAdjustment,
		Note:   r.Note,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandlers) CancelJob(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()
	now := time.Now()

	var job domain.Job
	if err := h.DB.WithContext(ctx).Where("id = ?", id).First(&job).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	if job.Status != domain.JobQueued && job.Status != domain.JobRunning {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "already_terminal", "message": "job is already " + string(job.Status)}})
		return
	}

	code := "admin_cancelled"
	msg := "cancelled by admin"
	res := h.DB.WithContext(ctx).
		Model(&domain.Job{}).
		Where("id = ? AND status IN ('queued','running')", id).
		Updates(map[string]any{
			"status":        domain.JobFailed,
			"error_code":    code,
			"error_message": msg,
			"completed_at":  now,
		})
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	if h.Throughput != nil {
		h.Throughput.Release(ctx, job.OrgID, job.ID)
	}
	if h.Spend != nil {
		h.Spend.DecrInflight(ctx, job.OrgID, job.ReservedCredits)
	}

	if job.ReservedCredits > 0 {
		refundCents := job.ReservedCredits
		_ = h.DB.WithContext(ctx).Create(&domain.CreditsLedger{
			OrgID:        job.OrgID,
			DeltaCredits: job.ReservedCredits,
			DeltaCents:   &refundCents,
			Reason:       domain.ReasonRefund,
			JobID:        &job.ID,
			Note:         "refund: admin cancelled",
		}).Error
	}

	c.JSON(http.StatusOK, gin.H{"affected": res.RowsAffected})
}

type Overview struct {
	UsersTotal     int64 `json:"users_total"`
	JobsLast24h    int64 `json:"jobs_last_24h"`
	CreditsUsedAll int64 `json:"credits_used_all_time"`
}

func (h *AdminHandlers) OverviewStats(c *gin.Context) {
	ctx := c.Request.Context()
	var o Overview
	h.DB.WithContext(ctx).Model(&domain.User{}).Where("deleted_at IS NULL").Count(&o.UsersTotal)
	h.DB.WithContext(ctx).Model(&domain.Job{}).
		Where("created_at >= ?", time.Now().Add(-24*time.Hour)).
		Count(&o.JobsLast24h)
	h.DB.WithContext(ctx).Model(&domain.CreditsLedger{}).
		Where("reason = ?", domain.ReasonReconciliation).
		Select("COALESCE(SUM(-delta_credits), 0)").Scan(&o.CreditsUsedAll)
	c.JSON(http.StatusOK, o)
}
