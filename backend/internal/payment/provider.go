package payment

import (
	"context"
	"errors"
)

// Provider abstracts payment gateways (Stripe / Alipay / WeChat).
type Provider interface {
	Name() string
	// CreateCheckout returns a URL the customer visits to pay.
	CreateCheckout(ctx context.Context, req CheckoutRequest) (*Checkout, error)
	// VerifyWebhook validates signature and returns normalized event.
	VerifyWebhook(signature string, body []byte) (*Event, error)
}

type CheckoutRequest struct {
	OrgID       string
	AmountCents int64
	Credits     int64
	SuccessURL  string
	CancelURL   string
}

type Checkout struct {
	URL      string
	Provider string
	ExternalID string
}

type Event struct {
	Type       string // "topup.succeeded"
	OrgID      string
	Credits    int64
	ExternalID string
}

var ErrNotImplemented = errors.New("payment provider not implemented")
