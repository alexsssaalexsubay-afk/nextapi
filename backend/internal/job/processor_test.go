package job

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alicebob/miniredis/v2"
	"github.com/hibiken/asynq"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// ---------------------------------------------------------------------------
// Controllable provider mock for deterministic processor tests.
// Unlike seedance.MockProvider (10-second delay), this responds instantly.
// ---------------------------------------------------------------------------

type controlledProvider struct {
	// generateResult is returned by GenerateVideo.
	generateResult string
	generateError  error

	// statusResult is returned by GetJobStatus.
	statusResult *provider.JobStatus
}

func (c *controlledProvider) Name() string { return "mock-controlled" }

func (c *controlledProvider) EstimateCost(req provider.GenerationRequest) (int64, int64, error) {
	tokens := int64(req.DurationSeconds * 100)
	return tokens, tokens, nil
}

func (c *controlledProvider) GenerateVideo(_ context.Context, _ provider.GenerationRequest) (string, error) {
	if c.generateError != nil {
		return "", c.generateError
	}
	id := c.generateResult
	if id == "" {
		id = "prov_job_instant"
	}
	return id, nil
}

func (c *controlledProvider) GetJobStatus(_ context.Context, _ string) (*provider.JobStatus, error) {
	if c.statusResult != nil {
		return c.statusResult, nil
	}
	url := "https://mock.nextapi.top/result.mp4"
	tokens := int64(500)
	return &provider.JobStatus{Status: "succeeded", VideoURL: &url, ActualTokensUsed: &tokens}, nil
}

func (c *controlledProvider) IsHealthy(_ context.Context) bool { return true }

// ---------------------------------------------------------------------------
// Test DB + helpers
// ---------------------------------------------------------------------------

