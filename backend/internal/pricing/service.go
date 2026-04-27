package pricing

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const globalSettingsID int16 = 1

type Service struct {
	db *gorm.DB
}

type Quote struct {
	UpstreamCostCents   int64  `json:"upstream_cost_cents"`
	CustomerChargeCents int64  `json:"customer_charge_cents"`
	MarkupBPS           int    `json:"markup_bps"`
	Source              string `json:"pricing_source"`
	MarginCents         int64  `json:"margin_cents"`
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) DB() *gorm.DB {
	if s == nil {
		return nil
	}
	return s.db
}

func (s *Service) QuoteEstimate(ctx context.Context, orgID string, upstreamCents int64) (Quote, error) {
	if s == nil || s.db == nil {
		return passThroughQuote(upstreamCents), nil
	}
	settings, err := s.getSettings(ctx, s.db)
	if err != nil {
		return Quote{}, err
	}
	markup, source, err := s.resolveMarkup(ctx, s.db, orgID, settings)
	if err != nil {
		return Quote{}, err
	}
	return buildQuote(upstreamCents, markup, source, settings), nil
}

func (s *Service) QuoteWithMarkup(ctx context.Context, upstreamCents int64, markupBPS int, source string) (Quote, error) {
	if s == nil || s.db == nil {
		return passThroughQuote(upstreamCents), nil
	}
	settings, err := s.getSettings(ctx, s.db)
	if err != nil {
		return Quote{}, err
	}
	return buildQuote(upstreamCents, markupBPS, source, settings), nil
}

func (s *Service) ApplyTopup(ctx context.Context, tx *gorm.DB, orgID string, amountCents int64) error {
	if s == nil || s.db == nil || amountCents <= 0 {
		return nil
	}
	db := tx
	if db == nil {
		db = s.db
	}
	now := time.Now()
	initial := domain.OrgPricingState{
		OrgID:              orgID,
		LifetimeTopupCents: 0,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := db.WithContext(ctx).
		Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "org_id"}}, DoNothing: true}).
		Create(&initial).Error; err != nil {
		return err
	}
	var state domain.OrgPricingState
	if err := db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&state, "org_id = ?", orgID).Error; err != nil {
		return err
	}
	state.LifetimeTopupCents += amountCents
	autoTierID, err := s.bestTierID(ctx, db, state.LifetimeTopupCents)
	if err != nil {
		return err
	}
	state.AutoMembershipTierID = autoTierID
	state.EffectiveMembershipTierID = autoTierID
	var override domain.OrgPricingOverride
	if err := db.WithContext(ctx).First(&override, "org_id = ?", orgID).Error; err == nil && override.ManualMembershipTierID != nil {
		state.EffectiveMembershipTierID = override.ManualMembershipTierID
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	state.UpdatedAt = now
	return db.WithContext(ctx).Save(&state).Error
}

func (s *Service) getSettings(ctx context.Context, db *gorm.DB) (domain.PlatformPricingSettings, error) {
	settings := domain.PlatformPricingSettings{ID: globalSettingsID, Enabled: true, MinChargeCents: 1, RoundingIncrementCents: 1}
	err := db.WithContext(ctx).First(&settings, "id = ?", globalSettingsID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return settings, nil
	}
	if settings.RoundingIncrementCents <= 0 {
		settings.RoundingIncrementCents = 1
	}
	if settings.MinChargeCents < 0 {
		settings.MinChargeCents = 0
	}
	return settings, err
}

func (s *Service) resolveMarkup(ctx context.Context, db *gorm.DB, orgID string, settings domain.PlatformPricingSettings) (int, string, error) {
	if !settings.Enabled {
		return 0, domain.PricingSourcePricingOff, nil
	}
	var override domain.OrgPricingOverride
	err := db.WithContext(ctx).First(&override, "org_id = ?", orgID).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, "", err
	}
	if err == nil && override.OverrideEnabled && override.MarkupBPS != nil {
		return *override.MarkupBPS, domain.PricingSourceOrgOverride, nil
	}
	var state domain.OrgPricingState
	err = db.WithContext(ctx).First(&state, "org_id = ?", orgID).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, "", err
	}
	if err == nil && state.EffectiveMembershipTierID != nil {
		var tier domain.MembershipTier
		err = db.WithContext(ctx).
			Where("id = ? AND enabled = ?", *state.EffectiveMembershipTierID, true).
			First(&tier).Error
		if err == nil {
			return tier.MarkupBPS, domain.PricingSourceMembership, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, "", err
		}
	}
	return settings.DefaultMarkupBPS, domain.PricingSourceGlobal, nil
}

func (s *Service) bestTierID(ctx context.Context, db *gorm.DB, lifetimeTopupCents int64) (*string, error) {
	var tier domain.MembershipTier
	err := db.WithContext(ctx).
		Where("enabled = ? AND min_lifetime_topup_cents <= ?", true, lifetimeTopupCents).
		Order("min_lifetime_topup_cents DESC").
		First(&tier).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &tier.ID, nil
}

func passThroughQuote(upstreamCents int64) Quote {
	if upstreamCents < 0 {
		upstreamCents = 0
	}
	return Quote{
		UpstreamCostCents:   upstreamCents,
		CustomerChargeCents: upstreamCents,
		MarkupBPS:           0,
		Source:              domain.PricingSourceGlobal,
		MarginCents:         0,
	}
}

func buildQuote(upstreamCents int64, markupBPS int, source string, settings domain.PlatformPricingSettings) Quote {
	if upstreamCents < 0 {
		upstreamCents = 0
	}
	if markupBPS < 0 {
		markupBPS = 0
	}
	charge := int64(math.Ceil(float64(upstreamCents) * float64(10000+markupBPS) / 10000.0))
	if upstreamCents > 0 && charge < settings.MinChargeCents {
		charge = settings.MinChargeCents
	}
	if inc := settings.RoundingIncrementCents; inc > 1 && charge > 0 {
		charge = ((charge + inc - 1) / inc) * inc
	}
	return Quote{
		UpstreamCostCents:   upstreamCents,
		CustomerChargeCents: charge,
		MarkupBPS:           markupBPS,
		Source:              source,
		MarginCents:         charge - upstreamCents,
	}
}
