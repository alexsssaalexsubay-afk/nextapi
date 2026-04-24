// k6seed creates a fixed test org, credits, relaxed throughput, and a business API key for local k6 runs.
// Usage (from repo root, postgres up + migrations applied):
//
//	cd backend && go run ./cmd/k6seed
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/infra/config"
	"github.com/sanidg/nextapi/backend/internal/infra/db"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	k6UserID    = "k6_seed_user"
	k6UserEmail = "k6-seed@loadtest.local"
	k6OrgName   = "k6 loadtest"
	k6KeyName   = "k6-seed"
	// Fixed UUIDs so the seed is idempotent and safe to re-run.
	k6OrgID = "a0000000-0000-4000-8000-000000000001"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	cfg := config.Load()
	if os.Getenv("DATABASE_URL") == "" {
		_ = os.Setenv("DATABASE_URL", cfg.DatabaseURL)
	}

	gormDB, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("db: %w", err)
	}
	ctx := context.Background()

	if err := ensureUser(ctx, gormDB); err != nil {
		return err
	}
	if err := ensureOrg(ctx, gormDB); err != nil {
		return err
	}
	if err := ensureTopup(ctx, gormDB); err != nil {
		return err
	}
	if err := ensureThroughput(ctx, gormDB); err != nil {
		return err
	}
	if err := gormDB.WithContext(ctx).Where("org_id = ? AND name = ?", k6OrgID, k6KeyName).Delete(&domain.APIKey{}).Error; err != nil {
		return err
	}

	a := auth.NewService(gormDB)
	res, err := a.CreateKey(ctx, auth.CreateKeyInput{
		OrgID:                  k6OrgID,
		Name:                   k6KeyName,
		Kind:                   auth.KindBusiness,
		Env:                    auth.EnvLive,
		ProvisionedConcurrency: intPtr(200),
		RateLimitRPM:           intPtr(100_000),
	})
	if err != nil {
		return err
	}

	fmt.Fprintf(os.Stdout, "export K6_API_KEY=%q\n", res.FullKey)
	return nil
}

func intPtr(n int) *int { return &n }

func ensureUser(ctx context.Context, gormDB *gorm.DB) error {
	u := domain.User{ID: k6UserID, Email: k6UserEmail}
	return gormDB.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"email"}),
	}).Create(&u).Error
}

func ensureOrg(ctx context.Context, gormDB *gorm.DB) error {
	var n int64
	_ = gormDB.WithContext(ctx).Model(&domain.Org{}).Where("id = ?", k6OrgID).Count(&n).Error
	if n > 0 {
		return nil
	}
	org := domain.Org{
		ID:          k6OrgID,
		Name:        k6OrgName,
		OwnerUserID: k6UserID,
	}
	if err := gormDB.WithContext(ctx).Create(&org).Error; err != nil {
		return err
	}
	om := domain.OrgMember{OrgID: k6OrgID, UserID: k6UserID, Role: "owner"}
	if err := gormDB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&om).Error; err != nil {
		return err
	}
	return nil
}

func ensureTopup(ctx context.Context, gormDB *gorm.DB) error {
	b := billing.NewService(gormDB)
	bal, err := b.GetBalance(ctx, k6OrgID)
	if err != nil {
		return err
	}
	if bal >= 1_000_000_000 {
		return nil
	}
	const topup = int64(50_000_000_000)
	return b.AddCredits(ctx, billing.Entry{
		OrgID:  k6OrgID,
		Delta:  topup,
		Reason: domain.ReasonTopup,
		Note:   "k6 seed topup",
	})
}

func ensureThroughput(ctx context.Context, gormDB *gorm.DB) error {
	cfg := domain.ThroughputConfig{
		OrgID:               k6OrgID,
		ReservedConcurrency: 2,
		BurstConcurrency:    200,
		PriorityLane:        "standard",
		RPMLimit:            1_000_000,
		QueueTier:           "default",
		UpdatedAt:           time.Now(),
	}
	var existing domain.ThroughputConfig
	err := gormDB.WithContext(ctx).Where("org_id = ?", k6OrgID).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return gormDB.WithContext(ctx).Create(&cfg).Error
	}
	if err != nil {
		// Migrations not applied or table missing in stripped DB — skip.
		return nil
	}
	return gormDB.WithContext(ctx).Model(&domain.ThroughputConfig{}).
		Where("org_id = ?", k6OrgID).
		Updates(map[string]any{
			"burst_concurrency": 200,
			"rpm_limit":         1_000_000,
			"updated_at":        time.Now(),
		}).Error
}
