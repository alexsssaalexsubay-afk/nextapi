package billing

import (
	"context"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

type UsagePoint struct {
	Day           time.Time `json:"day"`
	Jobs          int64     `json:"jobs"`
	CreditsUsed   int64     `json:"credits_used"`
}

// UsageDaily returns per-day aggregates for the last N days.
func (s *Service) UsageDaily(ctx context.Context, orgID string, days int) ([]UsagePoint, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	since := time.Now().AddDate(0, 0, -days)
	var out []UsagePoint
	err := s.db.WithContext(ctx).
		Model(&domain.Job{}).
		Select(`date_trunc('day', created_at) AS day,
		        COUNT(*) AS jobs,
		        COALESCE(SUM(cost_credits), 0) AS credits_used`).
		Where("org_id = ? AND created_at >= ?", orgID, since).
		Group("day").
		Order("day ASC").
		Scan(&out).Error
	return out, err
}

// Recharge appends a topup row (no real payment — placeholder for W7).
func (s *Service) Recharge(ctx context.Context, orgID string, credits int64, note string) error {
	if credits <= 0 {
		return gorm.ErrInvalidData
	}
	return s.AddCredits(ctx, Entry{
		OrgID:  orgID,
		Delta:  credits,
		Reason: domain.ReasonTopup,
		Note:   note,
	})
}
