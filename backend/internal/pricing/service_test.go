package pricing

import (
	"context"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&domain.PlatformPricingSettings{},
		&domain.MembershipTier{},
		&domain.OrgPricingOverride{},
		&domain.OrgPricingState{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestQuoteEstimateUsesGlobalMarkupAndRounding(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	if err := db.Create(&domain.PlatformPricingSettings{
		ID:                     1,
		Enabled:                true,
		DefaultMarkupBPS:       3000,
		MinChargeCents:         1,
		RoundingIncrementCents: 5,
	}).Error; err != nil {
		t.Fatalf("settings: %v", err)
	}

	q, err := NewService(db).QuoteEstimate(ctx, "org1", 101)
	if err != nil {
		t.Fatalf("quote: %v", err)
	}
	if q.CustomerChargeCents != 135 || q.MarginCents != 34 || q.Source != domain.PricingSourceGlobal {
		t.Fatalf("unexpected quote: %+v", q)
	}
}

func TestQuoteEstimatePrefersOrgOverrideOverMembership(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	tierID := "tier-gold"
	markup := 5000
	_ = db.Create(&domain.PlatformPricingSettings{ID: 1, Enabled: true, DefaultMarkupBPS: 3000, RoundingIncrementCents: 1}).Error
	_ = db.Create(&domain.MembershipTier{ID: tierID, Name: "Gold", MinLifetimeTopupCents: 10000, MarkupBPS: 1000, Enabled: true}).Error
	_ = db.Create(&domain.OrgPricingState{OrgID: "org1", EffectiveMembershipTierID: &tierID}).Error
	_ = db.Create(&domain.OrgPricingOverride{OrgID: "org1", OverrideEnabled: true, MarkupBPS: &markup}).Error

	q, err := NewService(db).QuoteEstimate(ctx, "org1", 100)
	if err != nil {
		t.Fatalf("quote: %v", err)
	}
	if q.CustomerChargeCents != 150 || q.MarkupBPS != 5000 || q.Source != domain.PricingSourceOrgOverride {
		t.Fatalf("unexpected quote: %+v", q)
	}
}

func TestApplyTopupAutoUpgradesUnlessManualOverrideExists(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	svc := NewService(db)
	silverID := "tier-silver"
	goldID := "tier-gold"
	enterpriseID := "tier-enterprise"
	if err := db.Create([]domain.MembershipTier{
		{ID: silverID, Name: "Silver", MinLifetimeTopupCents: 10000, MarkupBPS: 2500, Enabled: true},
		{ID: goldID, Name: "Gold", MinLifetimeTopupCents: 50000, MarkupBPS: 2000, Enabled: true},
		{ID: enterpriseID, Name: "Enterprise", MinLifetimeTopupCents: 100000, MarkupBPS: 1500, Enabled: true},
	}).Error; err != nil {
		t.Fatalf("tiers: %v", err)
	}
	if err := svc.ApplyTopup(ctx, nil, "org1", 60000); err != nil {
		t.Fatalf("apply topup: %v", err)
	}
	var state domain.OrgPricingState
	if err := db.First(&state, "org_id = ?", "org1").Error; err != nil {
		t.Fatalf("state: %v", err)
	}
	if state.AutoMembershipTierID == nil || *state.AutoMembershipTierID != goldID {
		t.Fatalf("expected gold auto tier, got %+v", state.AutoMembershipTierID)
	}
	if state.EffectiveMembershipTierID == nil || *state.EffectiveMembershipTierID != goldID {
		t.Fatalf("expected gold effective tier, got %+v", state.EffectiveMembershipTierID)
	}

	if err := db.Create(&domain.OrgPricingOverride{OrgID: "org1", ManualMembershipTierID: &silverID}).Error; err != nil {
		t.Fatalf("manual override: %v", err)
	}
	if err := svc.ApplyTopup(ctx, nil, "org1", 50000); err != nil {
		t.Fatalf("apply second topup: %v", err)
	}
	if err := db.First(&state, "org_id = ?", "org1").Error; err != nil {
		t.Fatalf("state reload: %v", err)
	}
	if state.AutoMembershipTierID == nil || *state.AutoMembershipTierID != enterpriseID {
		t.Fatalf("expected enterprise auto tier, got %+v", state.AutoMembershipTierID)
	}
	if state.EffectiveMembershipTierID == nil || *state.EffectiveMembershipTierID != silverID {
		t.Fatalf("expected manual silver effective tier, got %+v", state.EffectiveMembershipTierID)
	}
}
