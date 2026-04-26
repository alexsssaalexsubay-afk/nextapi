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
	key, err := h.mintDashboardKey(c.Request.Context(), org.ID)
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
		key, err = h.mintDashboardKey(c.Request.Context(), org.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "dashboard_key_failed"}})
			return
		}
	}
	h.accountSessionResponse(c, user, org, "", sess.ExpiresAt, key)
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
	key, err := h.mintDashboardKey(c.Request.Context(), org.ID)
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

func (h *AccountAuthHandlers) mintDashboardKey(ctx context.Context, orgID string) (*auth.CreateKeyResult, error) {
	now := time.Now()
	if err := h.DB.WithContext(ctx).Model(&domain.APIKey{}).
		Where("org_id = ? AND name = ? AND revoked_at IS NULL", orgID, dashboardKeyName).
		Update("revoked_at", now).Error; err != nil {
		return nil, err
	}
	return h.Auth.CreateKey(ctx, auth.CreateKeyInput{
		OrgID: orgID,
		Name:  dashboardKeyName,
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
