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
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"gorm.io/gorm"
)

// AdminActorCtxKey is the gin context key that AdminMiddleware writes the
// resolved operator email (or "shared-token") under, used by RecordAudit.
const AdminActorCtxKey = "nextapi.admin.actor"

// AdminMiddleware gates /v1/internal/admin/* with three accepted credentials,
// in priority order:
//
//  1. X-Op-Session: ops_<token>  (primary — admin UI sessions, short-lived,
//     DB-backed, revocable). Created via POST /v1/internal/admin/session.
//
//  2. Authorization: Bearer <Clerk JWT>  (fallback for direct tooling and for
//     the initial session creation call itself). JWT is verified via Clerk JWKS;
//     the email claim must be in ADMIN_EMAILS.
//
//  3. X-Admin-Token: <ADMIN_TOKEN>  (cron jobs, scripts, Prometheus probes).
//     Constant-time compare against env. Strongly discouraged for browsers.
//
// At least one of (CLERK_ISSUER+ADMIN_EMAILS) or ADMIN_TOKEN must be set;
// a deployment with neither configured is rejected with admin_disabled.
func AdminMiddleware(
	verifier interface {
		Verify(ctx context.Context, raw string) (*auth.ClerkClaims, error)
		FetchClerkUserEmail(ctx context.Context, userID string) (string, error)
	},
	db *gorm.DB,
) gin.HandlerFunc {
	want := os.Getenv("ADMIN_TOKEN")
	allow := normalizeAdminEmails(os.Getenv("ADMIN_EMAILS"))

	return func(c *gin.Context) {
		// Path 1: operator session token (preferred for browser UI).
		if tok := c.GetHeader(opSessionHeader); tok != "" && db != nil {
			sess, err := lookupSession(c.Request.Context(), db, tok)
			if err == nil {
				c.Set(AdminActorCtxKey, sess.ActorEmail)
				c.Next()
				return
			}
			// Expired / revoked / idle — fall through so a concurrent
			// Clerk-JWT retry (from admin-api.ts) can still succeed,
			// but tell the client explicitly.
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": gin.H{
				"code":    "session_invalid",
				"message": "operator session expired or revoked; re-authenticate via POST /v1/internal/admin/session",
			}})
			return
		}

		// Path 2: Clerk JWT (browser initial auth + direct tooling).
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
				// Authenticated Clerk account but NOT in allowlist — explicit denial.
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{
					"code":    "not_in_admin_allowlist",
					"message": fmt.Sprintf("the account %q is not authorised for this admin panel. ask the platform owner to add your email to ADMIN_EMAILS.", email),
				}})
				return
			}
			// Bad / expired JWT: fall through to X-Admin-Token so a curl
			// with the shared token still works in the same request.
		}

		// Path 3: shared X-Admin-Token (cron / scripts only — never browsers).
		if want != "" {
			got := c.GetHeader("X-Admin-Token")
			if got != "" && subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1 {
				c.Set(AdminActorCtxKey, "shared-token")
				c.Next()
				return
			}
		}

		if want == "" && len(allow) == 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{
				"code":    "admin_disabled",
				"message": "no admin credentials are configured on this server",
			}})
			return
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{
			"code":    "forbidden",
			"message": "valid admin credentials required (X-Op-Session, Bearer JWT, or X-Admin-Token)",
		}})
	}
}

// NormalizeAdminEmails parses a comma-separated ADMIN_EMAILS value into a
// case-folded set. Exported so main.go can reuse it for AdminSessionHandlers.
func NormalizeAdminEmails(raw string) map[string]bool {
	out := map[string]bool{}
	for _, e := range strings.Split(raw, ",") {
		t := strings.ToLower(strings.TrimSpace(e))
		if t != "" && t != "<set-your-admin-email@example.com>" {
			out[t] = true
		}
	}
	return out
}

// normalizeAdminEmails is the package-private alias kept for in-package use.
func normalizeAdminEmails(raw string) map[string]bool {
	return NormalizeAdminEmails(raw)
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
	if !RequireOTP(c, h.DB) {
		return
	}
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

func (h *AdminHandlers) AllLedger(c *gin.Context) {
	limit := 200
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	var rows []domain.CreditsLedger
	if err := h.DB.WithContext(c.Request.Context()).
		Order("created_at DESC").Limit(limit).
		Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *AdminHandlers) Leads(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	db := h.DB.WithContext(c.Request.Context()).Model(&domain.SalesLead{})
	if q != "" {
		db = db.Where("email ILIKE ? OR company ILIKE ?", "%"+q+"%", "%"+q+"%")
	}
	var rows []domain.SalesLead
	if err := db.Order("created_at DESC").Limit(200).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *AdminHandlers) MarkLeadContacted(c *gin.Context) {
	id := c.Param("id")
	now := time.Now()
	res := h.DB.WithContext(c.Request.Context()).
		Model(&domain.SalesLead{}).Where("id = ?", id).
		Update("contacted_at", now)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	RecordAudit(c.Request.Context(), h.DB, c, "lead.contacted", "sales_lead", id, nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
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
	if !RequireOTP(c, h.DB) {
		return
	}
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
	// If 0 rows were affected the job transitioned to a terminal state
	// between our initial SELECT and this UPDATE (e.g. the processor
	// completed it concurrently). Do not refund — the processor already
	// handled it.
	if res.RowsAffected == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{
			"code":    "already_terminal",
			"message": "job reached a terminal state before the cancel could be applied",
		}})
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
