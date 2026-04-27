package gateway

import (
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment/alipay"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment/easypay"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment/stripe"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment/wechat"
	pricingsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/pricing"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	errInvalidTopupState   = errors.New("invalid topup order state")
	errTopupAmountMismatch = errors.New("topup amount mismatch")
)

type PaymentHandlers struct {
	Billing   *billing.Service
	DB        *gorm.DB
	Providers map[string]payment.Provider
	Pricing   *pricingsvc.Service
}

func NewPaymentHandlers(b *billing.Service, db *gorm.DB) *PaymentHandlers {
	return &PaymentHandlers{
		Billing: b,
		DB:      db,
		Providers: map[string]payment.Provider{
			"stripe":  stripe.New(),
			"alipay":  alipay.New(),
			"wechat":  wechat.New(),
			"easypay": easypay.New(),
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

type createTopupReq struct {
	AmountCents int64   `json:"amount_cents"`
	Amount      float64 `json:"amount"`
	PaymentType string  `json:"payment_type"`
}

type paymentStatusResp struct {
	TopupEnabled bool     `json:"topup_enabled"`
	Provider     string   `json:"provider"`
	PaymentTypes []string `json:"payment_types"`
	DisabledCode string   `json:"disabled_code,omitempty"`
	DisabledHint string   `json:"disabled_hint,omitempty"`
}

type configuredPaymentProvider interface {
	Configured() bool
}

func (h *PaymentHandlers) Status(c *gin.Context) {
	p, ok := h.Providers["easypay"]
	if !ok {
		c.JSON(http.StatusOK, paymentStatusResp{
			TopupEnabled: false,
			Provider:     "easypay",
			DisabledCode: "provider_missing",
			DisabledHint: "payment provider is not registered",
		})
		return
	}
	configured := false
	if cp, ok := p.(configuredPaymentProvider); ok {
		configured = cp.Configured()
	}
	resp := paymentStatusResp{
		TopupEnabled: configured,
		Provider:     "easypay",
		PaymentTypes: []string{"alipay", "wxpay"},
	}
	if !configured {
		resp.DisabledCode = "merchant_not_configured"
		resp.DisabledHint = "payment merchant credentials are not configured"
		resp.PaymentTypes = nil
	}
	c.JSON(http.StatusOK, resp)
}

func (h *PaymentHandlers) CreateTopup(c *gin.Context) {
	org := auth.OrgFrom(c)
	if h.DB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "payment_unavailable"}})
		return
	}
	var r createTopupReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_request"}})
		return
	}
	amountCents := r.AmountCents
	if amountCents == 0 && r.Amount > 0 {
		amountCents = int64(math.Round(r.Amount * 100))
	}
	if !allowedTopupAmount(amountCents) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_amount", "message": "unsupported top-up amount"}})
		return
	}
	p, ok := h.Providers["easypay"]
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "payment_unavailable"}})
		return
	}
	paymentType := normalizeTopupPaymentType(r.PaymentType)
	order := domain.TopupOrder{
		ID:          uuid.NewString(),
		OrgID:       org.ID,
		Provider:    "easypay",
		PaymentType: paymentType,
		AmountCents: amountCents,
		Credits:     amountCents,
		Status:      domain.TopupOrderPending,
	}
	apiURL := strings.TrimRight(os.Getenv("API_PUBLIC_URL"), "/")
	if apiURL == "" {
		apiURL = "https://api.nextapi.top"
	}
	returnURL := strings.TrimSpace(os.Getenv("CHECKOUT_SUCCESS_URL"))
	if returnURL == "" {
		returnURL = "https://app.nextapi.top/billing"
	}
	out, err := p.CreateCheckout(c.Request.Context(), payment.CheckoutRequest{
		OrgID:       org.ID,
		OrderID:     order.ID,
		AmountCents: amountCents,
		Credits:     order.Credits,
		PaymentType: paymentType,
		NotifyURL:   apiURL + "/api/pay/notify",
		ReturnURL:   returnURL,
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "payment_unavailable", "message": "payment provider not available"}})
		return
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "order_create_failed"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"order_id":    order.ID,
		"payment_url": out.URL,
		"provider":    out.Provider,
	})
}

// Webhook is a fan-in: /v1/webhooks/payments/:provider
func (h *PaymentHandlers) Webhook(c *gin.Context) {
	name := c.Param("provider")
	if name == "" {
		name = "easypay"
	}
	p, ok := h.Providers[name]
	if !ok {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	body, err := paymentWebhookBody(c)
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
	if name == "easypay" {
		h.handleEasypayWebhook(c, ev)
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

		amountCents := ev.AmountCents
		if amountCents == 0 {
			amountCents = ev.Credits
		}
		if err := h.Billing.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			delta := ev.Credits
			deltaCents := amountCents
			if err := tx.Create(&domain.CreditsLedger{
				OrgID:        ev.OrgID,
				DeltaCredits: delta,
				DeltaCents:   &deltaCents,
				Reason:       domain.ReasonTopup,
				Note:         note,
			}).Error; err != nil {
				return err
			}
			if h.Pricing == nil {
				return nil
			}
			return h.Pricing.ApplyTopup(ctx, tx, ev.OrgID, amountCents)
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

func paymentWebhookBody(c *gin.Context) ([]byte, error) {
	if c.Request.Method == http.MethodGet {
		values := url.Values{}
		for key, vals := range c.Request.URL.Query() {
			for _, v := range vals {
				values.Add(key, v)
			}
		}
		return []byte(values.Encode()), nil
	}
	return io.ReadAll(c.Request.Body)
}

func (h *PaymentHandlers) handleEasypayWebhook(c *gin.Context, ev *payment.Event) {
	if ev == nil || ev.Type != "topup.succeeded" || ev.ExternalID == "" {
		c.String(http.StatusOK, "success")
		return
	}
	err := h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var order domain.TopupOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND provider = ?", ev.ExternalID, "easypay").
			First(&order).Error; err != nil {
			return err
		}
		if order.Status == domain.TopupOrderPaid {
			return nil
		}
		if order.Status != domain.TopupOrderPending {
			return errInvalidTopupState
		}
		if order.AmountCents != ev.AmountCents || order.Credits <= 0 {
			return errTopupAmountMismatch
		}
		now := time.Now()
		if err := tx.Model(&order).Updates(map[string]any{
			"status":      domain.TopupOrderPaid,
			"external_id": ev.ExternalID,
			"paid_at":     now,
		}).Error; err != nil {
			return err
		}
		delta := order.Credits
		if err := tx.Create(&domain.CreditsLedger{
			OrgID:        order.OrgID,
			DeltaCredits: delta,
			DeltaCents:   &delta,
			Reason:       domain.ReasonTopup,
			Note:         "easypay:" + order.ID,
		}).Error; err != nil {
			return err
		}
		if h.Pricing == nil {
			return nil
		}
		return h.Pricing.ApplyTopup(c.Request.Context(), tx, order.OrgID, order.AmountCents)
	})
	if err != nil {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	c.String(http.StatusOK, "success")
}

func allowedTopupAmount(cents int64) bool {
	switch cents {
	case 1000, 5000, 10000:
		return true
	default:
		return false
	}
}

func normalizeTopupPaymentType(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "wxpay", "wechat":
		return "wxpay"
	default:
		return "alipay"
	}
}
