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
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/notify"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	accountSessionHeader = "X-NextAPI-Session"
	accountSessionTTL    = 30 * 24 * time.Hour
	emailOTPCodeTTL      = 5 * time.Minute
	emailOTPCooldownTTL  = 60 * time.Second
)

const consumeOTPScript = `
local v = redis.call("GET", KEYS[1])
if not v then
  return 0
end
if v ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`

type AccountAuthHandlers struct {
	DB      *gorm.DB
	Auth    *auth.Service
	Billing *billing.Service
	Redis   *redis.Client
	Notify  *notify.Notifier
}

type accountLoginReq struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password"`
	Code     string `json:"code"`
}

type accountSignupReq struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
	Name     string `json:"name"`
}

func (h *AccountAuthHandlers) Login(c *gin.Context) {
	var req accountLoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	var (
		user *domain.User
		org  *domain.Org
		err  error
	)
	if strings.TrimSpace(req.Code) != "" {
		user, org, err = h.lookupEmailOTPUser(c.Request.Context(), req.Email, req.Code)
	} else {
		user, org, err = h.lookupPasswordUser(c.Request.Context(), req.Email, req.Password)
	}
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "invalid_credentials", "message": "email or password is incorrect"}})
		return
	}
	sessionToken, sess, err := h.createAccountSession(c.Request.Context(), user.ID, org.ID, c.Request.UserAgent(), c.ClientIP())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "session_create_failed"}})
		return
	}
	key, err := h.mintDashboardKey(c.Request.Context(), org.ID, user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "dashboard_key_failed"}})
		return
	}
	h.accountSessionResponse(c, user, org, sessionToken, sess.ExpiresAt, key)
}

func (h *AccountAuthHandlers) Session(c *gin.Context) {
	user, org, sess, ok := h.requireAccountSession(c)
	if !ok {
		return
	}
	var key *auth.CreateKeyResult
	if c.Query("mint_key") == "1" || c.Query("mint_key") == "true" {
		var err error
		key, err = h.mintDashboardKey(c.Request.Context(), org.ID, user.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "dashboard_key_failed"}})
			return
		}
	}
	h.accountSessionResponse(c, user, org, "", sess.ExpiresAt, key)
}

type accountTeamMemberUsage struct {
	UserID      string    `json:"user_id"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"created_at"`
	JobsCount   int64     `json:"jobs_count"`
	CreditsUsed int64     `json:"credits_used"`
	LastUsedAt  *string   `json:"last_used_at"`
}

type accountTeamSharedUsage struct {
	JobsCount   int64 `json:"jobs_count"`
	CreditsUsed int64 `json:"credits_used"`
}

type accountTeamMemberReq struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

func (h *AccountAuthHandlers) Team(c *gin.Context) {
	user, org, _, ok := h.requireAccountSession(c)
	if !ok {
		return
	}
	role := h.roleForUser(c.Request.Context(), org.ID, user.ID)
	canManage := role == "owner" || role == "admin"
	memberFilter := ""
	args := []any{dashboardKeyName + ":%", dashboardKeyName + ":", org.ID, org.ID}
	if !canManage {
		memberFilter = "AND u.id = ?"
		args = append(args, user.ID)
	}

	var members []accountTeamMemberUsage
	if err := h.DB.WithContext(c.Request.Context()).Raw(`
SELECT
  u.id AS user_id,
  u.email AS email,
  om.role AS role,
  u.created_at AS created_at,
  COALESCE(usage.jobs_count, 0) AS jobs_count,
  COALESCE(usage.credits_used, 0) AS credits_used,
  usage.last_used_at AS last_used_at
FROM org_members om
JOIN users u ON u.id = om.user_id
LEFT JOIN (
  SELECT
    CASE
      WHEN k.name LIKE ? THEN replace(k.name, ?, '')
      ELSE ''
    END AS user_id,
    COUNT(*) AS jobs_count,
    COALESCE(SUM(COALESCE(j.cost_credits, j.reserved_credits, 0)), 0) AS credits_used,
    MAX(j.created_at) AS last_used_at
  FROM jobs j
  LEFT JOIN api_keys k ON k.id = j.api_key_id
  WHERE j.org_id = ?
  GROUP BY 1
) usage ON usage.user_id = u.id
WHERE om.org_id = ? `+memberFilter+`
ORDER BY
  CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
  u.created_at ASC`, args...).Scan(&members).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	var shared accountTeamSharedUsage
	_ = h.DB.WithContext(c.Request.Context()).Raw(`
SELECT
  COUNT(*) AS jobs_count,
  COALESCE(SUM(COALESCE(j.cost_credits, j.reserved_credits, 0)), 0) AS credits_used
FROM jobs j
LEFT JOIN api_keys k ON k.id = j.api_key_id
WHERE j.org_id = ?
  AND (k.name IS NULL OR k.name NOT LIKE ?)`, org.ID, dashboardKeyName+":%").Scan(&shared).Error

	c.JSON(http.StatusOK, gin.H{
		"org": gin.H{"id": org.ID, "name": org.Name},
		"viewer": gin.H{
			"user_id":    user.ID,
			"email":      user.Email,
			"role":       role,
			"can_manage": canManage,
		},
		"members":      members,
		"shared_usage": shared,
	})
}

