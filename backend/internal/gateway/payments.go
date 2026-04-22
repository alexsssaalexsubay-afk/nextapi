package gateway

import (
	"io"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/payment"
	"github.com/sanidg/nextapi/backend/internal/payment/alipay"
	"github.com/sanidg/nextapi/backend/internal/payment/stripe"
	"github.com/sanidg/nextapi/backend/internal/payment/wechat"
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
		c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "not_implemented", "message": err.Error()}})
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
	body, _ := io.ReadAll(c.Request.Body)
	sig := c.GetHeader("X-Signature")
	if name == "stripe" {
		sig = c.GetHeader("Stripe-Signature")
	}
	ev, err := p.VerifyWebhook(sig, body)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_webhook", "message": err.Error()}})
		return
	}
	if ev != nil && ev.Type == "topup.succeeded" {
		if err := h.Billing.AddCredits(c.Request.Context(), billing.Entry{
			OrgID:  ev.OrgID,
			Delta:  ev.Credits,
			Reason: domain.ReasonTopup,
			Note:   name + ":" + ev.ExternalID,
		}); err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "ledger_write_failed"}})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