func setupProcessorDB(t *testing.T) *gorm.DB {
	t.Helper()
	dir := t.TempDir()
	dsn := fmt.Sprintf("file:%s/proc.db?cache=shared", dir)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE IF NOT EXISTS orgs (id TEXT PRIMARY KEY, name TEXT, owner_user_id TEXT, created_at DATETIME)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS jobs (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL, api_key_id TEXT, batch_run_id TEXT,
		provider TEXT NOT NULL DEFAULT 'mock', provider_job_id TEXT,
		request TEXT NOT NULL DEFAULT '{}',
		status TEXT NOT NULL DEFAULT 'queued', video_url TEXT, tokens_used BIGINT,
		cost_credits BIGINT, reserved_credits BIGINT NOT NULL DEFAULT 0,
		upstream_estimate_cents BIGINT, upstream_actual_cents BIGINT,
		margin_cents BIGINT, pricing_markup_bps INT, pricing_source TEXT,
		error_code TEXT, error_message TEXT, retry_count INT DEFAULT 0,
		last_error_code TEXT, last_error_msg TEXT, exec_metadata TEXT,
		submitting_at DATETIME, running_at DATETIME, retrying_at DATETIME,
		timed_out_at DATETIME, canceled_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS credits_ledger (
		id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL,
		delta_credits BIGINT NOT NULL, delta_cents BIGINT, reason TEXT NOT NULL, job_id TEXT,
		note TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS dead_letter_jobs (
		id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL UNIQUE,
		org_id TEXT NOT NULL, reason TEXT NOT NULL, retry_count INT NOT NULL DEFAULT 0,
		last_error TEXT, archived_at DATETIME, replayed_at DATETIME, replayed_by TEXT)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS batch_runs (
		id TEXT PRIMARY KEY, org_id TEXT NOT NULL, api_key_id TEXT, name TEXT,
		status TEXT NOT NULL DEFAULT 'running', total_shots INT NOT NULL DEFAULT 0,
		queued_count INT NOT NULL DEFAULT 0, running_count INT NOT NULL DEFAULT 0,
		succeeded_count INT NOT NULL DEFAULT 0, failed_count INT NOT NULL DEFAULT 0,
		manifest TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS videos (
		id TEXT PRIMARY KEY, org_id TEXT, upstream_job_id TEXT, status TEXT,
		output TEXT, actual_cost_cents BIGINT, upstream_tokens BIGINT,
		upstream_estimate_cents BIGINT, upstream_actual_cents BIGINT,
		margin_cents BIGINT, pricing_markup_bps INT, pricing_source TEXT,
		video_seconds REAL, error_code TEXT, error_message TEXT, started_at DATETIME, finished_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS workflow_runs (
		id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, org_id TEXT NOT NULL,
		job_id TEXT, batch_run_id TEXT, video_id TEXT, status TEXT NOT NULL DEFAULT 'queued',
		input_snapshot BLOB NOT NULL DEFAULT '{}', output_snapshot BLOB,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME)`)
	return db
}

func newProcessorWithRedis(t *testing.T, db *gorm.DB, prov provider.Provider) (*Processor, *asynq.Client) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := asynq.NewClient(asynq.RedisClientOpt{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })

	bill := billing.NewService(db)
	proc := &Processor{
		DB:          db,
		Billing:     bill,
		Prov:        prov,
		Queue:       client,
		RetryPolicy: DefaultRetryPolicy,
	}
	return proc, client
}

func insertQueuedJob(t *testing.T, db *gorm.DB, orgID string, reserved int64) string {
	t.Helper()
	req, _ := json.Marshal(provider.GenerationRequest{
		Prompt: "test", DurationSeconds: 5, Resolution: "480p", Mode: "fast",
	})
	id := fmt.Sprintf("job_%d", time.Now().UnixNano())
	// Store request as []byte (BLOB) so GORM can scan it back into json.RawMessage.
	if err := db.Exec(
		`INSERT INTO jobs (id, org_id, status, reserved_credits, request, provider) VALUES (?, ?, 'queued', ?, ?, 'mock')`,
		id, orgID, reserved, req,
	).Error; err != nil {
		t.Fatal(err)
	}
	db.Create(&domain.CreditsLedger{
		OrgID:        orgID,
		DeltaCredits: reserved,
		Reason:       domain.ReasonTopup,
	})
	return id
}

func insertQueuedBatchJob(t *testing.T, db *gorm.DB, orgID, batchRunID string, reserved int64) string {
	t.Helper()
	req, _ := json.Marshal(provider.GenerationRequest{
		Prompt: "batch shot", DurationSeconds: 5, Resolution: "480p", Mode: "fast",
	})
	id := fmt.Sprintf("job_%d", time.Now().UnixNano())
	if err := db.Exec(
		`INSERT INTO jobs (id, org_id, batch_run_id, status, reserved_credits, request, provider) VALUES (?, ?, ?, 'queued', ?, ?, 'mock')`,
		id, orgID, batchRunID, reserved, req,
	).Error; err != nil {
		t.Fatal(err)
	}
	return id
}

func makeGenerateTask(jobID string) *asynq.Task {
	buf, _ := json.Marshal(map[string]string{"job_id": jobID})
	return asynq.NewTask(TaskGenerate, buf)
}

func makePollTask(jobID string) *asynq.Task {
	buf, _ := json.Marshal(map[string]string{"job_id": jobID})
	return asynq.NewTask(TaskPoll, buf)
}

// ---------------------------------------------------------------------------
// HandleGenerate — happy path
// ---------------------------------------------------------------------------

func TestHandleGenerate_ProviderSucceeds_JobIsRunning(t *testing.T) {
	db := setupProcessorDB(t)
	prov := &controlledProvider{generateResult: "prov_123"}
	proc, _ := newProcessorWithRedis(t, db, prov)

	jobID := insertQueuedJob(t, db, "org1", 5_000)

	if err := proc.HandleGenerate(context.Background(), makeGenerateTask(jobID)); err != nil {
		t.Fatalf("HandleGenerate failed: %v", err)
	}

	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobRunning {
		t.Fatalf("expected running, got %s", j.Status)
	}
	if j.ProviderJobID == nil || *j.ProviderJobID != "prov_123" {
		t.Fatalf("expected provider_job_id=prov_123, got %v", j.ProviderJobID)
	}
}

// ---------------------------------------------------------------------------
// HandleGenerate — retryable error
// ---------------------------------------------------------------------------

// TestHandleGenerate_RetryableError_ErrorCodeRecorded verifies that when the
// provider returns a retryable error (network error), the job's last_error_code
// is set to the classified code. The exact final status depends on the asynq
// retry context:
//   - With maxRetry=0 (test context default): job is failed immediately.
//   - With maxRetry>0 (real asynq worker): job is moved to retrying.
//
// We test the error-code recording path which is always exercised.
func TestHandleGenerate_RetryableError_ErrorCodeRecorded(t *testing.T) {
	db := setupProcessorDB(t)
	prov := &controlledProvider{generateError: errors.New("connection refused")}
	proc, _ := newProcessorWithRedis(t, db, prov)

	jobID := insertQueuedJob(t, db, "org2", 3_000)

	// In test context, maxRetry=0 so isLastAttempt=true; processor fails job
	// immediately but always sets last_error_code before deciding final fate.
	_ = proc.HandleGenerate(context.Background(), makeGenerateTask(jobID))

	var j domain.Job
	if err := db.First(&j, "id = ?", jobID).Error; err != nil {
		t.Fatalf("job not found: %v", err)
	}
	// last_error_code must always be set regardless of final status.
	if j.LastErrorCode == nil || *j.LastErrorCode != "network_error" {
		t.Fatalf("want last_error_code=network_error, got %v", j.LastErrorCode)
	}
	// In test context (maxRetry=0), job should reach a terminal state.
	if !j.Status.IsTerminal() {
		t.Fatalf("job should reach terminal state in test context, got %s", j.Status)
	}
}

// TestHandleGenerate_RetryableError_CreditsRefundedOnExhaustion verifies that
// when a retryable error exhausts all attempts (maxRetry=0 in test context),
// the credits reservation is fully refunded.
func TestHandleGenerate_RetryableError_CreditsRefundedOnExhaustion(t *testing.T) {
	db := setupProcessorDB(t)
	prov := &controlledProvider{generateError: errors.New("503 service unavailable")}
	proc, _ := newProcessorWithRedis(t, db, prov)

	const orgID = "org2b"
	const reserved = int64(2_500)
	jobID := insertQueuedJob(t, db, orgID, reserved)
	bill := billing.NewService(db)
	balBefore, _ := bill.GetBalance(context.Background(), orgID)

	_ = proc.HandleGenerate(context.Background(), makeGenerateTask(jobID))

	balAfter, _ := bill.GetBalance(context.Background(), orgID)
	if balAfter != balBefore+reserved {
		t.Fatalf("credits should be refunded on exhaustion: before=%d want=%d got=%d",
			balBefore, balBefore+reserved, balAfter)
	}
}

// ---------------------------------------------------------------------------
// HandleGenerate — non-retryable error (400)
// ---------------------------------------------------------------------------

func TestHandleGenerate_NonRetryableError_JobFailed_CreditsRefunded(t *testing.T) {
	db := setupProcessorDB(t)
	prov := &controlledProvider{generateError: errors.New("400 bad request: invalid prompt")}
	proc, _ := newProcessorWithRedis(t, db, prov)

	const orgID = "org3"
	const reserved = int64(4_000)
	jobID := insertQueuedJob(t, db, orgID, reserved)
	bill := billing.NewService(db)
	balBefore, _ := bill.GetBalance(context.Background(), orgID)

	err := proc.HandleGenerate(context.Background(), makeGenerateTask(jobID))
	// Fail() returns nil; the error is captured, job is marked failed.
	if err != nil {
		t.Fatalf("non-retryable failure should not propagate asynq retry: %v", err)
	}

	var j domain.Job
	db.First(&j, "id = ?", jobID)
	if j.Status != domain.JobFailed {
		t.Fatalf("expected failed, got %s", j.Status)
	}
	if j.ErrorCode == nil || *j.ErrorCode != "invalid_request" {
		t.Fatalf("want error_code=invalid_request, got %v", j.ErrorCode)
	}

	// Credits should be fully refunded.
	balAfter, _ := bill.GetBalance(context.Background(), orgID)
	if balAfter != balBefore+reserved {
		t.Fatalf("credits should be refunded: before=%d want=%d got=%d",
			balBefore, balBefore+reserved, balAfter)
	}
}

// ---------------------------------------------------------------------------
// HandleGenerate — already terminal (idempotency guard)
// ---------------------------------------------------------------------------

func TestHandleGenerate_AlreadySucceeded_IsNoop(t *testing.T) {
	db := setupProcessorDB(t)
	prov := &controlledProvider{generateError: errors.New("should not be called")}
	proc, _ := newProcessorWithRedis(t, db, prov)

	// Insert an already-succeeded job (request stored as []byte for BLOB compatibility).
	req, _ := json.Marshal(provider.GenerationRequest{
		Prompt: "test", DurationSeconds: 5, Resolution: "480p", Mode: "fast",
	})
	db.Exec(`INSERT INTO jobs (id, org_id, status, reserved_credits, request, provider)
		VALUES ('job_done', 'org4', 'succeeded', 0, ?, 'mock')`, req)

	if err := proc.HandleGenerate(context.Background(), makeGenerateTask("job_done")); err != nil {
		t.Fatalf("should return nil for already-terminal job: %v", err)
	}
	// Status must remain succeeded.
	var j domain.Job
	db.First(&j, "id = ?", "job_done")
	if j.Status != domain.JobSucceeded {
		t.Fatalf("status changed on terminal job: %s", j.Status)
	}
}

// ---------------------------------------------------------------------------
// HandlePoll — job succeeded path
// ---------------------------------------------------------------------------

func TestHandlePoll_ProviderSucceeded_CreditsReconciled(t *testing.T) {
	db := setupProcessorDB(t)

	url := "https://mock.nextapi.top/result.mp4"
	// Upstream actually used 300 tokens. With the standard text-to-video price
	// of $0.0070/1k tokens that's $0.0021 → 1 USD cent (rounded up).
	actualTokens := int64(300)
	prov := &controlledProvider{
		statusResult: &provider.JobStatus{
			Status:           "succeeded",
			VideoURL:         &url,
			ActualTokensUsed: &actualTokens,
		},
	}
	proc, _ := newProcessorWithRedis(t, db, prov)

	const orgID = "org5"
	const reserved = int64(1_000)

	db.Create(&domain.CreditsLedger{OrgID: orgID, DeltaCredits: 10_000, Reason: domain.ReasonTopup})
	// The reservation half of the lifecycle: deduct `reserved` up-front, then
	// the worker's succeed path is expected to refund (reserved - actual).
	db.Create(&domain.CreditsLedger{
		OrgID: orgID, DeltaCredits: -reserved, Reason: domain.ReasonReservation,
		JobID: ptr("job_poll_ok"),
	})

	provID := "prov_poll_test"
	db.Exec(`INSERT INTO jobs (id, org_id, status, reserved_credits, request, provider, provider_job_id)
		VALUES ('job_poll_ok', ?, 'running', ?, ?, 'mock', ?)`,
		orgID, reserved, []byte("{}"), provID)
	db.Exec(`INSERT INTO workflow_runs (id, workflow_id, org_id, job_id, status, input_snapshot)
		VALUES ('wr_poll_ok', 'wf_poll_ok', ?, 'job_poll_ok', 'running', ?)`, orgID, []byte("{}"))

	bill := billing.NewService(db)
	balBefore, _ := bill.GetBalance(context.Background(), orgID)

	if err := proc.HandlePoll(context.Background(), makePollTask("job_poll_ok")); err != nil {
		t.Fatalf("HandlePoll failed: %v", err)
	}

	var j domain.Job
	db.First(&j, "id = ?", "job_poll_ok")
	if j.Status != domain.JobSucceeded {
		t.Fatalf("expected succeeded, got %s", j.Status)
	}
	if j.VideoURL == nil || *j.VideoURL != url {
		t.Fatalf("video_url mismatch: %v", j.VideoURL)
	}

	// 300 upstream tokens → 1 USD cent at the normal-text price. The 999
	// cents of unused reservation must come back to the customer as a refund
	// so their net spend equals the upstream invoice.
	const expectedBilled = int64(1)
	const expectedRefund = reserved - expectedBilled
	balAfter, _ := bill.GetBalance(context.Background(), orgID)
	if balAfter != balBefore+expectedRefund {
		t.Fatalf("credits reconciliation wrong: before=%d want=%d got=%d",
			balBefore, balBefore+expectedRefund, balAfter)
	}
	if j.CostCredits == nil || *j.CostCredits != expectedBilled {
		t.Fatalf("cost_credits should equal upstream-derived USD cents: want=%d got=%v",
			expectedBilled, j.CostCredits)
	}
	var run domain.WorkflowRun
	if err := db.First(&run, "id = ?", "wr_poll_ok").Error; err != nil {
		t.Fatalf("workflow run not found: %v", err)
	}
	if run.Status != "succeeded" || len(run.OutputSnapshot) == 0 {
		t.Fatalf("workflow run not updated: %#v", run)
	}
}

// Underestimation case: upstream burned far more tokens than the reservation
// expected. The worker must debit the shortfall (charge the customer extra)
// so we never silently absorb the upstream cost.
func TestHandlePoll_ProviderSucceeded_UnderestimatedReservation(t *testing.T) {
	db := setupProcessorDB(t)

	url := "https://mock.nextapi.top/result.mp4"
	actualTokens := int64(120_545) // ~$0.84 at the normal text price
	prov := &controlledProvider{
		statusResult: &provider.JobStatus{
			Status:           "succeeded",
			VideoURL:         &url,
			ActualTokensUsed: &actualTokens,
		},
	}
	proc, _ := newProcessorWithRedis(t, db, prov)

	const orgID = "org_under"
	const reserved = int64(46) // ceil rounding mirrors the dashboard estimate.

	db.Create(&domain.CreditsLedger{OrgID: orgID, DeltaCredits: 10_000, Reason: domain.ReasonTopup})
	db.Create(&domain.CreditsLedger{
		OrgID: orgID, DeltaCredits: -reserved, Reason: domain.ReasonReservation,
		JobID: ptr("job_underbill"),
	})

	provID := "prov_underbill"
	db.Exec(`INSERT INTO jobs (id, org_id, status, reserved_credits, request, provider, provider_job_id)
		VALUES ('job_underbill', ?, 'running', ?, ?, 'mock', ?)`,
		orgID, reserved, []byte("{}"), provID)

	bill := billing.NewService(db)
	balBefore, _ := bill.GetBalance(context.Background(), orgID)

	if err := proc.HandlePoll(context.Background(), makePollTask("job_underbill")); err != nil {
		t.Fatalf("HandlePoll failed: %v", err)
	}

	var j domain.Job
	db.First(&j, "id = ?", "job_underbill")
	const expectedBilled = int64(85) // ceil(120545/1000 * 0.0070 * 100)
	const expectedDebit = expectedBilled - reserved
	if j.CostCredits == nil || *j.CostCredits != expectedBilled {
		t.Fatalf("cost_credits must follow upstream tokens: want=%d got=%v",
			expectedBilled, j.CostCredits)
	}
	balAfter, _ := bill.GetBalance(context.Background(), orgID)
	if balAfter != balBefore-expectedDebit {
		t.Fatalf("expected -%d cents debit on shortfall: before=%d after=%d",
			expectedDebit, balBefore, balAfter)
	}
}

func TestBatchWorkflowRunClosesAfterAllJobsSucceed(t *testing.T) {
	db := setupProcessorDB(t)
	prov := &controlledProvider{}
	proc, _ := newProcessorWithRedis(t, db, prov)

	const orgID = "org_batch"
	const batchID = "batch_all_success"
	if err := db.Exec(`INSERT INTO batch_runs (id, org_id, status, total_shots, queued_count, running_count, succeeded_count, failed_count)
		VALUES (?, ?, 'running', 2, 2, 0, 0, 0)`, batchID, orgID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO workflow_runs (id, workflow_id, org_id, batch_run_id, status, input_snapshot)
		VALUES ('wr_batch_ok', 'wf_batch_ok', ?, ?, 'running', ?)`, orgID, batchID, []byte("{}")).Error; err != nil {
		t.Fatal(err)
	}
	jobOne := insertQueuedBatchJob(t, db, orgID, batchID, 1_000)
	time.Sleep(time.Nanosecond)
	jobTwo := insertQueuedBatchJob(t, db, orgID, batchID, 1_000)

	if err := proc.HandleGenerate(context.Background(), makeGenerateTask(jobOne)); err != nil {
		t.Fatalf("HandleGenerate job one: %v", err)
	}
	var br domain.BatchRun
	if err := db.First(&br, "id = ?", batchID).Error; err != nil {
		t.Fatal(err)
	}
	if br.QueuedCount != 1 || br.RunningCount != 1 {
		t.Fatalf("after first start counts = queued:%d running:%d; want 1/1", br.QueuedCount, br.RunningCount)
	}
	if err := proc.HandlePoll(context.Background(), makePollTask(jobOne)); err != nil {
		t.Fatalf("HandlePoll job one: %v", err)
	}
	if err := db.First(&br, "id = ?", batchID).Error; err != nil {
		t.Fatal(err)
	}
	if br.Status != "running" || br.QueuedCount != 1 || br.RunningCount != 0 || br.SucceededCount != 1 {
		t.Fatalf("after first success batch = %#v; want running queued=1 running=0 succeeded=1", br)
	}
	var run domain.WorkflowRun
	if err := db.First(&run, "id = ?", "wr_batch_ok").Error; err != nil {
		t.Fatal(err)
	}
	if run.Status != "running" {
		t.Fatalf("workflow run closed too early: %s", run.Status)
	}

	if err := proc.HandleGenerate(context.Background(), makeGenerateTask(jobTwo)); err != nil {
		t.Fatalf("HandleGenerate job two: %v", err)
	}
	if err := proc.HandlePoll(context.Background(), makePollTask(jobTwo)); err != nil {
		t.Fatalf("HandlePoll job two: %v", err)
	}
	if err := db.First(&br, "id = ?", batchID).Error; err != nil {
		t.Fatal(err)
	}
	if br.Status != "completed" || br.QueuedCount != 0 || br.RunningCount != 0 || br.SucceededCount != 2 {
		t.Fatalf("closed batch = %#v; want completed queued=0 running=0 succeeded=2", br)
	}
	if err := db.First(&run, "id = ?", "wr_batch_ok").Error; err != nil {
		t.Fatal(err)
	}
	if run.Status != "succeeded" || len(run.OutputSnapshot) == 0 {
		t.Fatalf("workflow run not closed with batch: %#v", run)
	}
}

func ptr[T any](v T) *T { return &v }

// ---------------------------------------------------------------------------
// HandlePoll — provider failed → refund
// ---------------------------------------------------------------------------

func TestHandlePoll_ProviderFailed_CreditsRefunded(t *testing.T) {
	db := setupProcessorDB(t)

	code := "content_blocked"
	msg := "content policy violation"
	prov := &controlledProvider{
		statusResult: &provider.JobStatus{
			Status:       "failed",
			ErrorCode:    &code,
			ErrorMessage: &msg,
		},
	}
	proc, _ := newProcessorWithRedis(t, db, prov)

	const orgID = "org6"
	const reserved = int64(2_000)

	db.Create(&domain.CreditsLedger{OrgID: orgID, DeltaCredits: reserved, Reason: domain.ReasonTopup})
	db.Exec(`INSERT INTO jobs (id, org_id, status, reserved_credits, request, provider, provider_job_id)
		VALUES ('job_poll_fail', ?, 'running', ?, ?, 'mock', 'prov_fail')`,
		orgID, reserved, []byte("{}"))

	bill := billing.NewService(db)
	balBefore, _ := bill.GetBalance(context.Background(), orgID)

	if err := proc.HandlePoll(context.Background(), makePollTask("job_poll_fail")); err != nil {
		t.Fatalf("HandlePoll failed: %v", err)
	}

	var j domain.Job
	db.First(&j, "id = ?", "job_poll_fail")
	if j.Status != domain.JobFailed {
		t.Fatalf("expected failed, got %s", j.Status)
	}

	// Full refund expected.
	balAfter, _ := bill.GetBalance(context.Background(), orgID)
	if balAfter != balBefore+reserved {
		t.Fatalf("full refund expected: before=%d want=%d got=%d",
			balBefore, balBefore+reserved, balAfter)
	}
}

// ---------------------------------------------------------------------------
// fail() idempotency: calling twice should not double-refund
// ---------------------------------------------------------------------------

func TestFail_CalledTwice_NoDoubleRefund(t *testing.T) {
	db := setupProcessorDB(t)
	prov := &controlledProvider{}
	proc, _ := newProcessorWithRedis(t, db, prov)

	const orgID = "org7"
	const reserved = int64(1_500)

	db.Create(&domain.CreditsLedger{OrgID: orgID, DeltaCredits: 10_000, Reason: domain.ReasonTopup})
	jobID := insertQueuedJob(t, db, orgID, reserved)
	// Deduct reservation.
	db.Create(&domain.CreditsLedger{OrgID: orgID, DeltaCredits: -reserved, Reason: domain.ReasonReservation,
		JobID: &jobID})

	var j domain.Job
	db.First(&j, "id = ?", jobID)

	bill := billing.NewService(db)
	balBefore, _ := bill.GetBalance(context.Background(), orgID)

	// Call fail twice.
	_ = proc.fail(context.Background(), &j, "test_code", "test message")
	_ = proc.fail(context.Background(), &j, "test_code", "test message")

	balAfter, _ := bill.GetBalance(context.Background(), orgID)
	if balAfter != balBefore+reserved {
		t.Fatalf("double-refund detected: before=%d want=%d got=%d",
			balBefore, balBefore+reserved, balAfter)
	}
}
