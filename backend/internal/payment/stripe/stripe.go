package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

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

const stripeTimestampTolerance = 5 * time.Minute

func (p *Provider) VerifyWebhook(signature string, body []byte) (*payment.Event, error) {
	if p.whSecret == "" {
		return nil, payment.ErrNotImplemented
	}
	parts := parseStripeSig(signature)
	tsStr, ok := parts["t"]
	if !ok {
		return nil, errors.New("missing timestamp in Stripe-Signature")
	}
	ts, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("bad timestamp: %w", err)
	}
	if math.Abs(float64(time.Now().Unix()-ts)) > stripeTimestampTolerance.Seconds() {
		return nil, errors.New("webhook timestamp too old or too new")
	}
	v1Sig, ok := parts["v1"]
	if !ok {
		return nil, errors.New("missing v1 signature")
	}
	payload := fmt.Sprintf("%s.%s", tsStr, string(body))
	mac := hmac.New(sha256.New, []byte(p.whSecret))
	mac.Write([]byte(payload))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(v1Sig), []byte(expected)) {
		return nil, errors.New("signature mismatch")
	}

	var raw struct {
		Type string `json:"type"`
		Data struct {
			Object struct {
				ID       string            `json:"id"`
				Metadata map[string]string `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("bad event body: %w", err)
	}
	if raw.Type != "checkout.session.completed" {
		return nil, nil
	}
	orgID := raw.Data.Object.Metadata["org_id"]
	creditsStr := raw.Data.Object.Metadata["credits"]
	credits, _ := strconv.ParseInt(creditsStr, 10, 64)
	if orgID == "" || credits <= 0 {
		return nil, nil
	}
	return &payment.Event{
		Type:       "topup.succeeded",
		OrgID:      orgID,
		Credits:    credits,
		ExternalID: raw.Data.Object.ID,
	}, nil
}

func parseStripeSig(sig string) map[string]string {
	out := map[string]string{}
	for _, part := range strings.Split(sig, ",") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			out[kv[0]] = kv[1]
		}
	}
	return out
}
