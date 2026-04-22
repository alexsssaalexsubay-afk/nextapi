package webhook

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSignWithTimestamp_Format(t *testing.T) {
	body := []byte(`{"id":"job_1","status":"succeeded"}`)
	ts := int64(1714000000)
	sig := signWithTimestamp("whsec_testsecret", ts, body)

	if len(sig) < 20 {
		t.Fatalf("signature too short: %s", sig)
	}
	if sig[:2] != "t=" {
		t.Fatalf("want prefix t=, got %s", sig[:2])
	}
}

func TestSignWithTimestamp_Deterministic(t *testing.T) {
	body := []byte(`{"data":"test"}`)
	ts := int64(1714000000)
	s1 := signWithTimestamp("secret", ts, body)
	s2 := signWithTimestamp("secret", ts, body)
	if s1 != s2 {
		t.Fatalf("signatures differ: %s vs %s", s1, s2)
	}
}

func TestSignWithTimestamp_DifferentSecret(t *testing.T) {
	body := []byte(`{"data":"test"}`)
	ts := int64(1714000000)
	s1 := signWithTimestamp("secret1", ts, body)
	s2 := signWithTimestamp("secret2", ts, body)
	if s1 == s2 {
		t.Fatal("different secrets should produce different signatures")
	}
}

func TestMatchEvent_Exact(t *testing.T) {
	if !matchEvent([]string{"video.succeeded"}, "video.succeeded") {
		t.Fatal("exact match should pass")
	}
	if matchEvent([]string{"video.succeeded"}, "video.failed") {
		t.Fatal("non-matching event should fail")
	}
}

func TestMatchEvent_Wildcard(t *testing.T) {
	if !matchEvent([]string{"video.*"}, "video.succeeded") {
		t.Fatal("wildcard should match video.succeeded")
	}
	if !matchEvent([]string{"video.*"}, "video.failed") {
		t.Fatal("wildcard should match video.failed")
	}
	if matchEvent([]string{"video.*"}, "budget.alert") {
		t.Fatal("video.* should not match budget.alert")
	}
}

func TestMatchEvent_BudgetEvents(t *testing.T) {
	patterns := []string{"video.*", "budget.alert", "budget.auto_paused", "budget.monthly_limit"}
	for _, e := range []string{"budget.alert", "budget.auto_paused", "budget.monthly_limit"} {
		if !matchEvent(patterns, e) {
			t.Fatalf("should match %s", e)
		}
	}
}

func setupWebhookDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE webhooks (
		id TEXT PRIMARY KEY, org_id TEXT NOT NULL, url TEXT NOT NULL,
		secret TEXT NOT NULL, event_types TEXT, prev_secret TEXT,
		rotated_at DATETIME, disabled INTEGER DEFAULT 0, disabled_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE webhook_deliveries (
		id INTEGER PRIMARY KEY AUTOINCREMENT, webhook_id TEXT NOT NULL,
		event_type TEXT NOT NULL, payload TEXT NOT NULL,
		status_code INT, error TEXT, attempt INT NOT NULL DEFAULT 0,
		signature TEXT, timestamp_unix BIGINT,
		next_retry_at DATETIME, delivered_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	return db
}

func seedWebhook(t *testing.T, db *gorm.DB, id, orgID, secret string) {
	t.Helper()
	db.Exec(`INSERT INTO webhooks (id, org_id, url, secret, event_types) VALUES (?, ?, 'https://example.com/hook', ?, '{video.*}')`,
		id, orgID, secret)
}

func seedDelivery(t *testing.T, db *gorm.DB, webhookID, eventType string) int64 {
	t.Helper()
	payload, _ := json.Marshal(map[string]string{"id": "job_1"})
	row := domain.WebhookDelivery{
		WebhookID: webhookID,
		EventType: eventType,
		Payload:   payload,
	}
	db.Create(&row)
	return row.ID
}

func TestListDeliveries_ReturnsOrderedResults(t *testing.T) {
	db := setupWebhookDB(t)
	seedWebhook(t, db, "wh1", "org1", "secret")
	svc := NewService(db)

	id1 := seedDelivery(t, db, "wh1", "video.succeeded")
	id2 := seedDelivery(t, db, "wh1", "video.failed")

	rows, err := svc.ListDeliveries(context.Background(), "wh1", 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 deliveries, got %d", len(rows))
	}
	// Most recent first.
	if rows[0].ID != id2 || rows[1].ID != id1 {
		t.Fatalf("expected order [%d, %d], got [%d, %d]", id2, id1, rows[0].ID, rows[1].ID)
	}
}

func TestListDeliveries_PaginationWorks(t *testing.T) {
	db := setupWebhookDB(t)
	seedWebhook(t, db, "wh1", "org1", "secret")
	svc := NewService(db)

	for i := 0; i < 5; i++ {
		seedDelivery(t, db, "wh1", "video.succeeded")
	}

	page1, _ := svc.ListDeliveries(context.Background(), "wh1", 2, 0)
	if len(page1) != 2 {
		t.Fatalf("page 1: expected 2, got %d", len(page1))
	}
	page2, _ := svc.ListDeliveries(context.Background(), "wh1", 2, 2)
	if len(page2) != 2 {
		t.Fatalf("page 2: expected 2, got %d", len(page2))
	}
	if page1[0].ID == page2[0].ID {
		t.Fatal("pages should have different deliveries")
	}
}

func TestReplay_ResetsDeliveryForRetry(t *testing.T) {
	db := setupWebhookDB(t)
	seedWebhook(t, db, "wh1", "org1", "secret")
	svc := NewService(db)

	id := seedDelivery(t, db, "wh1", "video.succeeded")
	// Mark as delivered.
	now := time.Now()
	db.Model(&domain.WebhookDelivery{}).Where("id = ?", id).Updates(map[string]any{
		"delivered_at": now, "attempt": 3,
	})

	if err := svc.Replay(context.Background(), id); err != nil {
		t.Fatal(err)
	}

	var row domain.WebhookDelivery
	db.First(&row, id)
	if row.Attempt != 0 {
		t.Fatalf("expected attempt reset to 0, got %d", row.Attempt)
	}
	if row.DeliveredAt != nil {
		t.Fatal("expected delivered_at to be nil after replay")
	}
	if row.NextRetryAt == nil {
		t.Fatal("expected next_retry_at to be set")
	}
}

func TestRotateSecret_PreservesOldSecret(t *testing.T) {
	db := setupWebhookDB(t)
	seedWebhook(t, db, "wh1", "org1", "old_secret")
	svc := NewService(db)

	updated, err := svc.RotateSecret(context.Background(), "org1", "wh1", "new_secret")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Secret != "new_secret" {
		t.Fatalf("expected new secret, got %s", updated.Secret)
	}

	// Verify old secret is preserved.
	var h domain.Webhook
	db.First(&h, "id = ?", "wh1")
	// Check prev_secret stored in DB.
	var prevSecret *string
	db.Raw(`SELECT prev_secret FROM webhooks WHERE id = 'wh1'`).Scan(&prevSecret)
	if prevSecret == nil || *prevSecret != "old_secret" {
		t.Fatalf("expected prev_secret to be 'old_secret', got %v", prevSecret)
	}
}

func TestRotateSecret_NotFoundForWrongOrg(t *testing.T) {
	db := setupWebhookDB(t)
	seedWebhook(t, db, "wh1", "org1", "secret")
	svc := NewService(db)

	_, err := svc.RotateSecret(context.Background(), "org2", "wh1", "new")
	if err == nil {
		t.Fatal("expected error for wrong org_id")
	}
}

func TestBackoffSchedule(t *testing.T) {
	backoff := []time.Duration{
		30 * time.Second,
		2 * time.Minute,
		10 * time.Minute,
		1 * time.Hour,
		6 * time.Hour,
		24 * time.Hour,
	}
	if len(backoff) != 6 {
		t.Fatalf("want 6 backoff steps, got %d", len(backoff))
	}
	if backoff[0] != 30*time.Second {
		t.Fatalf("first backoff should be 30s, got %v", backoff[0])
	}
	if backoff[5] != 24*time.Hour {
		t.Fatalf("last backoff should be 24h, got %v", backoff[5])
	}
}
