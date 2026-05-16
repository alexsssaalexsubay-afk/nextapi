package aiprovider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSyncProviderQuotaLocalLedgerRecordsRemaining(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)
	prov := domain.AIProvider{
		ID:         "provider_text",
		Name:       "OpenAI text",
		Type:       domain.AIProviderTypeText,
		Provider:   "openai",
		Model:      "gpt-4.1-mini",
		Enabled:    true,
		ConfigJSON: json.RawMessage(`{"quota_mode":"local_ledger","quota_total_cents":10000,"quota_low_balance_cents":2000}`),
	}
	if err := db.Create(&prov).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}
	now := time.Now().UTC()
	if err := db.Create(&domain.DirectorMetering{
		OrgID:       "org_1",
		ProviderID:  &prov.ID,
		MeterType:   string(domain.ReasonTextGeneration),
		ActualCents: 3750,
		Status:      "rated",
		UsageJSON:   json.RawMessage(`{"total_tokens":123}`),
		CreatedAt:   now,
	}).Error; err != nil {
		t.Fatalf("create metering: %v", err)
	}

	snap, err := NewService(db).SyncProviderQuota(context.Background(), prov.ID)
	if err != nil {
		t.Fatalf("sync quota: %v", err)
	}
	if snap.Status != quotaStatusHealthy {
		t.Fatalf("status = %q; want healthy", snap.Status)
	}
	if snap.UsedCents != 3750 {
		t.Fatalf("used = %d; want 3750", snap.UsedCents)
	}
	if snap.RemainingCents == nil || *snap.RemainingCents != 6250 {
		t.Fatalf("remaining = %v; want 6250", snap.RemainingCents)
	}
	if snap.Source != "nextapi_ledger" {
		t.Fatalf("source = %q; want nextapi_ledger", snap.Source)
	}
}

func TestSyncProviderQuotaLocalLedgerLowBalance(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)
	prov := domain.AIProvider{
		ID:         "provider_image",
		Name:       "Image",
		Type:       domain.AIProviderTypeImage,
		Provider:   "openai",
		Model:      "gpt-image-1",
		Enabled:    true,
		ConfigJSON: json.RawMessage(`{"quota_mode":"local_ledger","quota_total_cents":4000,"quota_low_balance_cents":500}`),
	}
	if err := db.Create(&prov).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if err := db.Create(&domain.DirectorMetering{
		OrgID:       "org_1",
		ProviderID:  &prov.ID,
		MeterType:   string(domain.ReasonImageGeneration),
		ActualCents: 3600,
		Status:      "rated",
		UsageJSON:   json.RawMessage(`{}`),
		CreatedAt:   time.Now().UTC(),
	}).Error; err != nil {
		t.Fatalf("create metering: %v", err)
	}

	snap, err := NewService(db).SyncProviderQuota(context.Background(), prov.ID)
	if err != nil {
		t.Fatalf("sync quota: %v", err)
	}
	if snap.Status != quotaStatusLowBalance {
		t.Fatalf("status = %q; want low_balance", snap.Status)
	}
	if snap.RemainingCents == nil || *snap.RemainingCents != 400 {
		t.Fatalf("remaining = %v; want 400", snap.RemainingCents)
	}
}

func TestFetchOpenAICostsSumsNestedAmounts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("start_time") == "" || r.URL.Query().Get("bucket_width") != "1d" {
			t.Fatalf("missing costs query params: %s", r.URL.RawQuery)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-admin" {
			t.Fatalf("authorization = %q", got)
		}
		_, _ = w.Write([]byte(`{
			"object":"page",
			"data":[
				{"results":[{"amount":{"value":1.23,"currency":"usd"}}]},
				{"results":[{"amount":{"value":0.02,"currency":"usd"}}]}
			]
		}`))
	}))
	defer server.Close()

	raw, used, currency, err := fetchOpenAICosts(context.Background(), server.URL, "sk-admin", time.Unix(10, 0), time.Unix(20, 0))
	if err != nil {
		t.Fatalf("fetch costs: %v", err)
	}
	if used != 125 {
		t.Fatalf("used = %d; want 125", used)
	}
	if currency != "USD" {
		t.Fatalf("currency = %q; want USD", currency)
	}
	if !json.Valid(raw) {
		t.Fatal("raw response should be valid json")
	}
}
