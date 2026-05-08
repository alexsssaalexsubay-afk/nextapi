package gateway

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"github.com/gin-gonic/gin"
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

type adminUserOrg struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Role           string     `json:"role"`
	CreditsBalance int64      `json:"credits_balance"`
	PausedAt       *time.Time `json:"paused_at,omitempty"`
	CreatedAt      *time.Time `json:"created_at,omitempty"`
}

type adminUserWithOrgs struct {
	ID             string         `json:"id"`
	Email          string         `json:"email"`
	CreatedAt      time.Time      `json:"created_at"`
	DeletedAt      *time.Time     `json:"deleted_at,omitempty"`
	CreditsBalance int64          `json:"credits_balance"`
	PrimaryOrgID   string         `json:"primary_org_id,omitempty"`
	Orgs           []adminUserOrg `json:"orgs"`
}

type adminUserOrgRow struct {
	UserID         string
	Email          string
	UserCreatedAt  time.Time
	DeletedAt      *time.Time
	OrgID          *string
	OrgName        *string
	OrgRole        *string
	OrgPausedAt    *time.Time
	OrgCreatedAt   *time.Time
	CreditsBalance int64
}

type adminOrgWithBalance struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	OwnerUserID    string     `json:"owner_user_id"`
	PausedAt       *time.Time `json:"paused_at,omitempty"`
	PauseReason    *string    `json:"pause_reason,omitempty"`
	CompanyName    *string    `json:"company_name,omitempty"`
	TaxID          *string    `json:"tax_id,omitempty"`
	BillingEmail   *string    `json:"billing_email,omitempty"`
	CountryRegion  *string    `json:"country_region,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	CreditsBalance int64      `json:"credits_balance"`
}

func (h *AdminHandlers) Orgs(c *gin.Context) {
	var rows []adminOrgWithBalance
	if err := h.DB.WithContext(c.Request.Context()).Raw(`
SELECT
  o.id,
  o.name,
  o.owner_user_id,
  o.paused_at,
  o.pause_reason,
  o.company_name,
  o.tax_id,
  o.billing_email,
  o.country_region,
  o.created_at,
  COALESCE(b.balance_cents, 0) AS credits_balance
FROM orgs o
LEFT JOIN (
  SELECT org_id, COALESCE(SUM(COALESCE(delta_cents, delta_credits, 0)), 0) AS balance_cents
  FROM credits_ledger
  GROUP BY org_id
) b ON b.org_id = o.id
ORDER BY o.created_at DESC
LIMIT 500`).Scan(&rows).Error; err != nil {
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
	args := []any{}
	where := ""
	if q != "" {
		like := "%" + q + "%"
		where = `
WHERE u.email ILIKE ?
   OR u.id ILIKE ?
   OR o.name ILIKE ?
   OR CAST(o.id AS TEXT) ILIKE ?`
		args = append(args, like, like, like, like)
	}
	args = append(args, 500)

	var rows []adminUserOrgRow
	query := `
SELECT
  u.id AS user_id,
  u.email AS email,
  u.created_at AS user_created_at,
  u.deleted_at AS deleted_at,
  o.id AS org_id,
  o.name AS org_name,
  om.role AS org_role,
  o.paused_at AS org_paused_at,
  o.created_at AS org_created_at,
  COALESCE(b.balance_cents, 0) AS credits_balance
