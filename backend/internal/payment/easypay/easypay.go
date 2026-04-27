package easypay

import (
	"context"
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment"
)

type Provider struct {
	pid        string
	key        string
	gatewayURL string
	notifyURL  string
	returnURL  string
}

func New() *Provider {
	notifyURL := strings.TrimSpace(getenvAny("EPAY_NOTIFY_URL", "EASYPAY_NOTIFY_URL"))
	if notifyURL == "" {
		apiURL := strings.TrimRight(os.Getenv("API_PUBLIC_URL"), "/")
		if apiURL == "" {
			apiURL = "https://api.nextapi.top"
		}
		notifyURL = apiURL + "/api/pay/notify"
	}
	returnURL := strings.TrimSpace(getenvAny("EPAY_RETURN_URL", "EASYPAY_RETURN_URL", "CHECKOUT_SUCCESS_URL"))
	if returnURL == "" {
		returnURL = "https://app.nextapi.top/billing"
	}
	return &Provider{
		pid:        strings.TrimSpace(getenvAny("EPAY_PID", "EASYPAY_PID")),
		key:        strings.TrimSpace(getenvAny("EPAY_KEY", "EASYPAY_KEY")),
		gatewayURL: strings.TrimSpace(getenvAny("EPAY_GATEWAY", "EASYPAY_GATEWAY_URL")),
		notifyURL:  notifyURL,
		returnURL:  returnURL,
	}
}

func (p *Provider) Name() string { return "easypay" }

func (p *Provider) Configured() bool {
	return p.pid != "" && p.key != "" && p.gatewayURL != ""
}

func (p *Provider) CreateCheckout(ctx context.Context, r payment.CheckoutRequest) (*payment.Checkout, error) {
	_ = ctx
	if !p.Configured() {
		return nil, payment.ErrNotImplemented
	}
	if r.OrderID == "" || r.AmountCents <= 0 {
		return nil, errors.New("invalid checkout request")
	}
	payType := normalizePaymentType(r.PaymentType)
	notifyURL := r.NotifyURL
	if notifyURL == "" {
		notifyURL = p.notifyURL
	}
	returnURL := r.ReturnURL
	if returnURL == "" {
		returnURL = p.returnURL
	}
	money := formatMoney(r.AmountCents)
	values := url.Values{}
	values.Set("pid", p.pid)
	values.Set("type", payType)
	values.Set("out_trade_no", r.OrderID)
	values.Set("notify_url", notifyURL)
	values.Set("return_url", returnURL)
	values.Set("name", "余额充值")
	values.Set("money", money)
	values.Set("param", r.OrgID)
	values.Set("sign_type", "MD5")
	values.Set("sign", SignValues(values, p.key))

	sep := "?"
	if strings.Contains(p.gatewayURL, "?") {
		sep = "&"
	}
	return &payment.Checkout{
		URL:        p.gatewayURL + sep + values.Encode(),
		Provider:   p.Name(),
		ExternalID: r.OrderID,
	}, nil
}

func (p *Provider) VerifyWebhook(signature string, body []byte) (*payment.Event, error) {
	_ = signature
	if p.pid == "" || p.key == "" {
		return nil, payment.ErrNotImplemented
	}
	values, err := url.ParseQuery(string(body))
	if err != nil {
		return nil, errors.New("invalid webhook body")
	}
	got := strings.ToLower(strings.TrimSpace(values.Get("sign")))
	orderID := strings.TrimSpace(values.Get("out_trade_no"))
	money := strings.TrimSpace(values.Get("money"))
	if got == "" || orderID == "" || money == "" {
		return nil, errors.New("missing required webhook fields")
	}
	expected := SignValues(values, p.key)
	if subtle.ConstantTimeCompare([]byte(got), []byte(expected)) != 1 {
		return nil, errors.New("signature mismatch")
	}
	status := strings.ToUpper(strings.TrimSpace(values.Get("trade_status")))
	if status != "" && status != "TRADE_SUCCESS" && status != "SUCCESS" {
		return nil, nil
	}
	amountCents, err := moneyToCents(money)
	if err != nil || amountCents <= 0 {
		return nil, errors.New("invalid money")
	}
	return &payment.Event{
		Type:        "topup.succeeded",
		ExternalID:  orderID,
		AmountCents: amountCents,
		Credits:     amountCents,
	}, nil
}

func Sign(pid, outTradeNo, money, notifyURL, key string) string {
	values := url.Values{}
	values.Set("pid", pid)
	values.Set("out_trade_no", outTradeNo)
	values.Set("money", money)
	values.Set("notify_url", notifyURL)
	return SignValues(values, key)
}

func SignValues(values url.Values, key string) string {
	keys := make([]string, 0, len(values))
	for k, vs := range values {
		if k == "sign" || k == "sign_type" || len(vs) == 0 || strings.TrimSpace(vs[0]) == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+values.Get(k))
	}
	raw := strings.Join(parts, "&") + key
	sum := md5.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func normalizePaymentType(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "wxpay", "wechat":
		return "wxpay"
	default:
		return "alipay"
	}
}

func formatMoney(cents int64) string {
	return fmt.Sprintf("%.2f", float64(cents)/100)
}

func moneyToCents(v string) (int64, error) {
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, err
	}
	return int64(math.Round(f * 100)), nil
}

func getenvAny(keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}
