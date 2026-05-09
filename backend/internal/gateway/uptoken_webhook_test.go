package gateway

import (
	"context"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestUpTokenWebhookApplyFailedIsIdempotent(t *testing.T) {
	db := setupUpTokenWebhookDB(t)
	providerID := "ut-task-failed"
	jobID := "11111111-1111-1111-1111-111111111111"
	orgID := "22222222-2222-2222-2222-222222222222"
	directorJobID := "77777777-7777-7777-7777-777777777777"
	if err := db.Create(&domain.Job{
		ID:              jobID,
		OrgID:           orgID,
		Provider:        "seedance-relay",
		ProviderJobID:   &providerID,
		Request:         []byte(`{"Prompt":"x","DurationSeconds":5,"Resolution":"1080p"}`),
		Status:          domain.JobRunning,
		ReservedCredits: 123,
	}).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	if err := db.Create(&domain.Video{
		ID:                 "33333333-3333-3333-3333-333333333333",
		OrgID:              orgID,
		Model:              "seedance-2.0-pro",
		Status:             "running",
		Input:              []byte(`{}`),
		Metadata:           []byte(`{}`),
		UpstreamJobID:      &jobID,
		EstimatedCostCents: 123,
		ReservedCents:      123,
	}).Error; err != nil {
		t.Fatalf("create video: %v", err)
	}
	insertDirectorRunAudit(t, db, orgID, directorJobID, jobID, 123)
	h := &UpTokenWebhookHandlers{DB: db}
	ev := uptokenWebhookPayload{
		TaskID: "ut-task-failed",
		Status: "failed",
		Error: &struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Type    string `json:"type"`
		}{Code: "error-301", Message: "moderation blocked", Type: "content_policy"},
	}
	for i := 0; i < 2; i++ {
		if _, err := h.apply(context.Background(), ev); err != nil {
			t.Fatalf("apply %d: %v", i, err)
		}
	}
	var ledgers []domain.CreditsLedger
	if err := db.Find(&ledgers).Error; err != nil {
		t.Fatalf("list ledger: %v", err)
	}
	if len(ledgers) != 1 {
		t.Fatalf("expected one refund ledger row, got %d", len(ledgers))
	}
	if ledgers[0].DeltaCredits != 123 || ledgers[0].Reason != domain.ReasonRefund {
		t.Fatalf("unexpected refund: %#v", ledgers[0])
	}
	var job domain.Job
	if err := db.First(&job, "id = ?", jobID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if job.Status != domain.JobFailed || job.ErrorCode == nil || *job.ErrorCode != "error-301" {
		t.Fatalf("unexpected job state: %#v", job)
	}
	var meter domain.DirectorMetering
	if err := db.First(&meter, "job_id = ?", jobID).Error; err != nil {
		t.Fatalf("reload director metering: %v", err)
	}
	if meter.Status != "refunded" || meter.ActualCents != 0 || meter.CreditsDelta != 0 {
		t.Fatalf("unexpected director metering: %#v", meter)
	}
	var directorJob domain.DirectorJob
	if err := db.First(&directorJob, "id = ?", directorJobID).Error; err != nil {
		t.Fatalf("reload director job: %v", err)
	}
	if directorJob.Status != "failed" {
		t.Fatalf("director job should fail, got %s", directorJob.Status)
	}
	var step domain.DirectorStep
	if err := db.First(&step, "director_job_id = ? AND job_id = ? AND step_key = ?", directorJobID, jobID, "video_complete").Error; err != nil {
		t.Fatalf("reload director completion step: %v", err)
	}
	if step.Status != "failed" || step.ErrorCode != "error-301" {
		t.Fatalf("unexpected director completion step: %#v", step)
	}
}

func TestUpTokenWebhookApplySucceededStoresVideoURL(t *testing.T) {
	db := setupUpTokenWebhookDB(t)
	providerID := "ut-task-ok"
	jobID := "44444444-4444-4444-4444-444444444444"
	orgID := "55555555-5555-5555-5555-555555555555"
	directorJobID := "88888888-8888-8888-8888-888888888888"
	if err := db.Create(&domain.Job{
		ID:              jobID,
		OrgID:           orgID,
		Provider:        "seedance-relay",
		ProviderJobID:   &providerID,
		Request:         []byte(`{"DurationSeconds":5,"Resolution":"1080p","Mode":"normal"}`),
		Status:          domain.JobRunning,
		ReservedCredits: 200,
	}).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	if err := db.Create(&domain.Video{
		ID:                 "66666666-6666-6666-6666-666666666666",
		OrgID:              orgID,
		Model:              "seedance-2.0-pro",
		Status:             "running",
		Input:              []byte(`{}`),
		Metadata:           []byte(`{}`),
		UpstreamJobID:      &jobID,
		EstimatedCostCents: 200,
		ReservedCents:      200,
	}).Error; err != nil {
		t.Fatalf("create video: %v", err)
	}
	insertDirectorRunAudit(t, db, orgID, directorJobID, jobID, 200)
	h := &UpTokenWebhookHandlers{DB: db}
	tokens := int64(1000)
	processed, err := h.apply(context.Background(), uptokenWebhookPayload{
		TaskID:   providerID,
		Status:   "succeeded",
		VideoURL: "https://cdn.example.com/out.mp4",
		Usage: &struct {
			TotalTokens int64 `json:"total_tokens"`
		}{TotalTokens: tokens},
	})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !processed {
		t.Fatal("expected webhook to process")
	}
	var job domain.Job
	if err := db.First(&job, "id = ?", jobID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if job.Status != domain.JobSucceeded || job.VideoURL == nil || *job.VideoURL != "https://cdn.example.com/out.mp4" {
		t.Fatalf("unexpected job state: %#v", job)
	}
	if job.TokensUsed == nil || *job.TokensUsed != tokens {
		t.Fatalf("tokens not stored: %#v", job.TokensUsed)
	}
	if job.CostCredits == nil {
		t.Fatalf("cost credits not stored")
	}
	var meter domain.DirectorMetering
	if err := db.First(&meter, "job_id = ?", jobID).Error; err != nil {
		t.Fatalf("reload director metering: %v", err)
	}
	if meter.Status != "billed" || meter.ActualCents != *job.CostCredits || meter.CreditsDelta != -*job.CostCredits {
		t.Fatalf("unexpected director metering: %#v", meter)
	}
	var directorJob domain.DirectorJob
	if err := db.First(&directorJob, "id = ?", directorJobID).Error; err != nil {
		t.Fatalf("reload director job: %v", err)
	}
	if directorJob.Status != "video_complete" {
		t.Fatalf("director job should complete video, got %s", directorJob.Status)
	}
	var step domain.DirectorStep
	if err := db.First(&step, "director_job_id = ? AND job_id = ? AND step_key = ?", directorJobID, jobID, "video_complete").Error; err != nil {
		t.Fatalf("reload director completion step: %v", err)
	}
	if step.Status != "succeeded" || step.ErrorCode != "" {
		t.Fatalf("unexpected director completion step: %#v", step)
	}
}

func TestUpTokenWebhookApplySucceededUsesBillableQuantityFallback(t *testing.T) {
	db := setupUpTokenWebhookDB(t)
	providerID := "ut-task-billable"
	jobID := "99999999-9999-9999-9999-999999999999"
	orgID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	const reserved = int64(59)
	if err := db.Create(&domain.Job{
		ID:              jobID,
		OrgID:           orgID,
		Provider:        "seedance-relay",
		ProviderJobID:   &providerID,
		Request:         []byte(`{"DurationSeconds":5,"Resolution":"480p","Mode":"normal","ImageURLs":["asset://ut-asset-example"],"GenerateAudio":true}`),
		Status:          domain.JobRunning,
		ReservedCredits: reserved,
	}).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	if err := db.Create(&domain.Video{
		ID:                 "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		OrgID:              orgID,
		Model:              "seedance-2.0-pro",
		Status:             "running",
		Input:              []byte(`{}`),
		Metadata:           []byte(`{}`),
		UpstreamJobID:      &jobID,
		EstimatedCostCents: reserved,
		ReservedCents:      reserved,
	}).Error; err != nil {
		t.Fatalf("create video: %v", err)
	}
	if err := db.Create(&domain.CreditsLedger{
		OrgID: orgID, DeltaCredits: 1_000, Reason: domain.ReasonTopup,
	}).Error; err != nil {
		t.Fatalf("create topup ledger: %v", err)
	}
	if err := db.Create(&domain.CreditsLedger{
		OrgID: orgID, DeltaCredits: -reserved, Reason: domain.ReasonReservation,
		JobID: &jobID,
	}).Error; err != nil {
		t.Fatalf("create reservation ledger: %v", err)
	}

	h := &UpTokenWebhookHandlers{DB: db}
	billableTokens := int64(54_737)
	unit := "per_token"
	processed, err := h.apply(context.Background(), uptokenWebhookPayload{
		TaskID:           providerID,
		Status:           "succeeded",
		VideoURL:         "https://cdn.example.com/audio-visual.mp4",
		BillableQuantity: &billableTokens,
		BillableUnit:     &unit,
	})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !processed {
		t.Fatal("expected webhook to process")
	}

	var job domain.Job
	if err := db.First(&job, "id = ?", jobID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	const expectedBilled = int64(40) // ceil(54737/1000 * 0.00714 * 100)
	if job.TokensUsed == nil || *job.TokensUsed != billableTokens {
		t.Fatalf("tokens_used should follow billable_quantity: got=%v", job.TokensUsed)
	}
	if job.CostCredits == nil || *job.CostCredits != expectedBilled {
		t.Fatalf("cost_credits should follow billable_quantity: want=%d got=%v",
			expectedBilled, job.CostCredits)
	}
	var balance int64
	if err := db.Raw(`SELECT COALESCE(SUM(delta_credits), 0) FROM credits_ledger WHERE org_id = ?`, orgID).
		Row().Scan(&balance); err != nil {
		t.Fatalf("sum ledger: %v", err)
	}
	if balance != 1_000-expectedBilled {
		t.Fatalf("ledger balance should net to billed cost: got=%d", balance)
	}
	var videoCost, videoTokens int64
	if err := db.Raw(`SELECT actual_cost_cents, upstream_tokens FROM videos WHERE upstream_job_id = ?`, jobID).
		Row().Scan(&videoCost, &videoTokens); err != nil {
		t.Fatalf("reload video: %v", err)
	}
	if videoCost != expectedBilled || videoTokens != billableTokens {
		t.Fatalf("video metering mismatch: cost=%d tokens=%d", videoCost, videoTokens)
	}
}

func insertDirectorRunAudit(t *testing.T, db *gorm.DB, orgID string, directorJobID string, jobID string, reserved int64) {
	t.Helper()
	if err := db.Create(&domain.DirectorJob{
		ID:                   directorJobID,
		OrgID:                orgID,
		Story:                "test story",
		Status:               "running",
		SelectedCharacterIDs: []byte(`[]`),
		BudgetSnapshot:       []byte(`{}`),
		PlanSnapshot:         []byte(`{}`),
	}).Error; err != nil {
		t.Fatalf("create director job: %v", err)
	}
	stepID := directorJobID[:24] + "999999999999"
	if err := db.Create(&domain.DirectorStep{
		ID:             stepID,
		DirectorJobID:  directorJobID,
		OrgID:          orgID,
		StepKey:        "video_submit",
		Status:         "succeeded",
		JobID:          &jobID,
		InputSnapshot:  []byte(`{}`),
		OutputSnapshot: []byte(`{}`),
	}).Error; err != nil {
		t.Fatalf("create director step: %v", err)
	}
	if err := db.Create(&domain.DirectorMetering{
		OrgID:          orgID,
		DirectorJobID:  &directorJobID,
		StepID:         &stepID,
		JobID:          &jobID,
		MeterType:      string(domain.ReasonVideoGeneration),
		Units:          1,
		EstimatedCents: reserved,
		ActualCents:    reserved,
		CreditsDelta:   -reserved,
		Status:         "reserved",
		UsageJSON:      []byte(`{}`),
	}).Error; err != nil {
		t.Fatalf("create director metering: %v", err)
	}
}

func setupUpTokenWebhookDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	statements := []string{
		`CREATE TABLE jobs (
			id TEXT PRIMARY KEY,
			org_id TEXT NOT NULL,
			api_key_id TEXT,
			batch_run_id TEXT,
			provider TEXT NOT NULL,
			provider_job_id TEXT,
			request BLOB NOT NULL,
			status TEXT NOT NULL,
			video_url TEXT,
			tokens_used BIGINT,
			cost_credits BIGINT,
			reserved_credits BIGINT NOT NULL DEFAULT 0,
			upstream_estimate_cents BIGINT,
			upstream_actual_cents BIGINT,
			margin_cents BIGINT,
			pricing_markup_bps INT,
			pricing_source TEXT,
			error_code TEXT,
			error_message TEXT,
			retry_count INT NOT NULL DEFAULT 0,
			last_error_code TEXT,
			last_error_msg TEXT,
			exec_metadata BLOB,
			created_at DATETIME,
			submitting_at DATETIME,
			running_at DATETIME,
			retrying_at DATETIME,
			timed_out_at DATETIME,
			canceled_at DATETIME,
			completed_at DATETIME
		)`,
		`CREATE TABLE videos (
			id TEXT PRIMARY KEY,
			org_id TEXT NOT NULL,
			api_key_id TEXT,
			model TEXT NOT NULL,
			status TEXT NOT NULL,
			input BLOB NOT NULL,
			output BLOB,
			metadata BLOB NOT NULL,
			upstream_job_id TEXT,
			upstream_tokens BIGINT,
			video_seconds REAL,
			estimated_cost_cents BIGINT NOT NULL,
			actual_cost_cents BIGINT,
			reserved_cents BIGINT NOT NULL,
			upstream_estimate_cents BIGINT,
			upstream_actual_cents BIGINT,
			margin_cents BIGINT,
			pricing_markup_bps INT,
			pricing_source TEXT,
			error_code TEXT,
			error_message TEXT,
			webhook_url TEXT,
			created_at DATETIME,
			started_at DATETIME,
			finished_at DATETIME,
			idempotency_key TEXT,
			request_id TEXT
		)`,
		`CREATE TABLE credits_ledger (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			org_id TEXT NOT NULL,
			delta_credits BIGINT NOT NULL,
			delta_cents BIGINT,
			reason TEXT NOT NULL,
			job_id TEXT,
			note TEXT NOT NULL DEFAULT '',
			created_at DATETIME
		)`,
		`CREATE TABLE director_jobs (
			id TEXT PRIMARY KEY,
			org_id TEXT NOT NULL,
			workflow_id TEXT,
			workflow_run_id TEXT,
			batch_run_id TEXT,
			title TEXT NOT NULL DEFAULT '',
			story TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'draft',
			engine_used TEXT NOT NULL DEFAULT '',
			fallback_used BOOL NOT NULL DEFAULT FALSE,
			selected_character_ids BLOB NOT NULL DEFAULT '[]',
			budget_snapshot BLOB NOT NULL DEFAULT '{}',
			plan_snapshot BLOB NOT NULL DEFAULT '{}',
			created_by TEXT NOT NULL DEFAULT '',
			created_at DATETIME,
			updated_at DATETIME
		)`,
		`CREATE TABLE director_steps (
			id TEXT PRIMARY KEY,
			director_job_id TEXT NOT NULL,
			org_id TEXT NOT NULL,
			step_key TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			provider_id TEXT,
			job_id TEXT,
			input_snapshot BLOB NOT NULL DEFAULT '{}',
			output_snapshot BLOB NOT NULL DEFAULT '{}',
			error_code TEXT NOT NULL DEFAULT '',
			attempts INT NOT NULL DEFAULT 0,
			started_at DATETIME,
			completed_at DATETIME,
			created_at DATETIME,
			updated_at DATETIME
		)`,
		`CREATE TABLE director_metering (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			org_id TEXT NOT NULL,
			director_job_id TEXT,
			step_id TEXT,
			job_id TEXT,
			provider_id TEXT,
			meter_type TEXT NOT NULL,
			units REAL NOT NULL DEFAULT 0,
			estimated_cents BIGINT NOT NULL DEFAULT 0,
			actual_cents BIGINT NOT NULL DEFAULT 0,
			credits_delta BIGINT NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'recorded',
			usage_json BLOB NOT NULL DEFAULT '{}',
			created_at DATETIME
		)`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("create test table: %v", err)
		}
	}
	return db
}