FROM users u
LEFT JOIN org_members om ON om.user_id = u.id
LEFT JOIN orgs o ON o.id = om.org_id
LEFT JOIN (
  SELECT org_id, COALESCE(SUM(COALESCE(delta_cents, delta_credits, 0)), 0) AS balance_cents
  FROM credits_ledger
  GROUP BY org_id
) b ON b.org_id = o.id
` + where + `
ORDER BY u.created_at DESC, o.created_at DESC
LIMIT ?`

	if err := h.DB.WithContext(c.Request.Context()).Raw(query, args...).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	users := make([]adminUserWithOrgs, 0)
	byID := map[string]int{}
	for _, row := range rows {
		idx, ok := byID[row.UserID]
		if !ok {
			byID[row.UserID] = len(users)
			users = append(users, adminUserWithOrgs{
				ID:        row.UserID,
				Email:     row.Email,
				CreatedAt: row.UserCreatedAt,
				DeletedAt: row.DeletedAt,
				Orgs:      []adminUserOrg{},
			})
			idx = len(users) - 1
		}
		if row.OrgID == nil || *row.OrgID == "" {
			continue
		}
		org := adminUserOrg{
			ID:             *row.OrgID,
			CreditsBalance: row.CreditsBalance,
			PausedAt:       row.OrgPausedAt,
			CreatedAt:      row.OrgCreatedAt,
		}
		if row.OrgName != nil {
			org.Name = *row.OrgName
		}
		if row.OrgRole != nil {
			org.Role = *row.OrgRole
		}
		users[idx].Orgs = append(users[idx].Orgs, org)
		users[idx].CreditsBalance += row.CreditsBalance
		if users[idx].PrimaryOrgID == "" {
			users[idx].PrimaryOrgID = org.ID
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": users})
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
	OrgID  string `json:"org_id"`
	UserID string `json:"user_id"`
	Delta  int64  `json:"delta" binding:"required"`
	Note   string `json:"note"`
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
	orgID := strings.TrimSpace(r.OrgID)
	userID := strings.TrimSpace(r.UserID)
	targetType := "org"
	targetID := orgID
	if orgID == "" && userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "org_id or user_id is required"}})
		return
	}
	if orgID == "" {
		resolved, err := h.resolveUserAdjustmentOrg(ctx, userID)
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "user_org_not_found", "message": "user has no organization to adjust"}})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
			return
		}
		orgID = resolved
		targetType = "user"
		targetID = userID
	}
	err := h.Billing.AddCredits(ctx, billing.Entry{
		OrgID:  orgID,
		Delta:  r.Delta,
		Reason: domain.ReasonAdjustment,
		Note:   r.Note,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(ctx, h.DB, c, "credits.adjust", targetType, targetID, gin.H{
		"org_id":      orgID,
		"user_id":     userID,
		"delta_cents": r.Delta,
		"note":        r.Note,
	})
	if h.Notify != nil {
		// Always email — credits adjustments are real money and absent
		// MFA we want a second pair of eyes (the inbox) on every change.
		h.Notify.SendOwner(
			fmt.Sprintf("[NextAPI] credits adjusted %+d¢ on %s", r.Delta, orgID),
			fmt.Sprintf("Operator %s adjusted credits by %+d cents on org %s.\nTarget user: %s\nNote: %s\nLedger: SELECT * FROM credits_ledger WHERE org_id='%s' ORDER BY created_at DESC LIMIT 5;",
				resolveActor(c), r.Delta, orgID, userID, r.Note, orgID),
		)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandlers) resolveUserAdjustmentOrg(ctx context.Context, userID string) (string, error) {
	var out string
	err := h.DB.WithContext(ctx).Raw(`
SELECT o.id
FROM orgs o
LEFT JOIN org_members om ON om.org_id = o.id AND om.user_id = ?
WHERE o.owner_user_id = ? OR om.user_id = ?
ORDER BY
  CASE
    WHEN o.owner_user_id = ? THEN 0
    WHEN om.role = 'owner' THEN 1
    WHEN om.role = 'admin' THEN 2
    ELSE 3
  END,
  o.created_at DESC
