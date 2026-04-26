package easypay

import (
	"net/url"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment"
)

func TestSignUsesRequiredCanonicalString(t *testing.T) {
	got := Sign("1001", "ord_1", "10.00", "https://api.nextapi.top/v1/webhooks/payments/easypay", "secret")
	want := "262c30170b274782534e602ea8c7d0e8"
	if got != want {
		t.Fatalf("sign mismatch: want %s, got %s", want, got)
	}
}

func TestCreateCheckoutUsesZPaySubmitParameters(t *testing.T) {
	p := &Provider{
		pid:        "1001",
		key:        "secret",
		gatewayURL: "https://zpayz.cn/submit.php",
		notifyURL:  "https://api.nextapi.top/api/pay/notify",
		returnURL:  "https://app.nextapi.top/billing",
	}
	out, err := p.CreateCheckout(nil, payment.CheckoutRequest{
		OrgID:       "org_1",
		OrderID:     "ord_1",
		AmountCents: 1000,
		PaymentType: "alipay",
	})
	if err != nil {
		t.Fatalf("CreateCheckout: %v", err)
	}
	u, err := url.Parse(out.URL)
	if err != nil {
		t.Fatalf("parse URL: %v", err)
	}
	q := u.Query()
	if u.Scheme+"://"+u.Host+u.Path != "https://zpayz.cn/submit.php" {
		t.Fatalf("wrong gateway: %s", out.URL)
	}
	for k, want := range map[string]string{
		"pid":          "1001",
		"type":         "alipay",
		"out_trade_no": "ord_1",
		"notify_url":   "https://api.nextapi.top/api/pay/notify",
		"return_url":   "https://app.nextapi.top/billing",
		"name":         "余额充值",
		"money":        "10.00",
		"param":        "org_1",
		"sign_type":    "MD5",
	} {
		if got := q.Get(k); got != want {
			t.Fatalf("%s = %q; want %q", k, got, want)
		}
	}
	if got, want := q.Get("sign"), SignValues(q, "secret"); got != want {
		t.Fatalf("sign = %q; want %q", got, want)
	}
}

func TestVerifyWebhookRejectsBadSignature(t *testing.T) {
	p := &Provider{
		pid:       "1001",
		key:       "secret",
		notifyURL: "https://api.nextapi.top/api/pay/notify",
	}
	values := url.Values{}
	values.Set("pid", "1001")
	values.Set("out_trade_no", "ord_1")
	values.Set("money", "10.00")
	values.Set("trade_status", "TRADE_SUCCESS")
	values.Set("sign", "bad")

	if _, err := p.VerifyWebhook("", []byte(values.Encode())); err == nil {
		t.Fatal("expected bad signature error")
	}
}

func TestVerifyWebhookReturnsNormalizedPaidEvent(t *testing.T) {
	p := &Provider{
		pid:       "1001",
		key:       "secret",
		notifyURL: "https://api.nextapi.top/api/pay/notify",
	}
	values := url.Values{}
	values.Set("pid", "1001")
	values.Set("out_trade_no", "ord_1")
	values.Set("money", "10.00")
	values.Set("trade_status", "TRADE_SUCCESS")
	values.Set("sign", SignValues(values, "secret"))

	ev, err := p.VerifyWebhook("", []byte(values.Encode()))
	if err != nil {
		t.Fatalf("verify webhook: %v", err)
	}
	if ev == nil || ev.ExternalID != "ord_1" || ev.AmountCents != 1000 || ev.Credits != 1000 {
		t.Fatalf("unexpected event: %#v", ev)
	}
}
