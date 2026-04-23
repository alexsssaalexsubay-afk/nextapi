package billing

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// noopHooks satisfies the WebhookEnqueuer interface with no side effects.
type noopHooks struct{}

func (n *noopHooks) Enqueue(_ context.Context, _, _ string, _ any) error { return nil }

func setupReconcileDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:reconcile_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE IF NOT EXISTS credits_ledger (
		id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL,
		delta_credits BIGINT NOT NULL, delta_cents BIGINT,
		reason TEXT NOT NULL, job_id TEXT,
		note TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS jobs (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL,
		provider TEXT NOT NULL DEFAULT 'seedance',
		provider_job_id TEXT, request TEXT NOT NULL DEFAULT '{}',
		status TEXT NOT NULL DEFAULT 'queued',
		video_url TEXT, tokens_used BIGINT, cost_credits BIGINT,
		reserved_credits BIGINT NOT NULL DEFAULT 0,
		error_code TEXT, error_message TEXT, batch_run_id TEXT,
		api_key_id TEXT, retry_count INT DEFAULT 0,
		last_error_code TEXT, last_error_msg TEXT, exec_metadata TEXT,
		submitting_at DATETIME, running_at DATETIME, retrying_at DATETIME,
		timed_out_at DATETIME, canceled_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS videos (
		id TEXT PRIMARY KEY, org_id TEXT, upstream_job_id TEXT,
		status TEXT, error_code TEXT, error_message TEXT,
		finished_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	return db
}

func insertStuckJob(t *testing.T, db *gorm.DB, id, orgID string, status domain.JobStatus, reserved int64, age time.Duration) {
	t.Helper()
	createdAt := time.Now().Add(-age)
	// Pass request as []byte so SQLite stores it as BLOB, which GORM can scan
	// back into json.RawMessage (= []byte). Passing a TEXT string fails scan.
	if err := db.Exec(`INSERT INTO jobs (id, org_id, status, reserved_credits, request, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, orgID, string(status), reserved, []byte("{}"), "mock", createdAt).Error; err != nil {
		t.Fatal(err)
	}
}

// ---------------------------------------------------------------------------
// Core reconcile behaviour
// ---------------------------------------------------------------------------

func TestReconcile_QueuedJob_MarkedFailed_CreditsRefunded(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	// Top up 10 000 credits, reserve 3 000.
	bill.AddCredits(ctx, Entry{OrgID: "org1", Delta: 10_000, Reason: domain.ReasonTopup})
	jobID := "job_stuck_queued"
	insertStuckJob(t, db, jobID, "org1", domain.JobQueued, 3_000, 2*time.Hour)
	bill.AddCredits(ctx, Entry{OrgID: "org1", Delta: -3_000, Reason: domain.ReasonReservation, JobID: &jobID})

	balBefore, _ := bill.GetBalance(ctx, "org1")
	if balBefore != 7_000 {
		t.Fatalf("balance before reconcile: want 7000, got %d", balBefore)
	}

	svc := &ReconcileService{
		DB:         db,
		Billing:    bill,
		Hooks:      &noopHooks{},
		StuckAfter: 1 * time.Second, // any job older than 1s is stuck
	}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	// Job must be marked failed.
	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobFailed {
		t.Fatalf("expected failed, got %s", j.Status)
	}
	if j.ErrorCode == nil || *j.ErrorCode != "stuck_job" {
		t.Fatalf("want error_code=stuck_job, got %v", j.ErrorCode)
	}
	if j.CompletedAt == nil {
		t.Fatal("expected completed_at to be set")
	}

	// Credits must be refunded.
	balAfter, _ := bill.GetBalance(ctx, "org1")
	if balAfter != 10_000 {
		t.Fatalf("balance after reconcile: want 10000 (full refund), got %d", balAfter)
	}
}

func TestReconcile_RunningJob_MarkedFailed_CreditsRefunded(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	bill.AddCredits(ctx, Entry{OrgID: "org2", Delta: 5_000, Reason: domain.ReasonTopup})
	jobID := "job_stuck_running"
	insertStuckJob(t, db, jobID, "org2", domain.JobRunning, 2_000, 90*time.Minute)
	bill.AddCredits(ctx, Entry{OrgID: "org2", Delta: -2_000, Reason: domain.ReasonReservation, JobID: &jobID})

	svc := &ReconcileService{DB: db, Billing: bill, StuckAfter: 1 * time.Millisecond}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobFailed {
		t.Fatalf("running job: expected failed, got %s", j.Status)
	}
	bal, _ := bill.GetBalance(ctx, "org2")
	if bal != 5_000 {
		t.Fatalf("balance after refund: want 5000, got %d", bal)
	}
}

func TestReconcile_SubmittingJob_MarkedFailed(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	jobID := "job_stuck_submitting"
	insertStuckJob(t, db, jobID, "org3", domain.JobSubmitting, 0, 2*time.Hour)

	svc := &ReconcileService{DB: db, Billing: bill, StuckAfter: 1 * time.Millisecond}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobFailed {
		t.Fatalf("submitting job: expected failed, got %s", j.Status)
	}
}

func TestReconcile_RetryingJob_MarkedFailed(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	jobID := "job_stuck_retrying"
	insertStuckJob(t, db, jobID, "org4", domain.JobRetrying, 0, 2*time.Hour)

	svc := &ReconcileService{DB: db, Billing: bill, StuckAfter: 1 * time.Millisecond}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobFailed {
		t.Fatalf("retrying job: expected failed, got %s", j.Status)
	}
}

func TestReconcile_TerminalJob_IsNotTouched(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	bill.AddCredits(ctx, Entry{OrgID: "org5", Delta: 1_000, Reason: domain.ReasonTopup})

	// Insert an already-succeeded job.
	jobID := "job_already_succeeded"
	if err := db.Exec(`INSERT INTO jobs (id, org_id, status, reserved_credits, request, provider, created_at, completed_at)
		VALUES (?, 'org5', 'succeeded', 500, ?, 'mock', datetime('now', '-3 hour'), datetime('now', '-2 hour'))`,
		jobID, []byte("{}")).Error; err != nil {
		t.Fatal(err)
	}

	svc := &ReconcileService{DB: db, Billing: bill, StuckAfter: 1 * time.Millisecond}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	// Job should remain succeeded.
	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobSucceeded {
		t.Fatalf("succeeded job should not be touched, got %s", j.Status)
	}
	// Balance should not be changed.
	bal, _ := bill.GetBalance(ctx, "org5")
	if bal != 1_000 {
		t.Fatalf("balance should be unchanged at 1000, got %d", bal)
	}
}

func TestReconcile_RecentJob_NotStuck_IsSkipped(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	// Job is only 1 second old; stuck threshold is 1 hour.
	jobID := "job_fresh"
	insertStuckJob(t, db, jobID, "org6", domain.JobQueued, 0, 1*time.Second)

	svc := &ReconcileService{DB: db, Billing: bill, StuckAfter: 1 * time.Hour}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobQueued {
		t.Fatalf("fresh job should remain queued, got %s", j.Status)
	}
}

func TestReconcile_MultipleStuckJobs_AllRefunded(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	bill.AddCredits(ctx, Entry{OrgID: "org7", Delta: 20_000, Reason: domain.ReasonTopup})
	for i := 1; i <= 5; i++ {
		jid := fmt.Sprintf("job_multi_%d", i)
		insertStuckJob(t, db, jid, "org7", domain.JobRunning, 1_000, 2*time.Hour)
		bill.AddCredits(ctx, Entry{OrgID: "org7", Delta: -1_000, Reason: domain.ReasonReservation, JobID: &jid})
	}
	// Balance should be 15 000 after reservations.
	balBefore, _ := bill.GetBalance(ctx, "org7")
	if balBefore != 15_000 {
		t.Fatalf("want 15000 before reconcile, got %d", balBefore)
	}

	svc := &ReconcileService{DB: db, Billing: bill, StuckAfter: 1 * time.Millisecond}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	balAfter, _ := bill.GetBalance(ctx, "org7")
	if balAfter != 20_000 {
		t.Fatalf("all credits should be refunded: want 20000, got %d", balAfter)
	}
}

func TestReconcile_ZeroReservedCredits_DoesNotAddLedgerEntry(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	// Job with no reserved credits — reconcile should still mark it failed
	// but must NOT create a zero-delta ledger row.
	jobID := "job_zero_reserved"
	insertStuckJob(t, db, jobID, "org8", domain.JobQueued, 0, 2*time.Hour)

	var countBefore int64
	db.Table("credits_ledger").Count(&countBefore)

	svc := &ReconcileService{DB: db, Billing: bill, StuckAfter: 1 * time.Millisecond}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	var countAfter int64
	db.Table("credits_ledger").Count(&countAfter)

	// No new ledger rows should have been inserted.
	if countAfter != countBefore {
		t.Fatalf("should not insert ledger rows for zero-reserve job, before=%d after=%d",
			countBefore, countAfter)
	}

	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobFailed {
		t.Fatalf("job should still be marked failed, got %s", j.Status)
	}
}

func TestReconcile_Idempotent_RunningTwice(t *testing.T) {
	db := setupReconcileDB(t)
	bill := NewService(db)
	ctx := context.Background()

	bill.AddCredits(ctx, Entry{OrgID: "org9", Delta: 5_000, Reason: domain.ReasonTopup})
	jobID := "job_idempotent"
	insertStuckJob(t, db, jobID, "org9", domain.JobQueued, 500, 2*time.Hour)
	bill.AddCredits(ctx, Entry{OrgID: "org9", Delta: -500, Reason: domain.ReasonReservation, JobID: &jobID})

	svc := &ReconcileService{DB: db, Billing: bill, StuckAfter: 1 * time.Millisecond}

	// Run twice.
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}
	if err := svc.Run(ctx); err != nil {
		t.Fatal(err)
	}

	// Balance should be fully restored exactly once.
	bal, _ := bill.GetBalance(ctx, "org9")
	if bal != 5_000 {
		t.Fatalf("idempotent reconcile: want 5000, got %d (double-refund?)", bal)
	}
}
