package billing

import (
	"context"
	"database/sql"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

// DB returns the underlying handle. Exposed so adjacent layers
// (payment webhooks, reconcile) can do atomic SQL without bringing
// the connection through their own constructor signatures.
func (s *Service) DB() *gorm.DB { return s.db }

// HasNote reports whether a ledger row exists with the given note (e.g. webhook idempotency).
func (s *Service) HasNote(ctx context.Context, note string) (bool, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&domain.CreditsLedger{}).Where("note = ?", note).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

type Entry struct {
	OrgID  string
	Delta  int64
	Reason domain.CreditReason
	JobID  *string
	Note   string
}

// AddCredits appends one ledger row with dual-write to delta_cents.
// Balance is never cached.
func (s *Service) AddCredits(ctx context.Context, e Entry) error {
	row := domain.CreditsLedger{
		OrgID:        e.OrgID,
		DeltaCredits: e.Delta,
		DeltaCents:   &e.Delta,
		Reason:       e.Reason,
		JobID:        e.JobID,
		Note:         e.Note,
	}
	return s.db.WithContext(ctx).Create(&row).Error
}

// GetBalance uses the same formula as spend.Enforce: COALESCE(delta_cents, delta_credits, 0).
func (s *Service) GetBalance(ctx context.Context, orgID string) (int64, error) {
	var out sql.NullInt64
	err := s.db.WithContext(ctx).Raw(`
		SELECT COALESCE(SUM(COALESCE(delta_cents, delta_credits, 0)), 0)
		FROM credits_ledger WHERE org_id = ?`, orgID).
		Scan(&out).Error
	if err != nil {
		return 0, err
	}
	return out.Int64, nil
}

func (s *Service) ListLedger(ctx context.Context, orgID string, limit, offset int) ([]domain.CreditsLedger, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []domain.CreditsLedger
	err := s.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&rows).Error
	return rows, err
}
