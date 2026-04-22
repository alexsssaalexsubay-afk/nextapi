package job

import (
	"context"
	"fmt"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/provider"
	"github.com/sanidg/nextapi/backend/internal/provider/seedance"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// fakeQueue records enqueues and can simulate failure.
type fakeQueue struct {
	enqueued int
	fail     error
}

func (f *fakeQueue) EnqueueContext(_ context.Context, _ *asynq.Task, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	if f.fail != nil {
		return nil, f.fail
	}
	f.enqueued++
	return &asynq.TaskInfo{}, nil
}

func setupDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	// SQLite schema mirrors production (minus enum types / jsonb).
	db.Exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, created_at DATETIME, deleted_at DATETIME)`)
	db.Exec(`CREATE TABLE orgs (id TEXT PRIMARY KEY, name TEXT, owner_user_id TEXT, created_at DATETIME)`)
	db.Exec(`CREATE TABLE jobs (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL, api_key_id TEXT,
		provider TEXT NOT NULL, provider_job_id TEXT, request TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'queued', video_url TEXT, tokens_used BIGINT,
		cost_credits BIGINT, reserved_credits BIGINT NOT NULL DEFAULT 0,
		error_code TEXT, error_message TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	db.Exec(`CREATE TABLE credits_ledger (
		id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL,
		delta_credits BIGINT NOT NULL, delta_cents BIGINT, reason TEXT NOT NULL, job_id TEXT,
		note TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	return db
}

func seedOrgWithCredits(t *testing.T, db *gorm.DB, orgID string, credits int64) {
	t.Helper()
	if err := db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES (?, 'o', 'u', CURRENT_TIMESTAMP)`, orgID).Error; err != nil {
		t.Fatal(err)
	}
	if credits != 0 {
		if err := db.Create(&domain.CreditsLedger{
			OrgID: orgID, DeltaCredits: credits, Reason: domain.ReasonSignupBonus,
		}).Error; err != nil {
			t.Fatal(err)
		}
	}
}

func makeReq() provider.GenerationRequest {
	return provider.GenerationRequest{
		Prompt:          "a unit test",
		DurationSeconds: 5,
		Resolution:      "480p",
		Mode:            "fast",
	}
}

func TestCreate_InsufficientCredits(t *testing.T) {
	db := setupDB(t)
	seedOrgWithCredits(t, db, "org1", 0)
	svc := NewService(db, billing.NewService(db), seedance.NewMock(), &fakeQueue{})

	_, err := svc.Create(context.Background(), CreateInput{
		OrgID: "org1", Request: makeReq(),
	})
	if err != ErrInsufficient {
		t.Fatalf("expected ErrInsufficient, got %v", err)
	}

	bal, _ := billing.NewService(db).GetBalance(context.Background(), "org1")
	if bal != 0 {
		t.Fatalf("balance should be untouched, got %d", bal)
	}
}

func TestCreate_ReservesCreditsAndEnqueues(t *testing.T) {
	db := setupDB(t)
	seedOrgWithCredits(t, db, "org1", 1_000_000)
	q := &fakeQueue{}
	bill := billing.NewService(db)
	svc := NewService(db, bill, seedance.NewMock(), q)

	res, err := svc.Create(context.Background(), CreateInput{
		OrgID: "org1", Request: makeReq(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.EstimatedCredits <= 0 {
		t.Fatalf("want positive credits, got %d", res.EstimatedCredits)
	}
	if q.enqueued != 1 {
		t.Fatalf("want 1 enqueue, got %d", q.enqueued)
	}

	bal, _ := bill.GetBalance(context.Background(), "org1")
	want := int64(1_000_000) - res.EstimatedCredits
	if bal != want {
		t.Fatalf("balance: want %d, got %d", want, bal)
	}

	// Job row exists and is queued.
	var j domain.Job
	if err := db.First(&j, "id = ?", res.JobID).Error; err != nil {
		t.Fatal(err)
	}
	if j.Status != domain.JobQueued {
		t.Fatalf("want queued, got %s", j.Status)
	}
	if j.ReservedCredits != res.EstimatedCredits {
		t.Fatalf("reserved mismatch")
	}
}

// The critical bug we just fixed: if enqueue fails, reservation must be
// refunded and job marked failed — not left hanging with customer's credits gone.
func TestCreate_EnqueueFailure_RefundsReservation(t *testing.T) {
	db := setupDB(t)
	seedOrgWithCredits(t, db, "org1", 1_000_000)
	bill := billing.NewService(db)
	svc := NewService(db, bill, seedance.NewMock(), &fakeQueue{fail: context.Canceled})

	_, err := svc.Create(context.Background(), CreateInput{
		OrgID: "org1", Request: makeReq(),
	})
	if err == nil {
		t.Fatal("expected error from enqueue failure")
	}

	bal, _ := bill.GetBalance(context.Background(), "org1")
	if bal != 1_000_000 {
		t.Fatalf("balance should be fully refunded, got %d (want 1000000)", bal)
	}

	var j domain.Job
	if err := db.Order("created_at DESC").First(&j).Error; err != nil {
		t.Fatal(err)
	}
	if j.Status != domain.JobFailed {
		t.Fatalf("want failed, got %s", j.Status)
	}
	if j.ErrorCode == nil || *j.ErrorCode != "enqueue_failed" {
		t.Fatalf("want enqueue_failed error code, got %v", j.ErrorCode)
	}
}

func TestGet_ScopedByOrg(t *testing.T) {
	db := setupDB(t)
	seedOrgWithCredits(t, db, "org1", 1_000_000)
	seedOrgWithCredits(t, db, "org2", 1_000_000)
	svc := NewService(db, billing.NewService(db), seedance.NewMock(), &fakeQueue{})

	res, err := svc.Create(context.Background(), CreateInput{
		OrgID: "org1", Request: makeReq(),
	})
	if err != nil {
		t.Fatal(err)
	}

	// org1 can fetch its own job.
	if _, err := svc.Get(context.Background(), "org1", res.JobID); err != nil {
		t.Fatalf("owner should read: %v", err)
	}
	// org2 must NOT see org1's job.
	if _, err := svc.Get(context.Background(), "org2", res.JobID); err == nil {
		t.Fatal("expected not found for other org")
	}
}
