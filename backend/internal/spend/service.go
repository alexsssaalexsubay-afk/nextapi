package spend

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

// Error codes mapped 1:1 to API error codes.
var (
	ErrInsufficientBalance = errors.New("insufficient_quota.balance")
	ErrBudgetCap           = errors.New("insufficient_quota.budget_cap")
	ErrMonthlyLimit        = errors.New("insufficient_quota.monthly_limit")
	ErrOrgPaused           = errors.New("insufficient_quota.org_paused")
)

// WebhookEnqueuer is satisfied by webhook.Service; avoids import cycle.
type WebhookEnqueuer interface {
	Enqueue(ctx context.Context, orgID, eventType string, payload any) error
}

var ErrInFlightExceeded = errors.New("insufficient_quota.inflight_exceeded")

type Service struct {
	db       *gorm.DB
	redis    *redis.Client
	webhooks WebhookEnqueuer
}

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

// SetRedis injects the Redis client for in-flight liability tracking.
func (s *Service) SetRedis(r *redis.Client) { s.redis = r }

const inflightKeyPrefix = "inflight:cost:"

// PreCheck performs a fast, Redis-based in-flight liability check BEFORE
// the heavier Postgres transaction. This is the financial kill switch:
// Balance - InFlightLiability must be >= estimatedCents.
func (s *Service) PreCheck(ctx context.Context, orgID string, estimatedCredits int64) error {
	if s.redis == nil {
		return nil
	}
	var bal sql.NullInt64
	if err := s.db.WithContext(ctx).Raw(`
		SELECT COALESCE(SUM(COALESCE(delta_cents, delta_credits, 0)), 0)
		FROM credits_ledger WHERE org_id = ?`, orgID).Scan(&bal).Error; err != nil {
		return err
	}
	inflight, _ := s.redis.Get(ctx, inflightKeyPrefix+orgID).Int64()
	if bal.Int64-inflight < estimatedCredits {
		return ErrInFlightExceeded
	}
	return nil
}

// IncrInflight atomically adds estimated cost to in-flight liability counter.
func (s *Service) IncrInflight(ctx context.Context, orgID string, cents int64) {
	if s.redis == nil {
		return
	}
	key := inflightKeyPrefix + orgID
	s.redis.IncrBy(ctx, key, cents)
	s.redis.Expire(ctx, key, 30*time.Minute)
}

// DecrInflight atomically reduces in-flight liability when a job settles.
func (s *Service) DecrInflight(ctx context.Context, orgID string, cents int64) {
	if s.redis == nil {
		return
	}
	key := inflightKeyPrefix + orgID
	result, _ := s.redis.DecrBy(ctx, key, cents).Result()
	if result < 0 {
		s.redis.Set(ctx, key, 0, 30*time.Minute)
	}
}

// InFlightLiability returns the current in-flight liability for an org.
func (s *Service) InFlightLiability(ctx context.Context, orgID string) int64 {
	if s.redis == nil {
		return 0
	}
	v, _ := s.redis.Get(ctx, inflightKeyPrefix+orgID).Int64()
	return v
}

// SetWebhooks injects the webhook enqueuer after construction to break
// the circular dependency between spend and webhook packages.
func (s *Service) SetWebhooks(w WebhookEnqueuer) { s.webhooks = w }

// DB exposes the underlying gorm handle for packages that need ad-hoc reads.
func (s *Service) DB() *gorm.DB { return s.db }

// Decision is the result of Enforce. The caller must, within the SAME tx,
// append the reservation ledger row for AmountCents.
type Decision struct {
	BalanceCents int64
	EstCents     int64
	PeriodSpend  int64
	PeriodStart  time.Time
}

