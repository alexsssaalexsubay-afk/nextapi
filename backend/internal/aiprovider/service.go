package aiprovider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrProviderNotFound = errors.New("ai_provider_not_found")
	ErrInvalidProvider  = errors.New("invalid_ai_provider")
	ErrProviderDisabled = errors.New("ai_provider_disabled")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) DB() *gorm.DB { return s.db }

func (s *Service) List(ctx context.Context, typ string) ([]domain.AIProvider, error) {
	db := s.db.WithContext(ctx).Order("type ASC, is_default DESC, updated_at DESC")
	if strings.TrimSpace(typ) != "" {
		db = db.Where("type = ?", strings.TrimSpace(typ))
	}
	var rows []domain.AIProvider
	return rows, db.Find(&rows).Error
}

func (s *Service) Get(ctx context.Context, id string) (*domain.AIProvider, error) {
	var row domain.AIProvider
	err := s.db.WithContext(ctx).First(&row, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrProviderNotFound
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) Default(ctx context.Context, typ string) (*domain.AIProvider, error) {
	var row domain.AIProvider
	err := s.db.WithContext(ctx).
		Where("type = ? AND enabled = ? AND is_default = ?", typ, true, true).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrProviderNotFound
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) Upsert(ctx context.Context, id string, in ProviderInput) (*domain.AIProvider, error) {
	if err := validateInput(in); err != nil {
		return nil, err
	}
	cfg := normalizeJSON(in.ConfigJSON)
	now := time.Now()
	returnVal := &domain.AIProvider{}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row domain.AIProvider
		if strings.TrimSpace(id) != "" {
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, "id = ?", id).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProviderNotFound
			}
			if err != nil {
				return err
			}
		} else {
			row = domain.AIProvider{CreatedAt: now}
		}
		encrypted := row.APIKeyEncrypted
		hint := row.KeyHint
		if strings.TrimSpace(in.APIKey) != "" {
			var err error
			encrypted, hint, err = EncryptAPIKey(in.APIKey)
			if err != nil {
				return err
			}
		}
		row.Name = strings.TrimSpace(in.Name)
		row.Type = strings.TrimSpace(in.Type)
		row.Provider = strings.TrimSpace(in.Provider)
		row.BaseURL = strings.TrimSpace(in.BaseURL)
		row.APIKeyEncrypted = encrypted
		row.KeyHint = hint
		row.Model = strings.TrimSpace(in.Model)
		row.Enabled = in.Enabled
		row.IsDefault = in.IsDefault
		row.ConfigJSON = cfg
		row.UpdatedAt = now
		if row.IsDefault {
			if err := tx.Model(&domain.AIProvider{}).
				Where("type = ? AND id <> ?", row.Type, row.ID).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}
		if row.ID == "" {
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		} else if err := tx.Save(&row).Error; err != nil {
			return err
		}
		*returnVal = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return returnVal, nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	res := s.db.WithContext(ctx).Delete(&domain.AIProvider{}, "id = ?", id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrProviderNotFound
	}
	return nil
}

func (s *Service) SetDefault(ctx context.Context, id string) (*domain.AIProvider, error) {
	var out domain.AIProvider
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&out, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProviderNotFound
			}
			return err
		}
		if !out.Enabled {
			return ErrProviderDisabled
		}
		if err := tx.Model(&domain.AIProvider{}).Where("type = ?", out.Type).Update("is_default", false).Error; err != nil {
			return err
		}
		if err := tx.Model(&out).Update("is_default", true).Error; err != nil {
			return err
		}
		out.IsDefault = true
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *Service) Log(ctx context.Context, row domain.AIProviderLog) {
	if len(row.UsageJSON) == 0 {
		row.UsageJSON = json.RawMessage(`{}`)
	}
	_ = s.db.WithContext(ctx).Create(&row).Error
}

func validateInput(in ProviderInput) error {
	if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.Type) == "" || strings.TrimSpace(in.Provider) == "" {
		return ErrInvalidProvider
	}
	switch in.Type {
	case domain.AIProviderTypeText, domain.AIProviderTypeImage, domain.AIProviderTypeVideo:
	default:
		return ErrInvalidProvider
	}
	if strings.TrimSpace(in.Model) == "" && in.Type != domain.AIProviderTypeVideo {
		return ErrInvalidProvider
	}
	return nil
}

func normalizeJSON(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage(`{}`)
	}
	var v map[string]any
	if err := json.Unmarshal(raw, &v); err != nil {
		return json.RawMessage(`{}`)
	}
	b, _ := json.Marshal(v)
	return b
}

func sanitizeErr(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, ErrEncryptionKeyMissing) {
		return "provider key is not configured"
	}
	return fmt.Sprintf("%T", err)
}
