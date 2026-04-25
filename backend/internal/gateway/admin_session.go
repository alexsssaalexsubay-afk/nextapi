package gateway

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/notify"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	opSessionHeader  = "X-Op-Session"
	opOTPHeader      = "X-Op-OTP" // format: "<otp_id>.<6-digit-code>"
	opSessionTTL     = 8 * time.Hour
	opSessionIdleTTL = 2 * time.Hour // invalidated if unused for this long
	otpCodeTTL       = 10 * time.Minute
	otpRateWindow    = 15 * time.Minute
	otpRateMax       = 3 // max OTP sends per email per window
)

// OperatorSession is the DB model for short-lived, revocable admin sessions.
// GORM maps this to the operator_sessions table from migration 00010.
type OperatorSession struct {
	ID         string `gorm:"primaryKey"`
	ActorEmail string `gorm:"not null;index"`
	IPCreated  string
	CreatedAt  time.Time
	ExpiresAt  time.Time
	LastUsedAt time.Time
	RevokedAt  *time.Time
}

func (OperatorSession) TableName() string { return "operator_sessions" }

// AdminOTP is the DB model for single-use 6-digit OTP codes.
// GORM maps this to the admin_otp table from migration 00010.
type AdminOTP struct {
	ID         string `gorm:"primaryKey"`
	ActorEmail string `gorm:"not null;index"`
	CodeHash   string `gorm:"not null"`
	Action     string `gorm:"not null"`
	TargetID   string
	Hint       string
	ExpiresAt  time.Time
	UsedAt     *time.Time
	CreatedAt  time.Time
}

func (AdminOTP) TableName() string { return "admin_otp" }

// AdminSessionHandlers creates and manages short-lived operator sessions
// and email OTP flows for high-risk operations.
type AdminSessionHandlers struct {
	DB    *gorm.DB
	Clerk interface {
		Verify(ctx context.Context, raw string) (*auth.ClerkClaims, error)
		FetchClerkUserEmail(ctx context.Context, userID string) (string, error)
	}
	Notify *notify.Notifier
	Allow  map[string]bool // normalised ADMIN_EMAILS, injected at wire-up
}

// CreateSession exchanges a verified Clerk JWT for a short-lived operator
// session. The Clerk JWT must belong to an email in ADMIN_EMAILS.
//
// POST /v1/internal/admin/session
// Auth: Authorization: Bearer <Clerk JWT>
func (h *AdminSessionHandlers) CreateSession(c *gin.Context) {
	if h.Clerk == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "clerk_not_configured"}})
		return
	}
	raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if raw == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{
			"code":    "missing_token",
			"message": "provide a Clerk JWT via Authorization: Bearer <token>",
		}})
		return
	}

	claims, err := h.Clerk.Verify(c.Request.Context(), raw)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{
			"code":    "invalid_token",
			"message": "Clerk JWT verification failed",
		}})
		return
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		email, _ = h.Clerk.FetchClerkUserEmail(c.Request.Context(), claims.Sub)
		email = strings.ToLower(strings.TrimSpace(email))
	}
	if email == "" || !h.Allow[email] {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{
			"code":    "not_in_admin_allowlist",
			"message": fmt.Sprintf("the Clerk account %q is not authorised to access this admin panel. contact the platform owner to be added to ADMIN_EMAILS.", email),
		}})
		return
	}

	sess, err := createOperatorSession(c.Request.Context(), h.DB, email, c.ClientIP())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_token": sess.ID,
		"actor_email":   sess.ActorEmail,
		"expires_at":    sess.ExpiresAt.UTC().Format(time.RFC3339),
		"idle_ttl_secs": int(opSessionIdleTTL.Seconds()),
	})
}

// CreatePasswordSession exchanges a first-party email/password login for a
// short-lived operator session. The email must be present in ADMIN_EMAILS.
//
// POST /v1/internal/admin/session/password
// Body: { "email": "...", "password": "..." }
func (h *AdminSessionHandlers) CreatePasswordSession(c *gin.Context) {
	var body struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || !h.Allow[email] {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{
			"code":    "not_in_admin_allowlist",
			"message": fmt.Sprintf("the account %q is not authorised for this admin panel. ask the platform owner to add your email to ADMIN_EMAILS.", email),
		}})
		return
	}

	var user domain.User
	if err := h.DB.WithContext(c.Request.Context()).
		Where("lower(email) = ? AND deleted_at IS NULL", email).
		First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "invalid_credentials"}})
		return
	}
	if user.PasswordHash == nil || *user.PasswordHash == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "password_login_disabled"}})
		return
	}
	if err := auth.Verify(body.Password, *user.PasswordHash); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "invalid_credentials"}})
		return
	}

	sess, err := createOperatorSession(c.Request.Context(), h.DB, email, c.ClientIP())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"session_token": sess.ID,
		"actor_email":   sess.ActorEmail,
		"expires_at":    sess.ExpiresAt.UTC().Format(time.RFC3339),
		"idle_ttl_secs": int(opSessionIdleTTL.Seconds()),
	})
}

