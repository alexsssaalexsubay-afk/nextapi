package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service { return &Service{db: db} }
func (s *Service) DB() *gorm.DB          { return s.db }

type ValidKey struct {
	APIKey      *domain.APIKey
	Org         *domain.Org
	Kind        Kind
	Env         Env
	IPAllowlist string
}

// Validate looks up by prefix, verifies hash, checks not revoked / not disabled.
func (s *Service) Validate(ctx context.Context, raw string) (*ValidKey, error) {
	kind, env, err := ClassifyKey(raw)
	if err != nil {
		return nil, err
	}
	prefix := ParsePrefix(raw)
	if prefix == "" {
		return nil, ErrInvalidKey
	}
	var key domain.APIKey
	q := s.db.WithContext(ctx).
		Where("prefix = ? AND revoked_at IS NULL", prefix)
	if err := q.First(&key).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidKey
		}
		return nil, err
	}
	if err := Verify(raw, key.Hash); err != nil {
		return nil, ErrInvalidKey
	}
	var ext struct {
		Disabled    bool   `gorm:"column:disabled"`
		IPAllowlist string `gorm:"column:ip_allowlist"`
	}
	s.db.WithContext(ctx).Raw(
		`SELECT COALESCE(disabled, false) AS disabled, COALESCE(ip_allowlist, '{}') AS ip_allowlist FROM api_keys WHERE id = ?`, key.ID).Scan(&ext)
	if ext.Disabled {
		return nil, ErrInvalidKey
	}
	var org domain.Org
	if err := s.db.WithContext(ctx).First(&org, "id = ?", key.OrgID).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	s.db.WithContext(ctx).Model(&domain.APIKey{}).
		Where("id = ?", key.ID).Update("last_used_at", now)
	return &ValidKey{APIKey: &key, Org: &org, Kind: kind, Env: env, IPAllowlist: ext.IPAllowlist}, nil
}

type CreateKeyInput struct {
	OrgID                  string
	Name                   string
	Kind                   Kind
	Env                    Env
	Scopes                 []string
	AllowedModels          []string
	MonthlySpendCapCents   *int64
	RateLimitRPM           *int
	IPAllowlist            []string
	ModerationProfile      *string
	ProvisionedConcurrency *int
}

type CreateKeyResult struct {
	ID      string
	FullKey string
	Prefix  string
	Name    string
	Kind    Kind
	Env     Env
}

func (s *Service) CreateKey(ctx context.Context, in CreateKeyInput) (*CreateKeyResult, error) {
	kind := in.Kind
	if kind == "" {
		kind = KindBusiness
	}
	env := in.Env
	if env == "" {
		env = EnvLive
	}
	full, prefix, err := NewKey(kind, env)
	if err != nil {
		return nil, err
	}
	hash, err := Hash(full)
	if err != nil {
		return nil, err
	}
	row := domain.APIKey{
		OrgID:  in.OrgID,
		Prefix: prefix,
		Hash:   hash,
		Name:   in.Name,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	// Extended fields via raw UPDATE (migration 00005).
	provConc := 5
	if in.ProvisionedConcurrency != nil {
		provConc = *in.ProvisionedConcurrency
	}
	s.db.WithContext(ctx).Exec(`
		UPDATE api_keys SET
			env = ?, kind = ?, allowed_models = ?,
			monthly_spend_cap_cents = ?, rate_limit_rpm = ?,
			ip_allowlist = ?, moderation_profile = ?,
			provisioned_concurrency = ?
		WHERE id = ?`,
		string(env), strings.Trim(string(kind), " "),
		toPGArray(in.AllowedModels),
		in.MonthlySpendCapCents, in.RateLimitRPM,
		toPGArray(in.IPAllowlist), in.ModerationProfile,
		provConc, row.ID,
	)
	return &CreateKeyResult{
		ID: row.ID, FullKey: full, Prefix: prefix, Name: row.Name,
		Kind: kind, Env: env,
	}, nil
}

func toPGArray(xs []string) string {
	if len(xs) == 0 {
		return "{}"
	}
	return "{" + strings.Join(xs, ",") + "}"
}

func (s *Service) ListKeys(ctx context.Context, orgID string) ([]domain.APIKey, error) {
	var keys []domain.APIKey
	err := s.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Order("created_at DESC").
		Find(&keys).Error
	return keys, err
}

func (s *Service) GetKey(ctx context.Context, orgID, keyID string) (*domain.APIKey, error) {
	var key domain.APIKey
	err := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", keyID, orgID).
		First(&key).Error
	if err != nil {
		return nil, err
	}
	return &key, nil
}

func (s *Service) RevokeKey(ctx context.Context, orgID, keyID string) error {
	now := time.Now()
	res := s.db.WithContext(ctx).Model(&domain.APIKey{}).
		Where("id = ? AND org_id = ? AND revoked_at IS NULL", keyID, orgID).
		Update("revoked_at", now)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrInvalidKey
	}
	return nil
}

func (s *Service) SetDisabled(ctx context.Context, orgID, keyID string, disabled bool) error {
	res := s.db.WithContext(ctx).Exec(
		`UPDATE api_keys SET disabled = ? WHERE id = ? AND org_id = ?`,
		disabled, keyID, orgID)
	return res.Error
}
