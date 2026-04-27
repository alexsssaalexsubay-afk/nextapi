package gateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/payment"
	pricingsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/pricing"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestPaymentStatusReportsEasypayDisabledWhenMerchantMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("EPAY_PID", "")
	t.Setenv("EASYPAY_PID", "")
	t.Setenv("EPAY_KEY", "")
	t.Setenv("EASYPAY_KEY", "")
	t.Setenv("EPAY_GATEWAY", "")
	t.Setenv("EASYPAY_GATEWAY_URL", "")

	h := NewPaymentHandlers(nil, nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/pay/status", nil)

	h.Status(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body paymentStatusResp
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.TopupEnabled {
		t.Fatal("expected top-up to be disabled without merchant credentials")
	}
	if body.DisabledCode != "merchant_not_configured" {
		t.Fatalf("unexpected disabled code: %q", body.DisabledCode)
	}
}

func TestEasypayWebhookCreditsOrderOnlyOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&domain.TopupOrder{}, &domain.CreditsLedger{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	order := domain.TopupOrder{
		ID:          "11111111-1111-1111-1111-111111111111",
		OrgID:       "22222222-2222-2222-2222-222222222222",
		Provider:    "easypay",
		PaymentType: "alipay",
		AmountCents: 1000,
		Credits:     1000,
		Status:      domain.TopupOrderPending,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}
	h := &PaymentHandlers{DB: db}
	ev := &payment.Event{
		Type:        "topup.succeeded",
		ExternalID:  order.ID,
		AmountCents: 1000,
		Credits:     1000,
	}

	h.handleEasypayWebhook(testGinContext(), ev)
	h.handleEasypayWebhook(testGinContext(), ev)

	var rows []domain.CreditsLedger
	if err := db.Find(&rows).Error; err != nil {
		t.Fatalf("list ledger: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected one ledger row, got %d", len(rows))
	}
	if rows[0].DeltaCredits != 1000 || rows[0].Reason != domain.ReasonTopup {
		t.Fatalf("unexpected ledger row: %#v", rows[0])
	}
	var paid domain.TopupOrder
	if err := db.First(&paid, "id = ?", order.ID).Error; err != nil {
		t.Fatalf("reload order: %v", err)
	}
	if paid.Status != domain.TopupOrderPaid {
		t.Fatalf("expected paid order, got %s", paid.Status)
	}
}

func TestEasypayWebhookRejectsAmountMismatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&domain.TopupOrder{}, &domain.CreditsLedger{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	order := domain.TopupOrder{
		ID:          "11111111-1111-1111-1111-111111111111",
		OrgID:       "22222222-2222-2222-2222-222222222222",
		Provider:    "easypay",
		PaymentType: "alipay",
		AmountCents: 1000,
		Credits:     1000,
		Status:      domain.TopupOrderPending,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}
	h := &PaymentHandlers{DB: db}
	h.handleEasypayWebhook(testGinContext(), &payment.Event{
		Type:        "topup.succeeded",
		ExternalID:  order.ID,
		AmountCents: 5000,
		Credits:     5000,
	})

	var count int64
	if err := db.Model(&domain.CreditsLedger{}).Count(&count).Error; err != nil {
		t.Fatalf("count ledger: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no ledger row, got %d", count)
	}
}

func TestEasypayWebhookAppliesMembershipUpgrade(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&domain.TopupOrder{},
		&domain.CreditsLedger{},
		&domain.MembershipTier{},
		&domain.OrgPricingOverride{},
		&domain.OrgPricingState{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	tierID := "11111111-1111-1111-1111-111111111111"
	orgID := "22222222-2222-2222-2222-222222222222"
	if err := db.Create(&domain.MembershipTier{
		ID:                    tierID,
		Name:                  "Gold",
		MinLifetimeTopupCents: 1000,
		MarkupBPS:             2000,
		Enabled:               true,
	}).Error; err != nil {
		t.Fatalf("create tier: %v", err)
	}
	order := domain.TopupOrder{
		ID:          "33333333-3333-3333-3333-333333333333",
		OrgID:       orgID,
		Provider:    "easypay",
		PaymentType: "alipay",
		AmountCents: 1000,
		Credits:     1000,
		Status:      domain.TopupOrderPending,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	h := &PaymentHandlers{DB: db, Pricing: pricingsvc.NewService(db)}
	h.handleEasypayWebhook(testGinContext(), &payment.Event{
		Type:        "topup.succeeded",
		ExternalID:  order.ID,
		AmountCents: 1000,
		Credits:     1000,
	})

	var state domain.OrgPricingState
	if err := db.First(&state, "org_id = ?", orgID).Error; err != nil {
		t.Fatalf("load pricing state: %v", err)
	}
	if state.LifetimeTopupCents != 1000 {
		t.Fatalf("expected lifetime topup 1000, got %d", state.LifetimeTopupCents)
	}
	if state.AutoMembershipTierID == nil || *state.AutoMembershipTierID != tierID {
		t.Fatalf("expected gold auto tier, got %v", state.AutoMembershipTierID)
	}
	if state.EffectiveMembershipTierID == nil || *state.EffectiveMembershipTierID != tierID {
		t.Fatalf("expected gold effective tier, got %v", state.EffectiveMembershipTierID)
	}
}

func testGinContext() *gin.Context {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/v1/webhooks/payments/easypay", nil)
	return c
}
