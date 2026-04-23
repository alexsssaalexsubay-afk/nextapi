package gateway

import (
	"context"
	"crypto/subtle"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/spend"
	"github.com/sanidg/nextapi/backend/internal/throughput"
	"gorm.io/gorm"
)

// AdminAuthHeader is the gin context key the middleware writes the
// resolved operator email under, so RecordAudit can attribute actions
// to a real human (Clerk JWT path) instead of just "shared token".
const AdminActorCtxKey = "nextapi.admin.actor"

// AdminMiddleware gates /v1/internal/admin/* with two accepted
// credentials, in priority order:
//
//  1. Authorization: Bearer <Clerk JWT>
//     Verified via Clerk JWKS, then `email` must be in ADMIN_EMAILS.
//     This is what the admin web UI uses now — no shared secret ever
//     reaches the browser.
//
//  2. X-Admin-Token: <ADMIN_TOKEN>
//     Constant-time compare against env. Kept for cron jobs, internal
//     scripts, prometheus probes, and any tooling that doesn't want a
//     Clerk identity. Strongly discouraged for browsers.
//
// At least one of the two must be configured (CLERK_ISSUER+ADMIN_EMAILS
// or ADMIN_TOKEN); a plain "no auth at all" deployment is rejected.
func AdminMiddleware(verifier interface {
	Verify(ctx context.Context, raw string) (*auth.ClerkClaims, error)
	FetchClerkUserEmail(ctx context.Context, userID string) (string, error)
}) gin.HandlerFunc {
	want := os.Getenv("ADMIN_TOKEN")
	allow := normalizeAdminEmails(os.Getenv("ADMIN_EMAILS"))

	return func(c *gin.Context) {
		// Path 1: Clerk JWT (browser).
		if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") && verifier != nil {
			tok := strings.TrimPrefix(h, "Bearer ")
			claims, err := verifier.Verify(c.Request.Context(), tok)
			if err == nil {
				email := strings.ToLower(strings.TrimSpace(claims.Email))
				if email == "" {
					email, _ = verifier.FetchClerkUserEmail(c.Request.Context(), claims.Sub)
					email = strings.ToLower(strings.TrimSpace(email))
				}
				if email != "" && allow[email] {
					c.Set(AdminActorCtxKey, email)
					c.Next()
					return
				}
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{
					"code":    "not_in_admin_allowlist",
					"message": "your Clerk email is not listed in ADMIN_EMAILS",
				}})
				return
			}
			// Bad JWT falls through to X-Admin-Token check below so an
			// admin curl with the shared token still works even if the
			// Clerk header is stale.
		}

		// Path 2: shared X-Admin-Token (cron / tools).
		if want != "" {
			got := c.GetHeader("X-Admin-Token")
			if got != "" && subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1 {
				c.Set(AdminActorCtxKey, "shared-token")
				c.Next()
				return
			}
		}

		if want == "" && len(allow) == 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "admin_disabled"}})
			return
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "forbidden"}})
	}
}

func normalizeAdminEmails(raw string) map[string]bool {
	out := map[string]bool{}
	for _, e := range strings.Split(raw, ",") {
		t := strings.ToLower(strings.TrimSpace(e))
		if t != "" && t != "<set-your-admin-email@example.com>" {
			out[t] = true
		}
	}
	return out
}

type AdminHandlers struct {
	DB         *gorm.DB
	Billing    *billing.Service
	Spend      *spend.Service
	Throughput *throughput.Service
	// Notify is optional; when set we email the owner on
	// state-changing admin actions so audit + email are kept in sync.
	Notify interface {
		SendOwner(subject, text string)
	}
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
	ctx := c.Request.Context()
	if err := h.DB.WithContext(ctx).
		Model(&domain.Org{}).Where("id = ?", id).
		Updates(map[string]any{"paused_at": now, "pause_reason": reason}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(ctx, h.DB, c, "org.pause", "org", id, gin.H{"reason": reason})
	if h.Notify != nil {
		h.Notify.SendOwner(
			fmt.Sprintf("[NextAPI] org paused — %s", id),
			fmt.Sprintf("Operator %s paused org %s.\nReason: %s\nUnpause: POST /v1/internal/admin/orgs/%s/unpause",
				resolveActor(c), id, reason, id),
		)
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
	ctx := c.Request.Context()
	err := h.Billing.AddCredits(ctx, billing.Entry{
		OrgID:  r.OrgID,
		Delta:  r.Delta,
		Reason: domain.ReasonAdjustment,
		Note:   r.Note,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(ctx, h.DB, c, "credits.adjust", "org", r.OrgID, gin.H{
		"delta_cents": r.Delta,
		"note":        r.Note,
	})
	if h.Notify != nil {
		// Always email — credits adjustments are real money and absent
		// MFA we want a second pair of eyes (the inbox) on every change.
		h.Notify.SendOwner(
			fmt.Sprintf("[NextAPI] credits adjusted %+d¢ on %s", r.Delta, r.OrgID),
			fmt.Sprintf("Operator %s adjusted credits by %+d cents on org %s.\nNote: %s\nLedger: SELECT * FROM credits_ledger WHERE org_id='%s' ORDER BY created_at DESC LIMIT 5;",
				resolveActor(c), r.Delta, r.OrgID, r.Note, r.OrgID),
		)
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
		// Release the per-key slot too — without this, an admin
		// cancelling a runaway key never frees the per-key concurrency
		// budget and the customer hits "max in-flight" forever.
		h.Throughput.ReleaseForKey(ctx, job.OrgID, job.APIKeyID, job.ID)
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

	RecordAudit(ctx, h.DB, c, "job.cancel", "job", job.ID, gin.H{
		"org_id":           job.OrgID,
		"refunded_cents":   job.ReservedCredits,
		"original_status":  job.Status,
	})

	c.JSON(http.StatusOK, gin.H{"affected": res.RowsAffected})
}

// Audit returns the most recent audit log entries.
// Filters: ?actor=email, ?target_type=org, ?target_id=<id>, ?action=org.pause, ?limit=200
func (h *AdminHandlers) Audit(c *gin.Context) {
	ctx := c.Request.Context()
	q := h.DB.WithContext(ctx).Model(&domain.AuditLog{})
	if v := strings.TrimSpace(c.Query("actor")); v != "" {
		q = q.Where("actor_email ILIKE ?", "%"+v+"%")
	}
	if v := strings.TrimSpace(c.Query("target_type")); v != "" {
		q = q.Where("target_type = ?", v)
	}
	if v := strings.TrimSpace(c.Query("target_id")); v != "" {
		q = q.Where("target_id = ?", v)
	}
	if v := strings.TrimSpace(c.Query("action")); v != "" {
		q = q.Where("action = ?", v)
	}
	limit := 200
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	var rows []domain.AuditLog
	if err := q.Order("created_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
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
	// Sum every credit-consuming entry (anything with a negative delta:
	// usage, reconciliation, manual debit). The previous query only saw
	// `reconciliation` rows and reported a misleading "credits used"
	// figure that was wildly low.
	h.DB.WithContext(ctx).Model(&domain.CreditsLedger{}).
		Where("delta_credits < 0").
		Select("COALESCE(SUM(-delta_credits), 0)").Scan(&o.CreditsUsedAll)
	c.JSON(http.StatusOK, o)
}
