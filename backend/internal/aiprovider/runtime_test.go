package aiprovider

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestTestProviderVideoRequiresConfiguredRuntime(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)
	prov := domain.AIProvider{
		ID:         "provider_video",
		Name:       "Seedance Relay",
		Type:       domain.AIProviderTypeVideo,
		Provider:   "seedance-relay",
		Model:      "seedance-2.0-pro",
		Enabled:    true,
		ConfigJSON: json.RawMessage(`{}`),
	}
	if err := db.Create(&prov).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}

	runtime := NewRuntime(NewService(db))

	t.Setenv("PROVIDER_MODE", "mock")
	if err := runtime.TestProvider(context.Background(), prov.ID); !errors.Is(err, ErrProviderDisabled) {
		t.Fatalf("mock runtime should not pass video provider test, got %v", err)
	}

	t.Setenv("PROVIDER_MODE", "seedance_relay")
	t.Setenv("SEEDANCE_RELAY_API_KEY", "")
	t.Setenv("UPTOKEN_API_KEY", "")
	if err := runtime.TestProvider(context.Background(), prov.ID); !errors.Is(err, ErrProviderDisabled) {
		t.Fatalf("missing relay key should not pass video provider test, got %v", err)
	}

	t.Setenv("SEEDANCE_RELAY_API_KEY", "ut-test")
	if err := runtime.TestProvider(context.Background(), prov.ID); err != nil {
		t.Fatalf("configured relay runtime should pass, got %v", err)
	}
}

func TestTestProviderVideoRejectsUnsupportedProvider(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)
	prov := domain.AIProvider{
		ID:         "provider_kling",
		Name:       "Kling",
		Type:       domain.AIProviderTypeVideo,
		Provider:   "kling",
		Model:      "kling-video",
		Enabled:    true,
		ConfigJSON: json.RawMessage(`{}`),
	}
	if err := db.Create(&prov).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}

	runtime := NewRuntime(NewService(db))
	t.Setenv("PROVIDER_MODE", "seedance_relay")
	t.Setenv("SEEDANCE_RELAY_API_KEY", "ut-test")
	if err := runtime.TestProvider(context.Background(), prov.ID); !errors.Is(err, ErrInvalidProvider) {
		t.Fatalf("unsupported video provider should fail, got %v", err)
	}
}

func TestRuntimeLogUsesContextAttribution(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)
	prov := domain.AIProvider{
		ID:         "provider_text",
		Name:       "Text Provider",
		Type:       domain.AIProviderTypeText,
		Provider:   "openai",
		Model:      "gpt-test",
		Enabled:    true,
		ConfigJSON: json.RawMessage(`{}`),
	}
	if err := db.Create(&prov).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}

	runtime := NewRuntime(NewService(db))
	ctx := WithUserID(WithOrgID(context.Background(), "org1"), "user1")
	runtime.log(ctx, &prov, "test request", json.RawMessage(`{"total_tokens":3}`), nil)

	var row domain.AIProviderLog
	if err := db.First(&row).Error; err != nil {
		t.Fatalf("load log: %v", err)
	}
	if row.OrgID == nil || *row.OrgID != "org1" {
		t.Fatalf("org attribution = %#v; want org1", row.OrgID)
	}
	if row.UserID != "user1" {
		t.Fatalf("user attribution = %q; want user1", row.UserID)
	}
}

func migrateAIProviderTestTables(t *testing.T, db *gorm.DB) {
	t.Helper()
	err := db.Exec(`CREATE TABLE ai_providers (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		provider TEXT NOT NULL,
		base_url TEXT NOT NULL DEFAULT '',
		api_key_encrypted TEXT NOT NULL DEFAULT '',
		key_hint TEXT NOT NULL DEFAULT '',
		model TEXT NOT NULL DEFAULT '',
		enabled BOOLEAN NOT NULL DEFAULT true,
		is_default BOOLEAN NOT NULL DEFAULT false,
		config_json TEXT NOT NULL DEFAULT '{}',
		created_at DATETIME,
		updated_at DATETIME
	)`).Error
	if err != nil {
		t.Fatalf("migrate ai_providers: %v", err)
	}
	err = db.Exec(`CREATE TABLE ai_provider_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		provider_id TEXT,
		user_id TEXT NOT NULL DEFAULT '',
		org_id TEXT,
		type TEXT NOT NULL,
		request_summary TEXT NOT NULL DEFAULT '',
		response_summary TEXT NOT NULL DEFAULT '',
		usage_json TEXT NOT NULL DEFAULT '{}',
		error TEXT NOT NULL DEFAULT '',
		created_at DATETIME
	)`).Error
	if err != nil {
		t.Fatalf("migrate ai_provider_logs: %v", err)
	}
}