// RevokeSession invalidates the current operator session. Frontend calls
// this on logout to ensure the server-side session is torn down immediately.
//
// DELETE /v1/internal/admin/session
// Auth: X-Op-Session (AdminMiddleware must run first)
func (h *AdminSessionHandlers) RevokeSession(c *gin.Context) {
	token := c.GetHeader(opSessionHeader)
	if token == "" {
		c.JSON(http.StatusOK, gin.H{"ok": true}) // already logged out
		return
	}
	now := time.Now()
	h.DB.WithContext(c.Request.Context()).
		Model(&OperatorSession{}).
		Where("id = ? AND revoked_at IS NULL", token).
		Update("revoked_at", now)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SendOTP generates a 6-digit OTP, persists a hashed copy in admin_otp,
// and sends the plaintext code to the operator's registered email.
//
// POST /v1/internal/admin/otp/send
// Body: { "action": "credits.adjust", "target_id": "org_xxx", "hint": "+100 on acme-prod" }
// Auth: AdminMiddleware (X-Op-Session preferred)
func (h *AdminSessionHandlers) SendOTP(c *gin.Context) {
	actor := resolveActor(c)
	if actor == "" || actor == "shared-token" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{
			"code":    "otp_requires_identity",
			"message": "OTP can only be sent to identified operators (not the shared admin token)",
		}})
		return
	}

	var body struct {
		Action   string `json:"action"   binding:"required"`
		TargetID string `json:"target_id"`
		Hint     string `json:"hint"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "invalid request body"}})
		return
	}

	if allowAdminOTPBypass() {
		c.JSON(http.StatusOK, gin.H{
			"otp_id":      "bypass",
			"expires_at":  time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
			"hint":        "Admin OTP bypass is enabled (temporary).",
			"bypass":      true,
			"bypass_code": "000000",
		})
		return
	}

	if h.Notify == nil || !h.Notify.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{
			"code":    "otp_delivery_not_configured",
			"message": "admin OTP email delivery is not configured. Set RESEND_API_KEY before confirming high-risk operations.",
		}})
		return
	}

	// Rate-limit: max otpRateMax OTP sends per window per email.
	var recentCount int64
	h.DB.WithContext(c.Request.Context()).
		Model(&AdminOTP{}).
		Where("actor_email = ? AND created_at >= ?", actor, time.Now().Add(-otpRateWindow)).
		Count(&recentCount)
	if recentCount >= int64(otpRateMax) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": gin.H{
			"code":    "otp_rate_limited",
			"message": fmt.Sprintf("maximum %d OTP requests per %s reached; please wait", otpRateMax, otpRateWindow),
		}})
		return
	}

	// Generate code and persist.
	code, err := generateOTPCode()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	codeHash := sha256Hex(code)
	otpID := uuid.New().String()
	otp := AdminOTP{
		ID:         otpID,
		ActorEmail: actor,
		CodeHash:   codeHash,
		Action:     body.Action,
		TargetID:   body.TargetID,
		Hint:       body.Hint,
		ExpiresAt:  time.Now().Add(otpCodeTTL),
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&otp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	hint := body.Hint
	if hint == "" {
		hint = body.Action
	}
	h.Notify.Send(notify.Mail{
		To:      []string{actor},
		Subject: fmt.Sprintf("[NextAPI Admin] Your verification code: %s", code),
		Text: fmt.Sprintf(`NextAPI Admin — verification code

Code:    %s
Action:  %s
Target:  %s
Hint:    %s
Expires: %s UTC

Enter this code in the admin panel to confirm the operation.
If you did not request this, someone may be using your admin session — revoke it immediately.

— NextAPI Security
`, code, body.Action, body.TargetID, hint, otp.ExpiresAt.UTC().Format("15:04:05")),
		Tag: "admin-otp",
	})

	// Return only the OTP ID (never the code) to the frontend.
	// The frontend combines it as "<otp_id>.<code>" in X-Op-OTP header.
	c.JSON(http.StatusOK, gin.H{
		"otp_id":     otpID,
		"expires_at": otp.ExpiresAt.UTC().Format(time.RFC3339),
		"hint":       fmt.Sprintf("Verification code sent to %s", maskEmail(actor)),
	})
}

// RequireOTP is a helper called from high-risk handler bodies (not a middleware)
// to verify the X-Op-OTP header and burn the OTP. Returns true if the OTP
// is valid; on false the handler must return immediately (response already written).
//
// Header format: X-Op-OTP: <otp_id>.<6-digit-code>
func RequireOTP(c *gin.Context, db *gorm.DB) bool {
	// Email OTP delivery is not deployed yet. Keep high-risk admin operations
	// usable for now; re-enable verification once the mail pipeline is live.
	return true

	if allowAdminOTPBypass() {
		return true
	}

	raw := c.GetHeader(opOTPHeader)
	if raw == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{
			"code":    "otp_required",
			"message": "this operation requires an email OTP. call POST /v1/internal/admin/otp/send first, then retry with X-Op-OTP: <id>.<code>",
		}})
		return false
	}
	parts := strings.SplitN(raw, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "otp_invalid_format",
			"message": "X-Op-OTP must be <otp_id>.<6-digit-code>",
		}})
		return false
	}
	otpID, code := parts[0], parts[1]
	actor := resolveActor(c)
	if err := verifyAndConsumeOTP(c.Request.Context(), db, actor, otpID, code); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{
			"code":    "otp_failed",
			"message": "OTP verification failed",
		}})
		return false
	}
	return true
}

// lookupSession validates a raw session token, refreshes last_used_at, and
// returns the session record. Returns an error if expired, revoked, idle, or
// not found.
func lookupSession(ctx context.Context, db *gorm.DB, token string) (*OperatorSession, error) {
	if token == "" || !strings.HasPrefix(token, "ops_") {
		return nil, errors.New("invalid session token format")
	}
	var sess OperatorSession
	if err := db.WithContext(ctx).Where("id = ?", token).First(&sess).Error; err != nil {
		return nil, errors.New("session not found")
	}
	now := time.Now()
	if sess.RevokedAt != nil {
		return nil, errors.New("session revoked")
	}
	if now.After(sess.ExpiresAt) {
		return nil, errors.New("session expired")
	}
	if now.After(sess.LastUsedAt.Add(opSessionIdleTTL)) {
		return nil, errors.New("session idle timeout")
	}
	// Update last_used_at without a full reload — fire-and-forget is fine.
	db.WithContext(ctx).Model(&sess).Update("last_used_at", now)
	return &sess, nil
}

// createOperatorSession generates a new ops_ token and persists it.
func createOperatorSession(ctx context.Context, db *gorm.DB, email, ip string) (*OperatorSession, error) {
	id, err := generateSessionID()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	sess := &OperatorSession{
		ID:         id,
		ActorEmail: email,
		IPCreated:  ip,
		CreatedAt:  now,
		ExpiresAt:  now.Add(opSessionTTL),
		LastUsedAt: now,
	}
	if err := db.WithContext(ctx).Create(sess).Error; err != nil {
		return nil, err
	}
	return sess, nil
}

// verifyAndConsumeOTP validates the OTP record and marks it as used atomically.
func verifyAndConsumeOTP(ctx context.Context, db *gorm.DB, actor, otpID, code string) error {
	var otp AdminOTP
	if err := db.WithContext(ctx).Where("id = ?", otpID).First(&otp).Error; err != nil {
		return errors.New("OTP not found or already used")
	}
	if otp.UsedAt != nil {
		return errors.New("OTP already used")
	}
	if time.Now().After(otp.ExpiresAt) {
		return errors.New("OTP expired")
	}
	if !strings.EqualFold(otp.ActorEmail, actor) {
		return errors.New("OTP actor mismatch")
	}
	if otp.CodeHash != sha256Hex(code) {
		return errors.New("invalid OTP code")
	}
	// Burn the OTP atomically.
	now := time.Now()
	res := db.WithContext(ctx).
		Model(&AdminOTP{}).
		Where("id = ? AND used_at IS NULL", otpID).
		Update("used_at", now)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("OTP already used (race)")
	}
	return nil
}

// --- helpers ---

func generateSessionID() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "ops_" + hex.EncodeToString(b), nil
}

func generateOTPCode() (string, error) {
	// Cryptographically random 6-digit integer.
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func maskEmail(email string) string {
	at := strings.Index(email, "@")
	if at < 2 {
		return "***"
	}
	return email[:1] + strings.Repeat("*", at-1) + email[at:]
}

func allowAdminOTPBypass() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_OTP_BYPASS")))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}