// Enforce checks all spend controls for org with a proposed estCents reservation.
// It runs under SELECT...FOR UPDATE on orgs row to serialise concurrent create
// requests, preventing double-spend. The caller MUST pass a tx obtained from
// `db.Transaction(...)`; otherwise the lock is released immediately.
func (s *Service) Enforce(ctx context.Context, tx *gorm.DB, orgID string, estCents int64) (*Decision, error) {
	// 1. Lock org row + read pause.
	var org struct {
		ID          string
		PausedAt    *time.Time
		PauseReason *string
	}
	q := `SELECT id, paused_at, pause_reason FROM orgs WHERE id = ?`
	if tx.Dialector.Name() != "sqlite" {
		q += " FOR UPDATE"
	}
	if err := tx.Raw(q, orgID).Scan(&org).Error; err != nil {
		return nil, err
	}
	if org.ID == "" {
		return nil, gorm.ErrRecordNotFound
	}
	if org.PausedAt != nil {
		return nil, ErrOrgPaused
	}

	// 2. Load spend_controls (nullable).
	var sc domain.SpendControls
	_ = tx.Where("org_id = ?", orgID).First(&sc).Error // missing row = no caps

	// 3. Balance = SUM(delta_cents with fallback to delta_credits) over ledger.
	var bal sql.NullInt64
	if err := tx.Raw(`
		SELECT COALESCE(SUM(COALESCE(delta_cents, delta_credits, 0)), 0)
		FROM credits_ledger WHERE org_id = ?`, orgID).Scan(&bal).Error; err != nil {
		return nil, err
	}
	balance := bal.Int64

	if balance < estCents {
		return nil, ErrInsufficientBalance
	}

	// 4. Period window.
	day := int(sc.PeriodResetsOn)
	if day < 1 {
		day = 1
	}
	start := periodStart(time.Now().UTC(), day)

	// 5. Period spend = sum of absolute reservation + reconciliation in window.
	var spendRaw sql.NullInt64
	if err := tx.Raw(`
		SELECT COALESCE(SUM(-COALESCE(delta_cents, delta_credits, 0)), 0)
		FROM credits_ledger
		WHERE org_id = ? AND created_at >= ? AND reason IN ('reservation','reconciliation','consumption')`,
		orgID, start).Scan(&spendRaw).Error; err != nil {
		return nil, err
	}
	spend := spendRaw.Int64

	// Hypothetical spend after this reservation.
	proposed := spend + estCents

	if sc.HardCapCents != nil && proposed > *sc.HardCapCents {
		return nil, ErrBudgetCap
	}
	if sc.MonthlyLimitCents != nil && proposed > *sc.MonthlyLimitCents {
		return nil, ErrMonthlyLimit
	}

	// 6. Soft alert + auto-pause evaluations (fired outside the tx by the caller
	// via AfterReserve — we return the new values so caller can check).
	return &Decision{BalanceCents: balance, EstCents: estCents, PeriodSpend: proposed, PeriodStart: start}, nil
}

// AfterReserve runs post-commit to (a) fire soft-alert event if threshold crossed
// for the first time in this period, (b) fire monthly_limit_hit if near limit,
// and (c) auto-pause if balance fell below threshold. All are idempotent via
// spend_alerts UNIQUE constraint. Emits webhook events for each alert.
func (s *Service) AfterReserve(ctx context.Context, orgID string, d *Decision) (alerts []domain.SpendAlert, autoPaused bool, err error) {
	var sc domain.SpendControls
	if e := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&sc).Error; e != nil {
		if !errors.Is(e, gorm.ErrRecordNotFound) {
			return nil, false, e
		}
		return nil, false, nil
	}

	if sc.SoftAlertCents != nil && d.PeriodSpend >= *sc.SoftAlertCents {
		a := domain.SpendAlert{
			OrgID: orgID, Kind: "soft_alert",
			PeriodStart: d.PeriodStart, AmountCents: d.PeriodSpend, FiredAt: time.Now(),
		}
		res := s.db.WithContext(ctx).Create(&a)
		if res.Error == nil {
			alerts = append(alerts, a)
			s.emitWebhook(ctx, orgID, "budget.alert", a)
		}
	}

	if sc.MonthlyLimitCents != nil && d.PeriodSpend >= *sc.MonthlyLimitCents {
		a := domain.SpendAlert{
			OrgID: orgID, Kind: "monthly_limit_hit",
			PeriodStart: d.PeriodStart, AmountCents: d.PeriodSpend, FiredAt: time.Now(),
		}
		res := s.db.WithContext(ctx).Create(&a)
		if res.Error == nil {
			alerts = append(alerts, a)
			s.emitWebhook(ctx, orgID, "budget.monthly_limit", a)
		}
	}

	newBal := d.BalanceCents - d.EstCents
	if sc.AutoPauseBelowCents != nil && newBal < *sc.AutoPauseBelowCents {
		now := time.Now()
		reason := "auto_low_balance"
		r := s.db.WithContext(ctx).Exec(
			`UPDATE orgs SET paused_at = ?, pause_reason = ? WHERE id = ? AND paused_at IS NULL`,
			now, reason, orgID)
		if r.RowsAffected > 0 {
			autoPaused = true
			a := domain.SpendAlert{
				OrgID: orgID, Kind: "auto_paused",
				PeriodStart: d.PeriodStart, AmountCents: newBal, FiredAt: now,
			}
			s.db.WithContext(ctx).Create(&a)
			alerts = append(alerts, a)
			s.emitWebhook(ctx, orgID, "budget.auto_paused", a)
		}
	}
	return alerts, autoPaused, nil
}

