package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"strings"

	"github.com/google/uuid"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/infra/config"
	"github.com/sanidg/nextapi/backend/internal/infra/db"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func main() {
	email := flag.String("email", "", "customer email")
	password := flag.String("password", "", "initial password, min 8 chars")
	orgName := flag.String("org", "", "org name; defaults to '<email> org'")
	credits := flag.Int64("credits", 0, "initial credits/cents to grant")
	flag.Parse()

	e := strings.ToLower(strings.TrimSpace(*email))
	if e == "" || len(*password) < 8 {
		log.Fatal("usage: accountctl --email user@example.com --password 'min-8-chars' --credits 50000")
	}

	cfg := config.Load()
	gormDB, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	ctx := context.Background()

	hash, err := auth.Hash(*password)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}

	userID := "usr_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	name := strings.TrimSpace(*orgName)
	if name == "" {
		name = e + "'s org"
	}

	var user domain.User
	var org domain.Org
	err = gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user = domain.User{ID: userID, Email: e, PasswordHash: &hash}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&user).Error; err != nil {
			return err
		}
		user = domain.User{}
		if err := tx.Where("lower(email) = ?", e).First(&user).Error; err != nil {
			return err
		}
		if user.PasswordHash == nil || *user.PasswordHash == "" {
			if err := tx.Model(&domain.User{}).Where("id = ?", user.ID).Update("password_hash", hash).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("owner_user_id = ?", user.ID).First(&org).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			org = domain.Org{Name: name, OwnerUserID: user.ID}
			if err := tx.Create(&org).Error; err != nil {
				return err
			}
			if err := tx.Create(&domain.OrgMember{OrgID: org.ID, UserID: user.ID, Role: "owner"}).Error; err != nil {
				return err
			}
		}
		if *credits > 0 {
			return tx.Create(&domain.CreditsLedger{
				OrgID:        org.ID,
				DeltaCredits: *credits,
				DeltaCents:   credits,
				Reason:       domain.ReasonTopup,
				Note:         "initial credits by accountctl",
			}).Error
		}
		return nil
	})
	if err != nil {
		log.Fatalf("create account: %v", err)
	}
	log.Printf("account ready email=%s user_id=%s org_id=%s credits=%d", user.Email, user.ID, org.ID, *credits)
}
