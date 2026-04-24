package gateway

import (
	"io"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment/alipay"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment/stripe"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment/wechat"
)

type PaymentHandlers struct {
	Billing   *billing.Service
	Providers map[string]payment.Provider
}

func NewPaymentHandlers(b *billing.Service) *PaymentHandlers {
	return &PaymentHandlers{
		Billing: b,
		Providers: map[string]payment.Provider{
			"stripe": stripe.New(),
			"alipay": alipay.New(),
			"wechat": wechat.New(),
		},
	}
}

type checkoutReq struct {
	Provider    string `json:"provider" binding:"required"`
	Credits     int64  `json:"credits" binding:"required"`
	AmountCents int64  `json:"amount_cents"`
}

func (h *PaymentHandlers) Checkout(c *gin.Context) {
	org := auth.OrgFrom(c)
	var r checkoutReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	if r.Credits <= 0 || r.AmountCents < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_amount", "message": "credits must be positive"}})
		return
	}
	p, ok := h.Providers[r.Provider]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "unknown_provider"}})
		return
	}
	success := os.Getenv("CHECKOUT_SUCCESS_URL")
	cancel := os.Getenv("CHECKOUT_CANCEL_URL")
	out, err := p.CreateCheckout(c.Request.Context(), payment.CheckoutRequest{
		OrgID:       org.ID,
		AmountCents: r.AmountCents,
		Credits:     r.Credits,
		SuccessURL:  success,
		CancelURL:   cancel,
	})
	if err != nil {
		c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "not_implemented", "message": "payment provider not available"}})
		return
	}
	c.JSON(http.StatusOK, out)
}

// Webhook is a fan-in: /v1/webhooks/payments/:provider
func (h *PaymentHandlers) Webhook(c *gin.Context) {
	name := c.Param("provider")
	p, ok := h.Providers[name]
	if !ok {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request", "message": "failed to read request body"}})
		return
	}
	sig := c.GetHeader("X-Signature")
	if name == "stripe" {
		sig = c.GetHeader("Stripe-Signature")
	}
	ev, err := p.VerifyWebhook(sig, body)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_webhook", "message": "webhook signature verification failed"}})
		return
	}
	if ev != nil && ev.Type == "topup.succeeded" {
		note := name + ":" + ev.ExternalID
		ctx := c.Request.Context()

		// Database-level dedup. Atomic INSERT on the (provider,event_id)
		// unique key ensures that even if two webhook deliveries land
		// simultaneously (Stripe replays, our own retry, an attacker
		// replaying a captured payload), only one ever reaches AddCredits.
		// HasNote alone is not safe because there's a TOCTOU window
		// between the read and the AddCredits write.
		res := h.Billing.DB().WithContext(ctx).Exec(
			`INSERT INTO payment_webhook_seen (provider, event_id, processed_at)
			 VALUES (?, ?, now())
			 ON CONFLICT (provider, event_id) DO NOTHING`,
			name, ev.ExternalID)
		if res.Error != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "ledger_read_failed"}})
			return
		}
		if res.RowsAffected == 0 {
			// Already processed; ack with 200 so the provider stops retrying.
			c.JSON(http.StatusOK, gin.H{"ok": true, "deduplicated": true})
			return
		}

		if err := h.Billing.AddCredits(ctx, billing.Entry{
			OrgID:  ev.OrgID,
			Delta:  ev.Credits,
			Reason: domain.ReasonTopup,
			Note:   note,
		}); err != nil {
			// Roll back the dedup row so a retry can succeed; otherwise we
			// would silently lose this top-up forever.
			_ = h.Billing.DB().WithContext(ctx).Exec(
				`DELETE FROM payment_webhook_seen WHERE provider = ? AND event_id = ?`,
				name, ev.ExternalID).Error
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "ledger_write_failed"}})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
