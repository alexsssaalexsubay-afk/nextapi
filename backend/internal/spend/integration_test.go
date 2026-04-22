package spend

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupIntegDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE orgs (id TEXT PRIMARY KEY, name TEXT, paused_at DATETIME, pause_reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE spend_controls (
		org_id TEXT PRIMARY KEY, hard_cap_cents BIGINT, soft_alert_cents BIGINT,
		auto_pause_below_cents BIGINT, monthly_limit_cents BIGINT,
		period_resets_on SMALLINT NOT NULL DEFAULT 1,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE spend_alerts (
		id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, kind TEXT,
		period_start DATETIME, amount_cents BIGINT, fired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE (org_id, kind, period_start))`)
	db.Exec(`CREATE TABLE credits_ledger (
		id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL,
		delta_credits BIGINT, delta_cents BIGINT, reason TEXT NOT NULL, job_id TEXT,
		note TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE jobs (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL, api_key_id TEXT,
		provider TEXT NOT NULL, provider_job_id TEXT, request TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'queued', video_url TEXT, tokens_used BIGINT,
		cost_credits BIGINT, reserved_credits BIGINT NOT NULL DEFAULT 0,
		error_code TEXT, error_message TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	return db
}

func seedIntegOrg(t *testing.T, db *gorm.DB, id string) {
	t.Helper()
	db.Exec(`INSERT INTO orgs (id, name) VALUES (?, 'test')`, id)
}

func topupInteg(t *testing.T, db *gorm.DB, orgID string, cents int64) {
	t.Helper()
	db.Exec(`INSERT INTO credits_ledger (org_id, delta_cents, reason) VALUES (?, ?, 'topup')`, orgID, cents)
}

// TestEnforce_FullReservationCycle simulates reserve → reconcile → refund.
func TestEnforce_FullReservationCycle(t *testing.T) {
	db := setupIntegDB(t)
	seedIntegOrg(t, db, "o1")
	topupInteg(t, db, "o1", 10000) // $100

	svc := NewService(db)

	// Reserve $20.
	err := db.Transaction(func(tx *gorm.DB) error {
		d, e := svc.Enforce(context.Background(), tx, "o1", 2000)
		if e != nil {
			return e
		}
		if d.BalanceCents != 10000 {
			t.Fatalf("expected balance 10000, got %d", d.BalanceCents)
		}
		return tx.Exec(
			`INSERT INTO credits_ledger (org_id, delta_cents, reason) VALUES ('o1', -2000, 'reservation')`,
		).Error
	})
	if err != nil {
		t.Fatal(err)
	}

	// Check balance is now 8000.
	var bal int64
	db.Raw(`SELECT COALESCE(SUM(COALESCE(delta_cents,0)),0) FROM credits_ledger WHERE org_id = 'o1'`).Scan(&bal)
	if bal != 8000 {
		t.Fatalf("after reservation: want 8000, got %d", bal)
	}

	// Reconcile: actual cost was $15, refund $5.
	db.Exec(`INSERT INTO credits_ledger (org_id, delta_cents, reason) VALUES ('o1', 500, 'reconciliation')`)
	db.Raw(`SELECT COALESCE(SUM(COALESCE(delta_cents,0)),0) FROM credits_ledger WHERE org_id = 'o1'`).Scan(&bal)
	if bal != 8500 {
		t.Fatalf("after reconciliation: want 8500, got %d", bal)
	}
}

// TestEnforce_BudgetCapBlock verifies hard cap blocks requests.
func TestEnforce_BudgetCapBlock(t *testing.T) {
	db := setupIntegDB(t)
	seedIntegOrg(t, db, "o1")
	topupInteg(t, db, "o1", 100000) // $1000

	svc := NewService(db)

	// Set a hard cap of $50 for the period.
	hc := int64(5000)
	day := int16(1)
	svc.Upsert(context.Background(), "o1", UpdateInput{HardCapCents: &hc, PeriodResetsOn: &day})

	// Spend $40 reservation.
	err := db.Transaction(func(tx *gorm.DB) error {
		_, e := svc.Enforce(context.Background(), tx, "o1", 4000)
		if e != nil {
			return e
		}
		return tx.Exec(
			`INSERT INTO credits_ledger (org_id, delta_cents, reason) VALUES ('o1', -4000, 'reservation')`,
		).Error
	})
	if err != nil {
		t.Fatal(err)
	}

	// Try to spend another $20 — should exceed the $50 hard cap.
	err = db.Transaction(func(tx *gorm.DB) error {
		_, e := svc.Enforce(context.Background(), tx, "o1", 2000)
		return e
	})
	if err != ErrBudgetCap {
		t.Fatalf("expected ErrBudgetCap, got %v", err)
	}
}

// TestEnforce_MonthlyLimitBlock verifies monthly limit blocks requests.
func TestEnforce_MonthlyLimitBlock(t *testing.T) {
	db := setupIntegDB(t)
	seedIntegOrg(t, db, "o1")
	topupInteg(t, db, "o1", 100000)

	svc := NewService(db)

	ml := int64(3000)
	day := int16(1)
	svc.Upsert(context.Background(), "o1", UpdateInput{MonthlyLimitCents: &ml, PeriodResetsOn: &day})

	// Spend $25.
	err := db.Transaction(func(tx *gorm.DB) error {
		_, e := svc.Enforce(context.Background(), tx, "o1", 2500)
		if e != nil {
			return e
		}
		return tx.Exec(
			`INSERT INTO credits_ledger (org_id, delta_cents, reason) VALUES ('o1', -2500, 'reservation')`,
		).Error
	})
	if err != nil {
		t.Fatal(err)
	}

	// Try another $10 — total $35 > $30 limit.
	err = db.Transaction(func(tx *gorm.DB) error {
		_, e := svc.Enforce(context.Background(), tx, "o1", 1000)
		return e
	})
	if err != ErrMonthlyLimit {
		t.Fatalf("expected ErrMonthlyLimit, got %v", err)
	}
}

// TestEnforce_PausedOrgRejected confirms paused orgs can't spend.
func TestEnforce_PausedOrgRejected(t *testing.T) {
	db := setupIntegDB(t)
	seedIntegOrg(t, db, "o1")
	topupInteg(t, db, "o1", 10000)

	now := time.Now()
	db.Exec(`UPDATE orgs SET paused_at = ?, pause_reason = 'low_balance' WHERE id = 'o1'`, now)

	svc := NewService(db)

	err := db.Transaction(func(tx *gorm.DB) error {
		_, e := svc.Enforce(context.Background(), tx, "o1", 100)
		return e
	})
	if err != ErrOrgPaused {
		t.Fatalf("expected ErrOrgPaused, got %v", err)
	}
}

// TestAfterReserve_WebhookFiring verifies that webhooks fire on alerts.
func TestAfterReserve_WebhookFiring(t *testing.T) {
	db := setupIntegDB(t)
	seedIntegOrg(t, db, "o1")

	svc := NewService(db)
	spy := &webhookSpy{}
	svc.SetWebhooks(spy)

	sa := int64(500)
	day := int16(1)
	svc.Upsert(context.Background(), "o1", UpdateInput{SoftAlertCents: &sa, PeriodResetsOn: &day})

	// Simulate a spend that exceeds soft alert.
	topupInteg(t, db, "o1", 10000)
	db.Exec(`INSERT INTO credits_ledger (org_id, delta_cents, reason) VALUES ('o1', -600, 'reservation')`)

	decision := &Decision{BalanceCents: 9400, PeriodSpend: 600, PeriodStart: periodStart(time.Now(), 1)}
	svc.AfterReserve(context.Background(), "o1", decision)

	if spy.count == 0 {
		t.Fatal("expected at least one webhook event for soft alert")
	}
}

type webhookSpy struct {
	count  int
	events []string
}

func (w *webhookSpy) Enqueue(_ context.Context, _ string, eventType string, _ any) error {
	w.count++
	w.events = append(w.events, eventType)
	return nil
}

// TestBurnRate verifies burn rate calculation.
func TestBurnRate(t *testing.T) {
	db := setupIntegDB(t)
	seedIntegOrg(t, db, "o1")

	svc := NewService(db)

	// Add 7 days of spend: $100/day.
	for i := 0; i < 7; i++ {
		ts := time.Now().AddDate(0, 0, -i)
		db.Exec(
			`INSERT INTO credits_ledger (org_id, delta_cents, reason, created_at) VALUES ('o1', -10000, 'reservation', ?)`,
			ts,
		)
	}

	rate, err := svc.BurnRateCentsPerDay(context.Background(), "o1")
	if err != nil {
		t.Fatal(err)
	}
	if rate != 10000 {
		t.Fatalf("expected burn rate ~10000, got %d", rate)
	}
}

func init() {
	// Suppress domain.SpendControls auto-creation warnings in tests.
	_ = domain.SpendControls{}
}
