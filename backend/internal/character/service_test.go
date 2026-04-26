package character

import (
	"context"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestServiceCreateListUpdateDelete(t *testing.T) {
	db := setupCharacterTestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	row, err := svc.Create(ctx, CreateInput{
		OrgID:           "org_1",
		Name:            "Heroine",
		ReferenceImages: []string{"https://cdn.nextapi.top/heroine.png"},
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if row.Name != "Heroine" {
		t.Fatalf("name = %q; want Heroine", row.Name)
	}

	rows, err := svc.List(ctx, "org_1")
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("List returned %d rows; want 1", len(rows))
	}

	name := "Lead Heroine"
	updated, err := svc.Update(ctx, "org_1", row.ID, UpdateInput{Name: &name})
	if err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if updated.Name != name {
		t.Fatalf("updated name = %q; want %q", updated.Name, name)
	}

	if err := svc.Delete(ctx, "org_1", row.ID); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	if _, err := svc.Get(ctx, "org_1", row.ID); err != ErrNotFound {
		t.Fatalf("Get after delete err = %v; want ErrNotFound", err)
	}
}

func TestServiceRejectsInvalidReferenceImage(t *testing.T) {
	db := setupCharacterTestDB(t)
	svc := NewService(db)
	_, err := svc.Create(context.Background(), CreateInput{
		OrgID:           "org_1",
		Name:            "Bad",
		ReferenceImages: []string{"http://example.com/insecure.png"},
	})
	if err == nil {
		t.Fatalf("Create succeeded with insecure image URL")
	}
}

func setupCharacterTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.Exec(`CREATE TABLE characters (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL,
		name TEXT NOT NULL,
		reference_images JSON NOT NULL DEFAULT '[]',
		metadata JSON NOT NULL DEFAULT '{}',
		created_at DATETIME,
		updated_at DATETIME
	)`).Error; err != nil {
		t.Fatalf("create schema: %v", err)
	}
	return db
}
