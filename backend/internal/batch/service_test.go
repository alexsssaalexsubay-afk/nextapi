package batch

import (
	"context"
	"fmt"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/seedance"
	"github.com/hibiken/asynq"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// fakeQueue satisfies job.Queue without touching Redis.
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
	dsn := fmt.Sprintf("file:batch_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE IF NOT EXISTS orgs (id TEXT PRIMARY KEY, name TEXT, owner_user_id TEXT, created_at DATETIME)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS jobs (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL, api_key_id TEXT, batch_run_id TEXT,
		provider TEXT NOT NULL, provider_job_id TEXT, request TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'queued', video_url TEXT, tokens_used BIGINT,
		cost_credits BIGINT, reserved_credits BIGINT NOT NULL DEFAULT 0,
		upstream_estimate_cents BIGINT, upstream_actual_cents BIGINT,
		margin_cents BIGINT, pricing_markup_bps INT, pricing_source TEXT,
		error_code TEXT, error_message TEXT, retry_count INT DEFAULT 0,
		last_error_code TEXT, last_error_msg TEXT, exec_metadata TEXT,
		submitting_at DATETIME, running_at DATETIME, retrying_at DATETIME,
		timed_out_at DATETIME, canceled_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS videos (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL, api_key_id TEXT, model TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'queued', input TEXT NOT NULL,
		output TEXT, metadata TEXT NOT NULL DEFAULT '{}',
		upstream_job_id TEXT, upstream_tokens BIGINT, video_seconds REAL,
		estimated_cost_cents BIGINT NOT NULL, actual_cost_cents BIGINT,
		reserved_cents BIGINT NOT NULL, upstream_estimate_cents BIGINT,
		upstream_actual_cents BIGINT, margin_cents BIGINT,
		pricing_markup_bps INT, pricing_source TEXT, error_code TEXT,
		error_message TEXT, webhook_url TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, started_at DATETIME,
		finished_at DATETIME, idempotency_key TEXT, request_id TEXT)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS credits_ledger (
		id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL,
		delta_credits BIGINT NOT NULL, delta_cents BIGINT, reason TEXT NOT NULL, job_id TEXT,
		note TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS batch_runs (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL, api_key_id TEXT, name TEXT,
		status TEXT NOT NULL DEFAULT 'running',
		total_shots INT NOT NULL DEFAULT 0,
		queued_count INT NOT NULL DEFAULT 0,
		running_count INT NOT NULL DEFAULT 0,
		succeeded_count INT NOT NULL DEFAULT 0,
		failed_count INT NOT NULL DEFAULT 0,
		max_parallel INT,
		template_id TEXT,
		project_id TEXT,
		manifest TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	return db
}

func seedOrg(t *testing.T, db *gorm.DB, orgID string, credits int64) {
	t.Helper()
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES (?, 'o', 'u', CURRENT_TIMESTAMP)`, orgID)
	if credits > 0 {
		db.Create(&domain.CreditsLedger{OrgID: orgID, DeltaCredits: credits, Reason: domain.ReasonTopup})
	}
}

func makeShots(orgID string, n int) []job.CreateInput {
	shots := make([]job.CreateInput, n)
	for i := range shots {
		shots[i] = job.CreateInput{
			OrgID: orgID,
			Request: provider.GenerationRequest{
				Prompt:          fmt.Sprintf("shot %d", i+1),
				DurationSeconds: 5,
				Resolution:      "480p",
				Mode:            "fast",
			},
		}
	}
	return shots
}

// ---------------------------------------------------------------------------
// Happy-path: all shots succeed
// ---------------------------------------------------------------------------

func TestBatchCreate_AllShotsEnqueued(t *testing.T) {
	db := setupDB(t)
	seedOrg(t, db, "org1", 1_000_000)

	q := &fakeQueue{}
	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), q)
	batchSvc := NewService(db, jobSvc)

	result, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID: "org1",
		Shots: makeShots("org1", 5),
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 5 {
		t.Fatalf("want total=5, got %d", result.Total)
	}
	if len(result.JobIDs) != 5 {
		t.Fatalf("want 5 job IDs, got %d", len(result.JobIDs))
	}
	if len(result.VideoIDs) != 5 {
		t.Fatalf("want 5 video IDs, got %d", len(result.VideoIDs))
	}
	if q.enqueued != 5 {
		t.Fatalf("want 5 enqueues, got %d", q.enqueued)
	}

	// BatchRun row must exist and reference correct org.
	var br domain.BatchRun
	if err := db.First(&br, "id = ?", result.BatchRunID).Error; err != nil {
		t.Fatalf("batch_run row not found: %v", err)
	}
	if br.OrgID != "org1" {
		t.Fatalf("batch_run.org_id mismatch: %s", br.OrgID)
	}
	if br.TotalShots != 5 {
		t.Fatalf("want total_shots=5, got %d", br.TotalShots)
	}
	if br.QueuedCount != 0 || br.RunningCount != 5 {
		t.Fatalf("want queued=0 running=5 after initial dispatch, got queued=%d running=%d", br.QueuedCount, br.RunningCount)
	}
}

func TestBatchCreate_RespectsMaxParallelInitialDispatch(t *testing.T) {
	db := setupDB(t)
	seedOrg(t, db, "org1_parallel", 1_000_000)

	q := &fakeQueue{}
	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), q)
	batchSvc := NewService(db, jobSvc)
	maxParallel := 2

	result, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID:       "org1_parallel",
		MaxParallel: &maxParallel,
		Shots:       makeShots("org1_parallel", 5),
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Accepted != 5 || result.Rejected != 0 {
		t.Fatalf("want all 5 shots accepted into reserved queue, got accepted=%d rejected=%d", result.Accepted, result.Rejected)
	}
	if q.enqueued != 2 {
		t.Fatalf("want only max_parallel=2 initial enqueues, got %d", q.enqueued)
	}

	var br domain.BatchRun
	if err := db.First(&br, "id = ?", result.BatchRunID).Error; err != nil {
		t.Fatal(err)
	}
	if br.QueuedCount != 3 || br.RunningCount != 2 {
		t.Fatalf("want queued=3 running=2, got queued=%d running=%d", br.QueuedCount, br.RunningCount)
	}
}

func TestBatchCreate_JobsLinkedToBatchRun(t *testing.T) {
	db := setupDB(t)
	seedOrg(t, db, "org10", 1_000_000)

	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), &fakeQueue{})
	batchSvc := NewService(db, jobSvc)

	result, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID: "org10",
		Shots: makeShots("org10", 3),
	})
	if err != nil {
		t.Fatal(err)
	}

	// Every job must have the correct batch_run_id set.
	var jobs []domain.Job
	db.Where("batch_run_id = ?", result.BatchRunID).Find(&jobs)
	if len(jobs) != 3 {
		t.Fatalf("want 3 jobs linked to batch, got %d", len(jobs))
	}
	var videoCount int64
	db.Table("videos").
		Joins("JOIN jobs ON jobs.id = videos.upstream_job_id").
		Where("jobs.batch_run_id = ?", result.BatchRunID).
		Count(&videoCount)
	if videoCount != 3 {
		t.Fatalf("want 3 videos linked to batch jobs, got %d", videoCount)
	}
}

// ---------------------------------------------------------------------------
// Insufficient credits: partial success
// ---------------------------------------------------------------------------

func TestBatchCreate_InsufficientCredits_PartialBatch(t *testing.T) {
	db := setupDB(t)
	// Only enough credits for ~1 shot (not 5).
	seedOrg(t, db, "org2", 100)

	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), &fakeQueue{})
	batchSvc := NewService(db, jobSvc)

	result, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID: "org2",
		Shots: makeShots("org2", 5),
	})
	if err != nil {
		t.Fatal(err) // batch service should not return an error for partial failures
	}
	if result.Total != 5 {
		t.Fatalf("want total=5 (all attempted), got %d", result.Total)
	}
	// Some shots will have failed; fewer than 5 job IDs returned.
	if len(result.JobIDs) >= 5 {
		t.Fatalf("expected fewer than 5 successful jobs, got %d", len(result.JobIDs))
	}

	// failed_count on batch_run must reflect partial failures.
	var br domain.BatchRun
	db.First(&br, "id = ?", result.BatchRunID)
	if br.FailedCount == 0 {
		t.Fatal("expected failed_count > 0 for partial credit failure")
	}
}

func TestBatchCreate_AllShotsFail_BatchStatusFailed(t *testing.T) {
	db := setupDB(t)
	// No credits — all shots must fail.
	seedOrg(t, db, "org3", 0)

	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), &fakeQueue{})
	batchSvc := NewService(db, jobSvc)

	result, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID: "org3",
		Shots: makeShots("org3", 3),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.JobIDs) != 0 {
		t.Fatalf("expect 0 successful jobs, got %d", len(result.JobIDs))
	}

	var br domain.BatchRun
	db.First(&br, "id = ?", result.BatchRunID)
	if br.Status != "failed" {
		t.Fatalf("batch_run status should be 'failed' when all shots fail, got %s", br.Status)
	}
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

func TestBatchCreate_EmptyShots_ReturnsError(t *testing.T) {
	db := setupDB(t)
	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), &fakeQueue{})
	batchSvc := NewService(db, jobSvc)

	_, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID: "org4",
		Shots: nil,
	})
	if err == nil {
		t.Fatal("expected error for empty shots list")
	}
}

// ---------------------------------------------------------------------------
// Org isolation: batch_run not visible to other orgs
// ---------------------------------------------------------------------------

func TestBatchGet_ScopedByOrg(t *testing.T) {
	db := setupDB(t)
	seedOrg(t, db, "org5", 1_000_000)
	seedOrg(t, db, "org6", 0)

	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), &fakeQueue{})
	batchSvc := NewService(db, jobSvc)

	result, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID: "org5",
		Shots: makeShots("org5", 2),
	})
	if err != nil {
		t.Fatal(err)
	}

	// Owner can read their batch.
	if _, _, err := batchSvc.Get(context.Background(), "org5", result.BatchRunID); err != nil {
		t.Fatalf("owner should be able to read batch: %v", err)
	}
	// Different org must not see it.
	if _, _, err := batchSvc.Get(context.Background(), "org6", result.BatchRunID); err == nil {
		t.Fatal("other org should NOT be able to read batch")
	}
}

// ---------------------------------------------------------------------------
// Status summary aggregation
// ---------------------------------------------------------------------------

func TestBatchGet_StatusSummary_AccurateFromJobRows(t *testing.T) {
	db := setupDB(t)
	seedOrg(t, db, "org7", 1_000_000)

	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), &fakeQueue{})
	batchSvc := NewService(db, jobSvc)

	result, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID: "org7",
		Shots: makeShots("org7", 4),
	})
	if err != nil {
		t.Fatal(err)
	}

	// Manually move 2 jobs to succeeded, 1 to failed, leave 1 queued.
	if len(result.JobIDs) < 4 {
		t.Skip("not enough jobs to test summary")
	}
	db.Exec(`UPDATE jobs SET status='succeeded' WHERE id IN (?, ?)`, result.JobIDs[0], result.JobIDs[1])
	db.Exec(`UPDATE jobs SET status='failed' WHERE id = ?`, result.JobIDs[2])

	_, summary, err := batchSvc.Get(context.Background(), "org7", result.BatchRunID)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Succeeded != 2 {
		t.Fatalf("summary.Succeeded: want 2, got %d", summary.Succeeded)
	}
	if summary.Failed != 1 {
		t.Fatalf("summary.Failed: want 1, got %d", summary.Failed)
	}
	if summary.Queued != 0 {
		t.Fatalf("summary.Queued: want 0, got %d", summary.Queued)
	}
	if summary.Running != 1 {
		t.Fatalf("summary.Running: want 1 (remaining dispatched job), got %d", summary.Running)
	}
	if summary.Total != 4 {
		t.Fatalf("summary.Total: want 4, got %d", summary.Total)
	}
}

// ---------------------------------------------------------------------------
// RetryFailed: only failed jobs are re-enqueued
// ---------------------------------------------------------------------------

func TestBatchRetryFailed_OnlyRequeuedFailedJobs(t *testing.T) {
	db := setupDB(t)
	seedOrg(t, db, "org8", 1_000_000)

	q := &fakeQueue{}
	billSvc := billing.NewService(db)
	jobSvc := job.NewService(db, billSvc, seedance.NewMock(), q)
	batchSvc := NewService(db, jobSvc)

	result, err := batchSvc.Create(context.Background(), CreateInput{
		OrgID: "org8",
		Shots: makeShots("org8", 3),
	})
	if err != nil || len(result.JobIDs) < 3 {
		t.Fatalf("batch create failed or insufficient jobs: %v", err)
	}

	// Mark 1 job as failed, keep 2 as queued.
	db.Exec(`UPDATE jobs SET status='failed', error_code='test_fail' WHERE id = ?`, result.JobIDs[0])
	enqueuedBefore := q.enqueued

	_, err = batchSvc.RetryFailed(context.Background(), "org8", result.BatchRunID)
	if err != nil {
		t.Fatalf("RetryFailed returned error: %v", err)
	}

	// Exactly 1 new enqueue should have occurred.
	newEnqueues := q.enqueued - enqueuedBefore
	if newEnqueues != 1 {
		t.Fatalf("want 1 new enqueue (retry of failed job), got %d", newEnqueues)
	}
}
