package billing

import (
	"context"
	"database/sql"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

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

// GetBalance = SUM(delta_credits).
func (s *Service) GetBalance(ctx context.Context, orgID string) (int64, error) {
	var out sql.NullInt64
	err := s.db.WithContext(ctx).
		Model(&domain.CreditsLedger{}).
		Where("org_id = ?", orgID).
		Select("COALESCE(SUM(delta_credits), 0)").
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
