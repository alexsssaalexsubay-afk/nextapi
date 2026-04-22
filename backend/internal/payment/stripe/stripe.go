package stripe

import (
	"context"
	"errors"
	"os"

	"github.com/sanidg/nextapi/backend/internal/payment"
)

type Provider struct {
	secretKey string
	whSecret  string
}

func New() *Provider {
	return &Provider{
		secretKey: os.Getenv("STRIPE_SECRET_KEY"),
		whSecret:  os.Getenv("STRIPE_WEBHOOK_SECRET"),
	}
}

func (p *Provider) Name() string { return "stripe" }

// CreateCheckout — TODO(claude): replace with real Stripe Checkout call (W7).
// For now returns a signed stub URL so frontend can be wired.
func (p *Provider) CreateCheckout(ctx context.Context, r payment.CheckoutRequest) (*payment.Checkout, error) {
	if p.secretKey == "" {
		return nil, errors.New("STRIPE_SECRET_KEY not set")
	}
	return &payment.Checkout{
		Provider:   "stripe",
		URL:        "https://checkout.stripe.com/c/pay/" + r.OrgID, // placeholder
		ExternalID: "cs_test_" + r.OrgID,
	}, nil
}

// VerifyWebhook — TODO(claude): real Stripe-Signature check (timestamp + HMAC).
func (p *Provider) VerifyWebhook(signature string, body []byte) (*payment.Event, error) {
	if p.whSecret == "" {
		return nil, payment.ErrNotImplemented
	}
	return nil, payment.ErrNotImplemented
}
