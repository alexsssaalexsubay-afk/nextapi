package moderation

import (
	"context"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE moderation_profile (
		org_id TEXT PRIMARY KEY, profile TEXT NOT NULL DEFAULT 'balanced',
		custom_rules TEXT NOT NULL DEFAULT '{}',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE moderation_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		org_id TEXT NOT NULL, video_id TEXT, api_key_id TEXT,
		profile_used TEXT NOT NULL, verdict TEXT NOT NULL,
		reason TEXT, internal_note TEXT, reviewer TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE api_keys (
		id TEXT PRIMARY KEY, org_id TEXT NOT NULL, key_hash TEXT,
		role TEXT NOT NULL DEFAULT 'business', label TEXT,
		moderation_profile TEXT,
		disabled_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	return db
}

func TestStrict_BlocksNSFW(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()
	svc.UpsertProfile(ctx, "org1", UpsertInput{Profile: "strict"})

	_, err := svc.Check(ctx, CheckInput{OrgID: "org1", Prompt: "generate NSFW content"})
	if err != ErrBlocked {
		t.Fatalf("strict should block NSFW, got %v", err)
	}
}

func TestStrict_AllowsSafe(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()
	svc.UpsertProfile(ctx, "org1", UpsertInput{Profile: "strict"})

	_, err := svc.Check(ctx, CheckInput{OrgID: "org1", Prompt: "a beautiful sunset over mountains"})
	if err != nil {
		t.Fatalf("strict should allow safe content, got %v", err)
	}
}

func TestBalanced_BlocksNSFW(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	_, err := svc.Check(ctx, CheckInput{OrgID: "org1", Prompt: "explicit nude scene"})
	if err != ErrBlocked {
		t.Fatalf("balanced should block explicit NSFW, got %v", err)
	}
}

func TestRelaxed_AllowsNSFW(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()
	svc.UpsertProfile(ctx, "org1", UpsertInput{Profile: "relaxed"})

	_, err := svc.Check(ctx, CheckInput{OrgID: "org1", Prompt: "nsfw artistic content"})
	if err != nil {
		t.Fatalf("relaxed should allow NSFW, got %v", err)
	}
}

func TestMinors_AlwaysBlocked(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	for _, profile := range []string{"strict", "balanced", "relaxed"} {
		svc.UpsertProfile(ctx, "org1", UpsertInput{Profile: profile})
		_, err := svc.Check(ctx, CheckInput{OrgID: "org1", Prompt: "content involving a child"})
		if err != ErrBlocked {
			t.Fatalf("minors should be blocked on %s profile, got %v", profile, err)
		}
	}
}

func TestPerKeyOverride(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	svc.UpsertProfile(ctx, "org1", UpsertInput{Profile: "balanced"})
	db.Exec(`INSERT INTO api_keys (id, org_id, role, moderation_profile) VALUES ('key1', 'org1', 'business', 'strict')`)

	keyID := "key1"
	_, err := svc.Check(ctx, CheckInput{OrgID: "org1", APIKeyID: &keyID, Prompt: "nsfw artistic stuff"})
	if err != ErrBlocked {
		t.Fatalf("per-key strict override should block NSFW, got %v", err)
	}
}

func TestEventLogged(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	svc.Check(ctx, CheckInput{OrgID: "org1", Prompt: "safe prompt"})
	svc.Check(ctx, CheckInput{OrgID: "org1", Prompt: "another safe prompt"})

	events, err := svc.ListEvents(ctx, "org1", 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 {
		t.Fatalf("want 2 events, got %d", len(events))
	}
}

func TestAddReviewNote(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	svc.Check(ctx, CheckInput{OrgID: "org1", Prompt: "test prompt"})

	events, _ := svc.ListEvents(ctx, "org1", 1, 0)
	if len(events) == 0 {
		t.Fatal("no events")
	}

	svc.AddReviewNote(ctx, events[0].ID, "reviewed and approved", "admin@test.com")

	var e domain.ModerationEvent
	db.First(&e, "id = ?", events[0].ID)
	if e.InternalNote == nil || *e.InternalNote != "reviewed and approved" {
		t.Fatalf("want review note, got %v", e.InternalNote)
	}
}