func (h *AccountAuthHandlers) AddTeamMember(c *gin.Context) {
	user, org, _, ok := h.requireAccountSession(c)
	if !ok {
		return
	}
	viewerRole := h.roleForUser(c.Request.Context(), org.ID, user.ID)
	if viewerRole != "owner" && viewerRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "team_admin_required"}})
		return
	}
	var req accountTeamMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	email := normalizeEmail(req.Email)
	role := normalizeTeamRole(req.Role)
	if email == "" || !strings.Contains(email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_email"}})
		return
	}
	if role == "owner" || (role == "admin" && viewerRole != "owner") {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "insufficient_role"}})
		return
	}
	memberUser, err := h.findOrCreateTeamUser(c.Request.Context(), email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "user_create_failed"}})
		return
	}
	member := domain.OrgMember{OrgID: org.ID, UserID: memberUser.ID, Role: role}
	if err := h.DB.WithContext(c.Request.Context()).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "org_id"}, {Name: "user_id"}},
			DoUpdates: clause.Assignments(map[string]any{"role": role}),
		}).
		Create(&member).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "member_upsert_failed"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AccountAuthHandlers) UpdateTeamMember(c *gin.Context) {
	user, org, _, ok := h.requireAccountSession(c)
	if !ok {
		return
	}
	if h.roleForUser(c.Request.Context(), org.ID, user.ID) != "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "owner_required"}})
		return
	}
	targetUserID := strings.TrimSpace(c.Param("user_id"))
	var req accountTeamMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	role := normalizeTeamRole(req.Role)
	if role == "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "owner_transfer_not_supported"}})
		return
	}
	if targetUserID == "" || targetUserID == org.OwnerUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "cannot_change_owner"}})
		return
	}
	res := h.DB.WithContext(c.Request.Context()).
		Model(&domain.OrgMember{}).
		Where("org_id = ? AND user_id = ?", org.ID, targetUserID).
		Update("role", role)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "member_update_failed"}})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "member_not_found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AccountAuthHandlers) RemoveTeamMember(c *gin.Context) {
	user, org, _, ok := h.requireAccountSession(c)
	if !ok {
		return
	}
	viewerRole := h.roleForUser(c.Request.Context(), org.ID, user.ID)
	if viewerRole != "owner" && viewerRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "team_admin_required"}})
		return
	}
	targetUserID := strings.TrimSpace(c.Param("user_id"))
	if targetUserID == "" || targetUserID == org.OwnerUserID || targetUserID == user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "cannot_remove_member"}})
		return
	}
	targetRole := h.roleForUser(c.Request.Context(), org.ID, targetUserID)
	if targetRole == "admin" && viewerRole != "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "owner_required"}})
		return
	}
	res := h.DB.WithContext(c.Request.Context()).Where("org_id = ? AND user_id = ?", org.ID, targetUserID).Delete(&domain.OrgMember{})
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "member_remove_failed"}})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "member_not_found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AccountAuthHandlers) Logout(c *gin.Context) {
	raw := strings.TrimSpace(c.GetHeader(accountSessionHeader))
	if raw == "" {
		c.Status(http.StatusNoContent)
		return
	}
	now := time.Now()
	_ = h.DB.WithContext(c.Request.Context()).
		Model(&domain.AuthSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", hashToken(raw)).
		Update("revoked_at", now).Error
	c.Status(http.StatusNoContent)
}

func (h *AccountAuthHandlers) Signup(c *gin.Context) {
	if os.Getenv("AUTH_SIGNUP_ENABLED") != "true" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{
			"code":    "invite_only",
			"message": "self-service signup is not enabled yet; ask the platform owner for an account",
		}})
		return
	}
	var req accountSignupReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	user, org, err := h.createPasswordAccount(c.Request.Context(), createPasswordAccountInput{
		Email:          req.Email,
		Password:       req.Password,
		OrgName:        req.Name,
		InitialCredits: billing.SignupBonusAmount,
		Note:           "welcome to NextAPI (self-service signup)",
	})
	if err != nil {
		if errors.Is(err, errAccountExists) {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "account_exists"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "account_create_failed"}})
		return
	}
	sessionToken, sess, err := h.createAccountSession(c.Request.Context(), user.ID, org.ID, c.Request.UserAgent(), c.ClientIP())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "session_create_failed"}})
		return
	}
	key, err := h.mintDashboardKey(c.Request.Context(), org.ID, user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "dashboard_key_failed"}})
		return
	}
	h.accountSessionResponse(c, user, org, sessionToken, sess.ExpiresAt, key)
}