LIMIT 1`, userID, userID, userID, userID).Scan(&out).Error
	if err != nil {
		return "", err
	}
	if out == "" {
		return "", gorm.ErrRecordNotFound
	}
	return out, nil
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
	var affected int64
	err := h.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&domain.Job{}).
			Where("id = ? AND status IN ('queued','running')", id).
			Updates(map[string]any{
				"status":        domain.JobFailed,
				"error_code":    code,
				"error_message": msg,
				"completed_at":  now,
			})
		if res.Error != nil {
			return res.Error
		}
		affected = res.RowsAffected
		if affected == 0 {
			return nil
		}
		return tx.Model(&domain.Video{}).Where("upstream_job_id = ?", job.ID).Updates(map[string]any{
			"status":        "failed",
			"error_code":    code,
			"error_message": msg,
			"finished_at":   now,
		}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	// If 0 rows were affected the job transitioned to a terminal state
	// between our initial SELECT and this UPDATE (e.g. the processor
	// completed it concurrently). Do not refund — the processor already
	// handled it.
	if affected == 0 {
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
		"org_id":          job.OrgID,
		"refunded_cents":  job.ReservedCredits,
		"original_status": job.Status,
	})

	c.JSON(http.StatusOK, gin.H{"affected": affected})
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

// countCreditsUsedAllTime sums -delta_credits for every spending row across
// all orgs (usage, consumption, reconciliation, manual debits, etc.).
func countCreditsUsedAllTime(ctx context.Context, db *gorm.DB) int64 {
	var n int64
	_ = db.WithContext(ctx).Model(&domain.CreditsLedger{}).
		Where("delta_credits < 0").
		Select("COALESCE(SUM(-delta_credits), 0)").Scan(&n)
	return n
}

func (h *AdminHandlers) OverviewStats(c *gin.Context) {
	ctx := c.Request.Context()
	var o Overview
	h.DB.WithContext(ctx).Model(&domain.User{}).Where("deleted_at IS NULL").Count(&o.UsersTotal)
	h.DB.WithContext(ctx).Model(&domain.Job{}).
		Where("created_at >= ?", time.Now().Add(-24*time.Hour)).
		Count(&o.JobsLast24h)
	o.CreditsUsedAll = countCreditsUsedAllTime(ctx, h.DB)
	c.JSON(http.StatusOK, o)
}

type operatorBudgetResp struct {
	BudgetCredits      *int64     `json:"budget_credits"`
	CreditsUsedAllTime int64      `json:"credits_used_all_time"`
	RemainingCredits   *int64     `json:"remaining_credits"`
	UpdatedAt          *time.Time `json:"updated_at"`
}

// GetOperatorBudget returns the row in operator_platform_budget plus derived usage.
// Used is the same aggregate as the overview (all negative ledger deltas, all orgs).
func (h *AdminHandlers) GetOperatorBudget(c *gin.Context) {
	ctx := c.Request.Context()
	used := countCreditsUsedAllTime(ctx, h.DB)
	var row domain.OperatorPlatformBudget
	if err := h.DB.WithContext(ctx).Where("id = ?", 1).First(&row).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, operatorBudgetResp{
				CreditsUsedAllTime: used,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	resp := operatorBudgetResp{
		BudgetCredits:      row.BudgetCredits,
		CreditsUsedAllTime: used,
		UpdatedAt:          &row.UpdatedAt,
	}
	if row.BudgetCredits != nil {
		rem := *row.BudgetCredits - used
		if rem < 0 {
			rem = 0
		}
		resp.RemainingCredits = &rem
	}
	c.JSON(http.StatusOK, resp)
}

// PutOperatorBudget sets or clears the operator upstream budget. Requires email OTP.
// Body must include key "budget_credits": a non‑negative number, or null to clear.
// Omitted "budget_credits" key is rejected to avoid accidentally wiping the row.
func (h *AdminHandlers) PutOperatorBudget(c *gin.Context) {
	if !RequireOTP(c, h.DB) {
		return
	}
	raw, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "invalid request body"}})
		return
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil || len(m) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "expected JSON with budget_credits key"}})
		return
	}
	rawBC, has := m["budget_credits"]
	if !has {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "budget_credits is required (number or null to clear)"}})
		return
	}
	var budgetVal *int64
	if len(rawBC) == 0 || string(rawBC) == "null" {
		budgetVal = nil
	} else {
		var f float64
		if err := json.Unmarshal(rawBC, &f); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "budget_credits must be a number or null"}})
			return
		}
		if f < 0 || f > float64(math.MaxInt64) {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "budget_credits out of range"}})
			return
		}
		// Reject non-integers
		if float64(int64(f)) != f {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "budget_credits must be a whole number"}})
			return
		}
		n := int64(f)
		budgetVal = &n
	}
	now := time.Now()
	row := domain.OperatorPlatformBudget{
		ID:            1,
		BudgetCredits: budgetVal,
		UpdatedAt:     now,
	}
	ctx := c.Request.Context()
	if err := h.DB.WithContext(ctx).Save(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	RecordAudit(ctx, h.DB, c, "operator.budget", "operator_platform_budget", "1", gin.H{
		"budget_credits": budgetVal,
	})
	if h.Notify != nil {
		h.Notify.SendOwner(
			"[NextAPI] platform upstream budget updated",
			fmt.Sprintf("Operator %s set platform budget to %v credits (row id=1).",
				resolveActor(c), budgetVal),
		)
	}
	h.GetOperatorBudget(c)
}
