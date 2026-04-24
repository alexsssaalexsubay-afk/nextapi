package wechat

import (
	"context"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment"
)

type Provider struct{}

func New() *Provider { return &Provider{} }

func (p *Provider) Name() string { return "wechat" }

func (p *Provider) CreateCheckout(ctx context.Context, r payment.CheckoutRequest) (*payment.Checkout, error) {
	// TODO(claude): real WeChat Pay JSAPI/H5/Native integration (W7).
	return nil, payment.ErrNotImplemented
}

func (p *Provider) VerifyWebhook(signature string, body []byte) (*payment.Event, error) {
	return nil, payment.ErrNotImplemented
}
