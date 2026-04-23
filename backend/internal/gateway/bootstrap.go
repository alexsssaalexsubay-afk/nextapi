package gateway

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

// BootstrapHandlers exchange a Clerk session JWT for a freshly-minted
// dashboard sk_* key (or, for the admin app, the shared admin operator token
// gated by ADMIN_EMAILS). This is the bridge that closes the
// "logged in via Clerk but cannot call the API" gap.
type BootstrapHandlers struct {
	DB      *gorm.DB
	Auth    *auth.Service
	Billing *billing.Service
	Clerk   *auth.ClerkVerifier // may be nil → endpoint returns 503
}

const dashboardKeyName = "dashboard-session"

func extractBearer(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
}

// MeBootstrap verifies the Clerk session JWT, lazy-provisions the user's
// User+Org+SignupBonus rows if missing, REVOKES any prior dashboard-session
// key for that org, mints a fresh sk_live_* key, and returns the plaintext
// secret so the SPA can cache it in memory for the session.
//
// Why fresh-mint instead of return-existing: API keys are stored as Argon2id
// hashes — the plaintext is unrecoverable. Re-issuing on every bootstrap is
// the correct design and is also what users intuitively expect after a
// new sign-in (old browser tab loses access, matching every well-known
// dashboard pattern).
func (b *BootstrapHandlers) MeBootstrap(c *gin.Context) {
	if b.Clerk == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "clerk_not_configured", "message": "set CLERK_ISSUER on the backend"}})
		return
	}
	tok := extractBearer(c)
	if tok == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "missing_token"}})
		return
	}
	ctx := c.Request.Context()
	claims, err := b.Clerk.Verify(ctx, tok)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "invalid_token"}})
		return
	}

	org, err := b.ensureUserAndOrg(ctx, claims)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "provision_failed"}})
		return
	}

	// Revoke prior dashboard-session keys (single-active policy).
	if err := b.DB.WithContext(ctx).Model(&domain.APIKey{}).
		Where("org_id = ? AND name = ? AND revoked_at IS NULL", org.ID, dashboardKeyName).
		Update("revoked_at", time.Now()).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}

	res, err := b.Auth.CreateKey(ctx, auth.CreateKeyInput{
		OrgID: org.ID,
		Name:  dashboardKeyName,
		Kind:  auth.KindBusiness,
		Env:   auth.EnvLive,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": "failed to mint key"}})
		return
	}

	balance, _ := b.Billing.GetBalance(ctx, org.ID)

	c.JSON(http.StatusOK, gin.H{
		"secret":  res.FullKey,
		"prefix":  res.Prefix,
		"key_id":  res.ID,
		"name":    res.Name,
		"org":     gin.H{"id": org.ID, "name": org.Name},
		"balance": balance,
		// Surface the policy plainly so the dashboard can warn users.
		"note": "session key — revoked next time you sign in. Create a permanent key from /keys for production use.",
	})
}

// AdminBootstrap is intentionally REMOVED.
//
// The previous design exchanged a Clerk JWT for the shared ADMIN_TOKEN
// and dropped that token into sessionStorage. Whoever sniffed the
// browser session got the master key to every tenant.
//
// Replacement: the admin SPA now sends its Clerk JWT on every admin
// API call, and AdminMiddleware verifies it inline (jwks + email
// allowlist). No long-lived shared secret leaves the server.

func (b *BootstrapHandlers) ensureUserAndOrg(ctx context.Context, claims *auth.ClerkClaims) (*domain.Org, error) {
	db := b.DB.WithContext(ctx)

	var user domain.User
	err := db.Where("id = ?", claims.Sub).First(&user).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		email := claims.Email
		if email == "" {
			if e, _ := auth.FetchClerkUserEmail(ctx, claims.Sub); e != "" {
				email = e
			}
		}
		if email == "" {
			email = claims.Sub + "@noemail.local"
		}
		err = db.Transaction(func(tx *gorm.DB) error {
			user = domain.User{ID: claims.Sub, Email: email}
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
			org := domain.Org{Name: email + "'s org", OwnerUserID: claims.Sub}
			if err := tx.Create(&org).Error; err != nil {
				return err
			}
			if err := tx.Create(&domain.OrgMember{OrgID: org.ID, UserID: claims.Sub, Role: "owner"}).Error; err != nil {
				return err
			}
			bonus := billing.SignupBonusAmount
			return tx.Create(&domain.CreditsLedger{
				OrgID:        org.ID,
				DeltaCredits: bonus,
				DeltaCents:   &bonus,
				Reason:       domain.ReasonSignupBonus,
				Note:         "welcome to NextAPI (bootstrap)",
			}).Error
		})
		if err != nil {
			return nil, err
		}
	}

	// Find an org the user owns (or any org they are a member of).
	var org domain.Org
	if err := db.Where("owner_user_id = ?", claims.Sub).
		Order("created_at ASC").First(&org).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		// Fallback: org_members
		var member domain.OrgMember
		if err := db.Where("user_id = ?", claims.Sub).First(&member).Error; err != nil {
			return nil, err
		}
		if err := db.Where("id = ?", member.OrgID).First(&org).Error; err != nil {
			return nil, err
		}
	}
	return &org, nil
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		v := strings.TrimSpace(strings.ToLower(p))
		if v != "" {
			out = append(out, v)
		}
	}
	return out
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
