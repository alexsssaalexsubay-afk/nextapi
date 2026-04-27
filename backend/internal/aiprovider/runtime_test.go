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
}
