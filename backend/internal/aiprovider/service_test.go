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

func TestUpsertRequiresStoredKeyWhenTextProviderEnabled(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)

	_, err = NewService(db).Upsert(context.Background(), "", ProviderInput{
		Name:      "DeepSeek",
		Type:      domain.AIProviderTypeText,
		Provider:  "deepseek",
		Model:     "deepseek-chat",
		Enabled:   true,
		IsDefault: true,
	})
	if !errors.Is(err, ErrProviderKeyRequired) {
		t.Fatalf("error = %v; want ErrProviderKeyRequired", err)
	}
}

func TestUpsertAllowsDisabledTextProviderWithoutKey(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)

	row, err := NewService(db).Upsert(context.Background(), "", ProviderInput{
		Name:     "DeepSeek placeholder",
		Type:     domain.AIProviderTypeText,
		Provider: "deepseek",
		Model:    "deepseek-chat",
		Enabled:  false,
	})
	if err != nil {
		t.Fatalf("disabled placeholder should save: %v", err)
	}
	if row.Enabled {
		t.Fatal("placeholder should remain disabled")
	}
}

func TestSetDefaultRequiresStoredKeyForTextProvider(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)
	row := domain.AIProvider{
		ID:         "provider_text",
		Name:       "Legacy enabled provider without key",
		Type:       domain.AIProviderTypeText,
		Provider:   "deepseek",
		Model:      "deepseek-chat",
		Enabled:    true,
		ConfigJSON: json.RawMessage(`{}`),
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}

	_, err = NewService(db).SetDefault(context.Background(), row.ID)
	if !errors.Is(err, ErrProviderKeyRequired) {
		t.Fatalf("error = %v; want ErrProviderKeyRequired", err)
	}
}

func TestUpsertRejectsDisabledDefaultProvider(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)

	_, err = NewService(db).Upsert(context.Background(), "", ProviderInput{
		Name:      "Seedance default but disabled",
		Type:      domain.AIProviderTypeVideo,
		Provider:  "seedance",
		Model:     "seedance-2.0-pro",
		Enabled:   false,
		IsDefault: true,
	})
	if !errors.Is(err, ErrProviderDisabled) {
		t.Fatalf("error = %v; want ErrProviderDisabled", err)
	}
}

func TestUpsertAllowsNativeVideoProviderWithoutKeyAndNormalizesGuardrails(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)

	row, err := NewService(db).Upsert(context.Background(), "", ProviderInput{
		Name:       "Seedance relay",
		Type:       domain.AIProviderTypeVideo,
		Provider:   "seedance-relay",
		Model:      "seedance-2.0-pro",
		Enabled:    true,
		IsDefault:  true,
		ConfigJSON: json.RawMessage(`{"capability":"main video"}`),
	})
	if err != nil {
		t.Fatalf("native video provider should save without stored key: %v", err)
	}
	if row.APIKeyEncrypted != "" || row.KeyHint != "" {
		t.Fatalf("video guardrail should not synthesize stored keys: encrypted=%q hint=%q", row.APIKeyEncrypted, row.KeyHint)
	}
	var cfg ProviderConfig
	if err := json.Unmarshal(row.ConfigJSON, &cfg); err != nil {
		t.Fatalf("unmarshal config: %v", err)
	}
	if cfg.APIStyle != "native_video" || cfg.DirectorRole != "video_generation" || cfg.TaskStatusMode != "nextapi_job" || cfg.BillingMode != "nextapi_ledger" {
		t.Fatalf("bad normalized config: %+v", cfg)
	}
	if cfg.ProviderKeysExposed == nil || *cfg.ProviderKeysExposed {
		t.Fatalf("provider keys exposure should be explicitly false: %+v", cfg.ProviderKeysExposed)
	}
	if cfg.UpstreamExposed == nil || *cfg.UpstreamExposed {
		t.Fatalf("upstream exposure should be explicitly false: %+v", cfg.UpstreamExposed)
	}
	var raw map[string]any
	if err := json.Unmarshal(row.ConfigJSON, &raw); err != nil {
		t.Fatalf("unmarshal raw config: %v", err)
	}
	if raw["capability"] != "main video" {
		t.Fatalf("normalization should preserve existing config fields: %v", raw)
	}
}

func TestUpsertRejectsNativeVideoExposureFlags(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	migrateAIProviderTestTables(t, db)

	_, err = NewService(db).Upsert(context.Background(), "", ProviderInput{
		Name:       "Native video with exposed provider key",
		Type:       domain.AIProviderTypeVideo,
		Provider:   "seedance-relay",
		Model:      "seedance-2.0-pro",
		Enabled:    true,
		ConfigJSON: json.RawMessage(`{"api_style":"native_video","provider_keys_exposed":true}`),
	})
	if !errors.Is(err, ErrInvalidProvider) {
		t.Fatalf("error = %v; want ErrInvalidProvider", err)
	}

	_, err = NewService(db).Upsert(context.Background(), "", ProviderInput{
		Name:       "Native video with exposed upstream",
		Type:       domain.AIProviderTypeVideo,
		Provider:   "byteplus",
		Model:      "omnihuman-1.5",
		Enabled:    true,
		ConfigJSON: json.RawMessage(`{"upstream_exposed":true}`),
	})
	if !errors.Is(err, ErrInvalidProvider) {
		t.Fatalf("error = %v; want ErrInvalidProvider", err)
	}
}
