package billing

import (
	"context"
	"testing"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE credits_ledger (
		id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL,
		delta_credits BIGINT NOT NULL, delta_cents BIGINT,
		reason TEXT NOT NULL, job_id TEXT,
		note TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	return db
}

func TestAddCredits_DualWritesDeltaCents(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)

	err := svc.AddCredits(context.Background(), Entry{
		OrgID: "org1", Delta: 5000, Reason: domain.ReasonTopup, Note: "test topup",
	})
	if err != nil {
		t.Fatal(err)
	}

	var row domain.CreditsLedger
	db.Last(&row)
	if row.DeltaCredits != 5000 {
		t.Fatalf("want delta_credits=5000, got %d", row.DeltaCredits)
	}
	if row.DeltaCents == nil || *row.DeltaCents != 5000 {
		t.Fatalf("want delta_cents=5000, got %v", row.DeltaCents)
	}
}

func TestReservation_Succeed_BalanceCorrect(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: 10000, Reason: domain.ReasonTopup})

	jobID := "job_1"
	reservedCredits := int64(3000)
	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: -reservedCredits, Reason: domain.ReasonReservation, JobID: &jobID, Note: "reserved"})

	actualCost := int64(2500)
	refundDelta := reservedCredits - actualCost
	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: refundDelta, Reason: domain.ReasonReconciliation, JobID: &jobID, Note: "reconcile"})

	bal, _ := svc.GetBalance(ctx, "org1")
	want := int64(10000 - 2500)
	if bal != want {
		t.Fatalf("balance after succeed: want %d, got %d", want, bal)
	}
}

func TestReservation_Fail_FullRefund(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: 10000, Reason: domain.ReasonTopup})

	jobID := "job_2"
	reserved := int64(3000)
	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: -reserved, Reason: domain.ReasonReservation, JobID: &jobID})
	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: reserved, Reason: domain.ReasonRefund, JobID: &jobID, Note: "provider failed"})

	bal, _ := svc.GetBalance(ctx, "org1")
	if bal != 10000 {
		t.Fatalf("balance after full refund: want 10000, got %d", bal)
	}
}

func TestReservation_ActualExceedsEstimate_NegativeReconciliation(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: 10000, Reason: domain.ReasonTopup})

	jobID := "job_3"
	reserved := int64(2000)
	actualCost := int64(2500)
	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: -reserved, Reason: domain.ReasonReservation, JobID: &jobID})

	// Actual > estimated: reconciliation delta is negative (charge more).
	reconcile := reserved - actualCost // -500
	svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: reconcile, Reason: domain.ReasonReconciliation, JobID: &jobID})

	bal, _ := svc.GetBalance(ctx, "org1")
	want := int64(10000 - 2500)
	if bal != want {
		t.Fatalf("balance after over-estimate: want %d, got %d", want, bal)
	}
}

func TestListLedger_Pagination(t *testing.T) {
	db := setupDB(t)
	svc := NewService(db)
	ctx := context.Background()

	for i := 0; i < 10; i++ {
		svc.AddCredits(ctx, Entry{OrgID: "org1", Delta: 100, Reason: domain.ReasonTopup})
	}

	rows, err := svc.ListLedger(ctx, "org1", 5, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 5 {
		t.Fatalf("want 5 rows, got %d", len(rows))
	}

	rows2, _ := svc.ListLedger(ctx, "org1", 5, 5)
	if len(rows2) != 5 {
		t.Fatalf("want 5 rows page 2, got %d", len(rows2))
	}
}