func (h *AccountAuthHandlers) SendOTP(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	email := normalizeEmail(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_email"}})
		return
	}
	if h.Redis == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "otp_unavailable"}})
		return
	}
	if h.Notify == nil || !h.Notify.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "email_provider_unavailable"}})
		return
	}
	cooldownKey := authCodeCooldownKey(email)
	ok, err := h.Redis.SetNX(c.Request.Context(), cooldownKey, "1", emailOTPCooldownTTL).Result()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "otp_unavailable"}})
		return
	}
	if !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": gin.H{"code": "otp_rate_limited", "message": "please wait before requesting another code"}})
		return
	}
	code := generateCode()
	if err := h.Redis.Set(c.Request.Context(), authCodeKey(email), otpDigest(email, code), emailOTPCodeTTL).Err(); err != nil {
		_ = h.Redis.Del(c.Request.Context(), cooldownKey).Err()
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "otp_unavailable"}})
		return
	}
	h.Notify.Send(notify.Mail{
		To:      []string{email},
		Subject: "NextAPI 验证码",
		Text:    fmt.Sprintf("你的验证码是：%s（5分钟有效）", code),
		Tag:     "auth-email-otp",
	})
	c.JSON(http.StatusOK, gin.H{"ok": true, "expires_in": int(emailOTPCodeTTL.Seconds())})
}

func (h *AccountAuthHandlers) lookupPasswordUser(ctx context.Context, email, password string) (*domain.User, *domain.Org, error) {
	email = normalizeEmail(email)
	if email == "" || password == "" {
		return nil, nil, errors.New("missing credentials")
	}
	var user domain.User
	if err := h.DB.WithContext(ctx).Where("lower(email) = ? AND deleted_at IS NULL", email).First(&user).Error; err != nil {
		return nil, nil, err
	}
	if user.PasswordHash == nil || *user.PasswordHash == "" {
		return nil, nil, errors.New("password login disabled")
	}
	if err := auth.Verify(password, *user.PasswordHash); err != nil {
		return nil, nil, err
	}
	org, err := h.primaryOrg(ctx, user.ID)
	return &user, org, err
}

func (h *AccountAuthHandlers) lookupEmailOTPUser(ctx context.Context, email, code string) (*domain.User, *domain.Org, error) {
	email = normalizeEmail(email)
	code = strings.TrimSpace(code)
	if email == "" || code == "" {
		return nil, nil, errors.New("missing otp credentials")
	}
	if h.Redis == nil {
		return nil, nil, errors.New("otp unavailable")
	}
	key := authCodeKey(email)
	ok, err := h.Redis.Eval(ctx, consumeOTPScript, []string{key}, otpDigest(email, code)).Int()
	if err != nil {
		return nil, nil, err
	}
	if ok != 1 {
		return nil, nil, errors.New("invalid otp")
	}
	return h.findOrCreateEmailAccount(ctx, email)
}

func (h *AccountAuthHandlers) requireAccountSession(c *gin.Context) (*domain.User, *domain.Org, *domain.AuthSession, bool) {
	raw := strings.TrimSpace(c.GetHeader(accountSessionHeader))
	if raw == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "missing_session"}})
		return nil, nil, nil, false
	}
	var sess domain.AuthSession
	err := h.DB.WithContext(c.Request.Context()).
		Where("token_hash = ? AND revoked_at IS NULL", hashToken(raw)).
		First(&sess).Error
	if err != nil || time.Now().After(sess.ExpiresAt) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "session_invalid"}})
		return nil, nil, nil, false
	}
	now := time.Now()
	_ = h.DB.WithContext(c.Request.Context()).Model(&sess).Update("last_used_at", now).Error

	var user domain.User
	if err := h.DB.WithContext(c.Request.Context()).Where("id = ? AND deleted_at IS NULL", sess.UserID).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "session_user_missing"}})
		return nil, nil, nil, false
	}
	var org domain.Org
	if err := h.DB.WithContext(c.Request.Context()).Where("id = ?", sess.OrgID).First(&org).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "session_org_missing"}})
		return nil, nil, nil, false
	}
	return &user, &org, &sess, true
}

