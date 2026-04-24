package throughput

import (
	"context"
	"fmt"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setup(t *testing.T) (*Service, func()) {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE IF NOT EXISTS throughput_config (
		org_id TEXT PRIMARY KEY, reserved_concurrency INT NOT NULL DEFAULT 2,
		burst_concurrency INT NOT NULL DEFAULT 200, priority_lane TEXT NOT NULL DEFAULT 'standard',
		rpm_limit INT NOT NULL DEFAULT 60, queue_tier TEXT NOT NULL DEFAULT 'default',
		unlimited BOOLEAN NOT NULL DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)

	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	svc := NewService(db, rc)
	return svc, func() { mr.Close() }
}

func TestAcquire_UpToBurst(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	burst := 3
	svc.Upsert(ctx, "org1", UpsertInput{BurstConcurrency: &burst})

	for i := 0; i < 3; i++ {
		if err := svc.Acquire(ctx, "org1", "job_"+string(rune('a'+i))); err != nil {
			t.Fatalf("acquire %d: %v", i, err)
		}
	}

	if err := svc.Acquire(ctx, "org1", "job_d"); err != ErrBurstExceeded {
		t.Fatalf("want ErrBurstExceeded, got %v", err)
	}
}

func TestRelease_FreesSlot(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	burst := 2
	svc.Upsert(ctx, "org1", UpsertInput{BurstConcurrency: &burst})

	svc.Acquire(ctx, "org1", "job_a")
	svc.Acquire(ctx, "org1", "job_b")

	if err := svc.Acquire(ctx, "org1", "job_c"); err != ErrBurstExceeded {
		t.Fatal("should be full")
	}

	svc.Release(ctx, "org1", "job_a")

	if err := svc.Acquire(ctx, "org1", "job_c"); err != nil {
		t.Fatalf("after release, acquire should succeed: %v", err)
	}
}

func TestInFlight(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	n, _ := svc.InFlight(ctx, "org1")
	if n != 0 {
		t.Fatalf("want 0, got %d", n)
	}

	svc.Acquire(ctx, "org1", "j1")
	svc.Acquire(ctx, "org1", "j2")
	n, _ = svc.InFlight(ctx, "org1")
	if n != 2 {
		t.Fatalf("want 2, got %d", n)
	}
}

func TestQueueForOrg(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	q := svc.QueueForOrg(ctx, "org1")
	if q != "default" {
		t.Fatalf("default org should use 'default' queue, got %s", q)
	}

	lane := "dedicated"
	svc.Upsert(ctx, "org1", UpsertInput{PriorityLane: &lane})
	q = svc.QueueForOrg(ctx, "org1")
	if q != "dedicated" {
		t.Fatalf("want dedicated, got %s", q)
	}
}

func TestGetDefaults(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	cfg, inFlight, err := svc.Get(ctx, "new_org")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ReservedConcurrency != 2 || cfg.BurstConcurrency != 200 {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if inFlight != 0 {
		t.Fatalf("new org should have 0 in-flight, got %d", inFlight)
	}
}

// Ensure the domain model is importable.
var _ = domain.ThroughputConfig{}

func TestAcquireBatch_AllAccepted(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	ids := make([]string, 10)
	for i := range ids {
		ids[i] = fmt.Sprintf("job-%d", i)
	}
	accepted, err := svc.AcquireBatch(ctx, "org1", ids)
	if err != nil {
		t.Fatal(err)
	}
	if accepted != 10 {
		t.Fatalf("want 10 accepted, got %d", accepted)
	}
	inFlight, _ := svc.InFlight(ctx, "org1")
	if inFlight != 10 {
		t.Fatalf("want 10 in-flight, got %d", inFlight)
	}
}

func TestAcquireBatch_CappedByBurst(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	burst := 5
	svc.Upsert(ctx, "org1", UpsertInput{BurstConcurrency: &burst})

	ids := make([]string, 20)
	for i := range ids {
		ids[i] = fmt.Sprintf("job-%d", i)
	}
	accepted, err := svc.AcquireBatch(ctx, "org1", ids)
	if err != nil {
		t.Fatal(err)
	}
	if accepted != 5 {
		t.Fatalf("want 5 accepted (burst cap), got %d", accepted)
	}
}

func TestAcquireBatch_UnlimitedBypassesBurst(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	burst := 5
	unlimited := true
	svc.Upsert(ctx, "org1", UpsertInput{BurstConcurrency: &burst, Unlimited: &unlimited})

	ids := make([]string, 100)
	for i := range ids {
		ids[i] = fmt.Sprintf("job-%d", i)
	}
	accepted, err := svc.AcquireBatch(ctx, "org1", ids)
	if err != nil {
		t.Fatal(err)
	}
	if accepted != 100 {
		t.Fatalf("unlimited org should accept all 100, got %d", accepted)
	}
}

func TestAcquire_UnlimitedNeverRejects(t *testing.T) {
	svc, cleanup := setup(t)
	defer cleanup()
	ctx := context.Background()

	burst := 2
	unlimited := true
	svc.Upsert(ctx, "org1", UpsertInput{BurstConcurrency: &burst, Unlimited: &unlimited})

	for i := 0; i < 50; i++ {
		if err := svc.Acquire(ctx, "org1", fmt.Sprintf("j%d", i)); err != nil {
			t.Fatalf("unlimited org should never reject, got error at i=%d: %v", i, err)
		}
	}
	inFlight, _ := svc.InFlight(ctx, "org1")
	if inFlight != 50 {
		t.Fatalf("want 50 in-flight, got %d", inFlight)
	}
}
