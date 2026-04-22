package gateway

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

// ClerkWebhook verifies Svix signature then provisions user + default org + signup bonus.
// Expects env CLERK_WEBHOOK_SECRET="whsec_xxx".
type ClerkWebhook struct {
	DB      *gorm.DB
	Billing *billing.Service
}

type clerkEvent struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type clerkUserData struct {
	ID             string `json:"id"`
	EmailAddresses []struct {
		EmailAddress string `json:"email_address"`
	} `json:"email_addresses"`
}

func (w *ClerkWebhook) Handle(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if !verifySvix(c.Request.Header, body, os.Getenv("CLERK_WEBHOOK_SECRET")) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "bad_signature"}})
		return
	}
	var ev clerkEvent
	if err := json.Unmarshal(body, &ev); err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	ctx := c.Request.Context()
	switch ev.Type {
	case "user.created":
		var u clerkUserData
		if err := json.Unmarshal(ev.Data, &u); err != nil {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		email := ""
		if len(u.EmailAddresses) > 0 {
			email = u.EmailAddresses[0].EmailAddress
		}
		if err := w.provision(c.Request.Context(), u.ID, email); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "provision_failed"}})
			return
		}
	case "user.deleted":
		var u clerkUserData
		_ = json.Unmarshal(ev.Data, &u)
		now := time.Now()
		w.DB.WithContext(ctx).Model(&domain.User{}).
			Where("id = ?", u.ID).Update("deleted_at", now)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (w *ClerkWebhook) provision(ctx context.Context, userID, email string) error {
	db := w.DB.WithContext(ctx)
	return db.Transaction(func(tx *gorm.DB) error {
		user := domain.User{ID: userID, Email: email}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		org := domain.Org{Name: email + "'s org", OwnerUserID: userID}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		if err := tx.Create(&domain.OrgMember{OrgID: org.ID, UserID: userID, Role: "owner"}).Error; err != nil {
			return err
		}
		bonus := billing.SignupBonusAmount
		return tx.Create(&domain.CreditsLedger{
			OrgID:        org.ID,
			DeltaCredits: bonus,
			DeltaCents:   &bonus,
			Reason:       domain.ReasonSignupBonus,
			Note:         "welcome to NextAPI",
		}).Error
	})
}

// verifySvix implements Svix webhook signature check (Clerk uses Svix).
// Header format: svix-id, svix-timestamp, svix-signature ("v1,<base64hmac> v1,<base64hmac>").
func verifySvix(h http.Header, body []byte, secret string) bool {
	if secret == "" {
		return false
	}
	id := h.Get("svix-id")
	ts := h.Get("svix-timestamp")
	sigHeader := h.Get("svix-signature")
	if id == "" || ts == "" || sigHeader == "" {
		return false
	}
	raw := strings.TrimPrefix(secret, "whsec_")
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return false
	}
	toSign := id + "." + ts + "." + string(body)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(toSign))
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	for _, p := range strings.Split(sigHeader, " ") {
		parts := strings.SplitN(p, ",", 2)
		if len(parts) != 2 {
			continue
		}
		if hmac.Equal([]byte(parts[1]), []byte(expected)) {
			return true
		}
	}
	return false
}