func (s *Service) emitWebhook(ctx context.Context, orgID, eventType string, a domain.SpendAlert) {
	if s.webhooks == nil {
		return
	}
	_ = s.webhooks.Enqueue(ctx, orgID, eventType, map[string]any{
		"kind":         a.Kind,
		"amount_cents": a.AmountCents,
		"period_start": a.PeriodStart,
		"fired_at":     a.FiredAt,
	})
}

func (s *Service) Get(ctx context.Context, orgID string) (*domain.SpendControls, error) {
	var sc domain.SpendControls
	err := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&sc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &domain.SpendControls{OrgID: orgID, PeriodResetsOn: 1}, nil
	}
	return &sc, err
}

// BurnRateCentsPerDay returns the 7-day rolling average daily spend in cents.
func (s *Service) BurnRateCentsPerDay(ctx context.Context, orgID string) (int64, error) {
	var total sql.NullInt64
	err := s.db.WithContext(ctx).Raw(`
		SELECT COALESCE(SUM(-COALESCE(delta_cents, 0)), 0)
		FROM credits_ledger
		WHERE org_id = ? AND created_at >= ? AND reason IN ('reservation','reconciliation','consumption')`,
		orgID, time.Now().Add(-7*24*time.Hour)).Scan(&total).Error
	if err != nil {
		return 0, err
	}
	return total.Int64 / 7, nil
}

type UpdateInput struct {
	HardCapCents        *int64
	SoftAlertCents      *int64
	AutoPauseBelowCents *int64
	MonthlyLimitCents   *int64
	PeriodResetsOn      *int16
}

func (s *Service) Upsert(ctx context.Context, orgID string, in UpdateInput) (*domain.SpendControls, error) {
	sc := domain.SpendControls{OrgID: orgID, PeriodResetsOn: 1, UpdatedAt: time.Now()}
	_ = s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&sc).Error
	sc.HardCapCents = in.HardCapCents
	sc.SoftAlertCents = in.SoftAlertCents
	sc.AutoPauseBelowCents = in.AutoPauseBelowCents
	sc.MonthlyLimitCents = in.MonthlyLimitCents
	if in.PeriodResetsOn != nil {
		sc.PeriodResetsOn = *in.PeriodResetsOn
	}
	sc.UpdatedAt = time.Now()

	if err := s.db.WithContext(ctx).Save(&sc).Error; err != nil {
		return nil, err
	}
	return &sc, nil
}

// Unpause clears paused_at / pause_reason. Audited by caller.
func (s *Service) Unpause(ctx context.Context, orgID string) error {
	return s.db.WithContext(ctx).Exec(
		`UPDATE orgs SET paused_at = NULL, pause_reason = NULL WHERE id = ?`, orgID).Error
}

// periodStart returns the most recent period boundary for a given reset day.
func periodStart(now time.Time, day int) time.Time {
	y, m, d := now.Date()
	if d >= day {
		return time.Date(y, m, day, 0, 0, 0, 0, time.UTC)
	}
	prev := now.AddDate(0, -1, 0)
	py, pm, _ := prev.Date()
	return time.Date(py, pm, day, 0, 0, 0, 0, time.UTC)
}
