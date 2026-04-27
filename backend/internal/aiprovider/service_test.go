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