func (h *AccountAuthHandlers) primaryOrg(ctx context.Context, userID string) (*domain.Org, error) {
	var org domain.Org
	if err := h.DB.WithContext(ctx).Where("owner_user_id = ?", userID).Order("created_at ASC").First(&org).Error; err == nil {
		return &org, nil
	}
	var member domain.OrgMember
	if err := h.DB.WithContext(ctx).Where("user_id = ?", userID).First(&member).Error; err != nil {
		return nil, err
	}
	if err := h.DB.WithContext(ctx).Where("id = ?", member.OrgID).First(&org).Error; err != nil {
		return nil, err
	}
	return &org, nil
}

func (h *AccountAuthHandlers) findOrCreateEmailAccount(ctx context.Context, email string) (*domain.User, *domain.Org, error) {
	var existing domain.User
	if err := h.DB.WithContext(ctx).Where("lower(email) = ? AND deleted_at IS NULL", email).First(&existing).Error; err == nil {
		if existing.EmailVerifiedAt == nil {
			now := time.Now()
			_ = h.DB.WithContext(ctx).Model(&existing).Update("email_verified_at", now).Error
			existing.EmailVerifiedAt = &now
		}
		org, err := h.primaryOrg(ctx, existing.ID)
		if err == nil {
			return &existing, org, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, err
		}
	}

	now := time.Now()
	userID := "usr_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	org := domain.Org{ID: uuid.NewString(), Name: email + "'s org", OwnerUserID: userID}
	user := domain.User{ID: userID, Email: email, EmailVerifiedAt: &now}
	err := h.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&user).Error; err != nil {
			return err
		}
		if err := tx.Where("lower(email) = ? AND deleted_at IS NULL", email).First(&user).Error; err != nil {
			return err
		}
		if user.EmailVerifiedAt == nil {
			if err := tx.Model(&user).Update("email_verified_at", now).Error; err != nil {
				return err
			}
			user.EmailVerifiedAt = &now
		}
		if found, err := h.primaryOrgTx(ctx, tx, user.ID); err == nil {
			org = *found
			return nil
		}
		org = domain.Org{ID: uuid.NewString(), Name: email + "'s org", OwnerUserID: user.ID}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		if err := tx.Create(&domain.OrgMember{OrgID: org.ID, UserID: user.ID, Role: "owner"}).Error; err != nil {
			return err
		}
		signupBonus := billing.SignupBonusAmount
		if err := tx.Create(&domain.CreditsLedger{
			OrgID:        org.ID,
			DeltaCredits: signupBonus,
			DeltaCents:   &signupBonus,
			Reason:       domain.ReasonSignupBonus,
			Note:         "welcome to NextAPI (email otp)",
		}).Error; err != nil {
			return err
		}
		return nil
	})
	return &user, &org, err
}

func (h *AccountAuthHandlers) primaryOrgTx(ctx context.Context, tx *gorm.DB, userID string) (*domain.Org, error) {
	var org domain.Org
	if err := tx.WithContext(ctx).Where("owner_user_id = ?", userID).Order("created_at ASC").First(&org).Error; err == nil {
		return &org, nil
	}
	var member domain.OrgMember
	if err := tx.WithContext(ctx).Where("user_id = ?", userID).First(&member).Error; err != nil {
		return nil, err
	}
	if err := tx.WithContext(ctx).Where("id = ?", member.OrgID).First(&org).Error; err != nil {
		return nil, err
	}
	return &org, nil
}

func (h *AccountAuthHandlers) createAccountSession(ctx context.Context, userID, orgID, ua, ip string) (string, *domain.AuthSession, error) {
	token, err := randomToken("nas_")
	if err != nil {
		return "", nil, err
	}
	now := time.Now()
	sess := &domain.AuthSession{
		TokenHash:  hashToken(token),
		UserID:     userID,
		OrgID:      orgID,
		UserAgent:  ua,
		IPCreated:  ip,
		CreatedAt:  now,
		ExpiresAt:  now.Add(accountSessionTTL),
		LastUsedAt: now,
	}
	if err := h.DB.WithContext(ctx).Create(sess).Error; err != nil {
		return "", nil, err
	}
	return token, sess, nil
}

func (h *AccountAuthHandlers) roleForUser(ctx context.Context, orgID, userID string) string {
	var org domain.Org
	if err := h.DB.WithContext(ctx).Where("id = ?", orgID).First(&org).Error; err == nil && org.OwnerUserID == userID {
		return "owner"
	}
	var member domain.OrgMember
	if err := h.DB.WithContext(ctx).Where("org_id = ? AND user_id = ?", orgID, userID).First(&member).Error; err == nil {
		return member.Role
	}
	return "member"
}

func normalizeTeamRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin":
		return "admin"
	case "owner":
		return "owner"
	default:
		return "member"
	}
}

func (h *AccountAuthHandlers) findOrCreateTeamUser(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	if err := h.DB.WithContext(ctx).Where("lower(email) = ? AND deleted_at IS NULL", email).First(&user).Error; err == nil {
		return &user, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	user = domain.User{ID: "usr_" + strings.ReplaceAll(uuid.NewString(), "-", ""), Email: email}
	if err := h.DB.WithContext(ctx).Create(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func dashboardKeyNameForUser(userID string) string {
	return dashboardKeyName + ":" + userID
}

func (h *AccountAuthHandlers) mintDashboardKey(ctx context.Context, orgID, userID string) (*auth.CreateKeyResult, error) {
	now := time.Now()
	name := dashboardKeyNameForUser(userID)
	if err := h.DB.WithContext(ctx).Model(&domain.APIKey{}).
		Where("org_id = ? AND name = ? AND revoked_at IS NULL", orgID, name).
		Update("revoked_at", now).Error; err != nil {
		return nil, err
	}
	return h.Auth.CreateKey(ctx, auth.CreateKeyInput{
		OrgID: orgID,
		Name:  name,
		Kind:  auth.KindBusiness,
		Env:   auth.EnvLive,
	})
}

func (h *AccountAuthHandlers) accountSessionResponse(c *gin.Context, user *domain.User, org *domain.Org, sessionToken string, expiresAt time.Time, key *auth.CreateKeyResult) {
	out := gin.H{
		"user":       gin.H{"id": user.ID, "email": user.Email, "phone_e164": user.PhoneE164},
		"org":        gin.H{"id": org.ID, "name": org.Name},
		"expires_at": expiresAt,
	}
	if sessionToken != "" {
		out["session_token"] = sessionToken
	}
	if h.Billing != nil {
		if balance, err := h.Billing.GetBalance(c.Request.Context(), org.ID); err == nil {
			out["balance"] = balance
		}
	}
	if key != nil {
		out["dashboard_key"] = gin.H{
			"id":     key.ID,
			"secret": key.FullKey,
			"prefix": key.Prefix,
			"name":   key.Name,
		}
	}
	c.JSON(http.StatusOK, out)
}

type createPasswordAccountInput struct {
	Email          string
	Password       string
	OrgName        string
	InitialCredits int64
	Note           string
}

var errAccountExists = errors.New("account already exists")

func (h *AccountAuthHandlers) createPasswordAccount(ctx context.Context, in createPasswordAccountInput) (*domain.User, *domain.Org, error) {
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if email == "" || len(in.Password) < 8 {
		return nil, nil, errors.New("invalid account input")
	}
	passwordHash, err := auth.Hash(in.Password)
	if err != nil {
		return nil, nil, err
	}
	userID := "usr_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	orgName := strings.TrimSpace(in.OrgName)
	if orgName == "" {
		orgName = email + "'s org"
	}
	var user domain.User
	var org domain.Org
	err = h.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user = domain.User{ID: userID, Email: email, PasswordHash: &passwordHash}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&user).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&domain.User{}).Where("id = ?", userID).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return errAccountExists
		}
		org = domain.Org{Name: orgName, OwnerUserID: user.ID}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		if err := tx.Create(&domain.OrgMember{OrgID: org.ID, UserID: user.ID, Role: "owner"}).Error; err != nil {
			return err
		}
		if in.InitialCredits != 0 {
			note := strings.TrimSpace(in.Note)
			if note == "" {
				note = "initial credits"
			}
			if err := tx.Create(&domain.CreditsLedger{
				OrgID:        org.ID,
				DeltaCredits: in.InitialCredits,
				DeltaCents:   &in.InitialCredits,
				Reason:       domain.ReasonTopup,
				Note:         note,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return &user, &org, err
}

func randomToken(prefix string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(b), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func authCodeKey(email string) string {
	return "auth:code:" + email
}

func authCodeCooldownKey(email string) string {
	return "auth:code-cooldown:" + email
}

func generateCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return fmt.Sprintf("%06d", time.Now().UnixNano()%900000+100000)
	}
	return fmt.Sprintf("%06d", n.Int64()+100000)
}

func otpDigest(email, code string) string {
	pepper := os.Getenv("AUTH_OTP_PEPPER")
	sum := sha256.Sum256([]byte(email + ":" + strings.TrimSpace(code) + ":" + pepper))
	return hex.EncodeToString(sum[:])
}
