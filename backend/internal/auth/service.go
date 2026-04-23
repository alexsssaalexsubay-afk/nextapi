package auth

import (
	"context"
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

// ErrTooManyKeys is returned when an org tries to create another API
// key past the configured per-org cap (MAX_KEYS_PER_ORG, default 25).
// Caps prevent a compromised dashboard session from spraying out
// hundreds of keys before we notice.
var ErrTooManyKeys = errors.New("too many active API keys for this org")

// maxKeysPerOrg returns the per-org active-key cap. The
// `dashboard-session` key is excluded from the count because it's
// internally minted on every login and would otherwise bump real
// production keys out of the budget.
func maxKeysPerOrg() int {
	if v := os.Getenv("MAX_KEYS_PER_ORG"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 25
}

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service { return &Service{db: db} }
func (s *Service) DB() *gorm.DB          { return s.db }

type ValidKey struct {
	APIKey       *domain.APIKey
	Org          *domain.Org
	Kind         Kind
	Env          Env
	IPAllowlist  string
	RateLimitRPM int // 0 = unset = use the route-level default
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
		Disabled     bool   `gorm:"column:disabled"`
		IPAllowlist  string `gorm:"column:ip_allowlist"`
		RateLimitRPM *int   `gorm:"column:rate_limit_rpm"`
	}
	if err := s.db.WithContext(ctx).Raw(
		`SELECT COALESCE(disabled, false) AS disabled,
		        COALESCE(ip_allowlist, '{}') AS ip_allowlist,
		        rate_limit_rpm
		   FROM api_keys WHERE id = ?`, key.ID).Scan(&ext).Error; err != nil {
		return nil, err
	}
	if ext.Disabled {
		return nil, ErrInvalidKey
	}
	rpm := 0
	if ext.RateLimitRPM != nil && *ext.RateLimitRPM > 0 {
		rpm = *ext.RateLimitRPM
	}
	var org domain.Org
	if err := s.db.WithContext(ctx).First(&org, "id = ?", key.OrgID).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	s.db.WithContext(ctx).Model(&domain.APIKey{}).
		Where("id = ?", key.ID).Update("last_used_at", now)
	return &ValidKey{APIKey: &key, Org: &org, Kind: kind, Env: env, IPAllowlist: ext.IPAllowlist, RateLimitRPM: rpm}, nil
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
	if in.Name != "dashboard-session" {
		var active int64
		if err := s.db.WithContext(ctx).Model(&domain.APIKey{}).
			Where("org_id = ? AND revoked_at IS NULL AND name <> ?", in.OrgID, "dashboard-session").
			Count(&active).Error; err != nil {
			return nil, err
		}
		if int(active) >= maxKeysPerOrg() {
			return nil, ErrTooManyKeys
		}
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
	if err := s.db.WithContext(ctx).Exec(`
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
	).Error; err != nil {
		return nil, err
	}
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
