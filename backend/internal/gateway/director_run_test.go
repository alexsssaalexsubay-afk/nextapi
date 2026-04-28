package gateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestDirectorListRunsReturnsPagedOrgScopedSummaries(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupDirectorRunDB(t)
	orgID := "10101010-1010-1010-1010-101010101010"
	now := time.Date(2026, 4, 29, 9, 0, 0, 0, time.UTC)
	newestID := "11111111-1111-1111-1111-111111111111"
	middleID := "22222222-2222-2222-2222-222222222222"
	oldestID := "33333333-3333-3333-3333-333333333333"
	otherOrgID := "40404040-4040-4040-4040-404040404040"
	if err := db.Create(&[]domain.DirectorJob{
		{
			ID:                   newestID,
			OrgID:                orgID,
			Title:                "Newest",
			Status:               "running",
			EngineUsed:           "advanced_sidecar",
			SelectedCharacterIDs: json.RawMessage(`[]`),
			BudgetSnapshot:       json.RawMessage(`{"shot_count":2}`),
			PlanSnapshot:         json.RawMessage(`{}`),
			CreatedAt:            now.Add(-10 * time.Minute),
			UpdatedAt:            now,
		},
		{
			ID:                   middleID,
			OrgID:                orgID,
			Title:                "Middle",
			Status:               "workflow_ready",
			EngineUsed:           "advanced_fallback",
			SelectedCharacterIDs: json.RawMessage(`[]`),
			BudgetSnapshot:       json.RawMessage(`{"shot_count":1}`),
			PlanSnapshot:         json.RawMessage(`{}`),
			CreatedAt:            now.Add(-20 * time.Minute),
			UpdatedAt:            now.Add(-1 * time.Minute),
		},
		{
			ID:                   oldestID,
			OrgID:                orgID,
			Title:                "Oldest",
			Status:               "failed",
			EngineUsed:           "nextapi",
			SelectedCharacterIDs: json.RawMessage(`[]`),
			BudgetSnapshot:       json.RawMessage(`{}`),
			PlanSnapshot:         json.RawMessage(`{}`),
			CreatedAt:            now.Add(-30 * time.Minute),
			UpdatedAt:            now.Add(-2 * time.Minute),
		},
		{
			ID:                   otherOrgID,
			OrgID:                "50505050-5050-5050-5050-505050505050",
			Title:                "Other org",
			Status:               "running",
			EngineUsed:           "advanced_sidecar",
			SelectedCharacterIDs: json.RawMessage(`[]`),
			BudgetSnapshot:       json.RawMessage(`{}`),
			PlanSnapshot:         json.RawMessage(`{}`),
			CreatedAt:            now,
			UpdatedAt:            now.Add(time.Minute),
		},
	}).Error; err != nil {
		t.Fatalf("create director jobs: %v", err)
	}
	if err := db.Create(&[]domain.DirectorStep{
		{
			ID:             "66666666-6666-6666-6666-666666666661",
			DirectorJobID:  newestID,
			OrgID:          orgID,
			StepKey:        "storyboard",
			Status:         "succeeded",
			InputSnapshot:  json.RawMessage(`{}`),
			OutputSnapshot: json.RawMessage(`{}`),
		},
		{
			ID:             "66666666-6666-6666-6666-666666666662",
			DirectorJobID:  newestID,
			OrgID:          orgID,
			StepKey:        "video_submit",
			Status:         "running",
			InputSnapshot:  json.RawMessage(`{}`),
			OutputSnapshot: json.RawMessage(`{}`),
		},
		{
			ID:             "66666666-6666-6666-6666-666666666663",
			DirectorJobID:  middleID,
			OrgID:          orgID,
			StepKey:        "storyboard",
			Status:         "succeeded",
			InputSnapshot:  json.RawMessage(`{}`),
			OutputSnapshot: json.RawMessage(`{}`),
		},
	}).Error; err != nil {
		t.Fatalf("create director steps: %v", err)
	}
	if err := db.Create(&[]domain.DirectorMetering{
		{
			OrgID:          orgID,
			DirectorJobID:  &newestID,
			MeterType:      "storyboard",
			Units:          1,
			EstimatedCents: 50,
			ActualCents:    40,
			CreditsDelta:   -50,
			Status:         "recorded",
			UsageJSON:      json.RawMessage(`{}`),
			CreatedAt:      now,
		},
		{
			OrgID:          orgID,
			DirectorJobID:  &newestID,
			MeterType:      "video_generation",
			Units:          1,
			EstimatedCents: 100,
			ActualCents:    80,
			CreditsDelta:   -100,
			Status:         "reserved",
			UsageJSON:      json.RawMessage(`{}`),
			CreatedAt:      now,
		},
	}).Error; err != nil {
		t.Fatalf("create director metering: %v", err)
	}
	h := &DirectorHandlers{DB: db}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/director/runs?limit=2", nil)
	auth.SetOrg(c, &domain.Org{ID: orgID})

	h.ListRuns(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var page directorRunPage
	if err := json.NewDecoder(w.Body).Decode(&page); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(page.Data) != 2 || !page.HasMore || page.NextCursor == nil {
		t.Fatalf("unexpected first page: %#v", page)
	}
	if page.Data[0].DirectorJob.ID != newestID || page.Data[1].DirectorJob.ID != middleID {
		t.Fatalf("unexpected ordering: %#v", page.Data)
	}
	if page.Data[0].StepCount != 2 {
		t.Fatalf("expected newest step count 2, got %d", page.Data[0].StepCount)
	}
	if page.Data[0].Totals.MeteringEvents != 2 || page.Data[0].Totals.EstimatedCents != 150 || page.Data[0].Totals.ActualCents != 120 || page.Data[0].Totals.CreditsDelta != -150 {
		t.Fatalf("unexpected newest totals: %#v", page.Data[0].Totals)
	}

	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/director/runs?limit=2&cursor="+*page.NextCursor, nil)
	auth.SetOrg(c, &domain.Org{ID: orgID})

	h.ListRuns(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var secondPage directorRunPage
	if err := json.NewDecoder(w.Body).Decode(&secondPage); err != nil {
		t.Fatalf("decode second response: %v", err)
	}
	if len(secondPage.Data) != 1 || secondPage.HasMore || secondPage.Data[0].DirectorJob.ID != oldestID {
		t.Fatalf("unexpected second page: %#v", secondPage)
	}
}

func TestDirectorGetRunReturnsOrgScopedAuditTrail(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupDirectorRunDB(t)
	orgID := "11111111-1111-1111-1111-111111111111"
	runID := "22222222-2222-2222-2222-222222222222"
	workflowID := "33333333-3333-3333-3333-333333333333"
	workflowRunID := "44444444-4444-4444-4444-444444444444"
	stepOneID := "55555555-5555-5555-5555-555555555555"
	stepTwoID := "66666666-6666-6666-6666-666666666666"
	videoJobID := "77777777-7777-7777-7777-777777777777"
	now := time.Date(2026, 4, 29, 8, 0, 0, 0, time.UTC)
	if err := db.Create(&domain.DirectorJob{
		ID:                   runID,
		OrgID:                orgID,
		WorkflowID:           &workflowID,
		WorkflowRunID:        &workflowRunID,
		Title:                "Launch teaser",
		Story:                "One prompt to multi-shot video",
		Status:               "running",
		EngineUsed:           "advanced_sidecar",
		FallbackUsed:         false,
		SelectedCharacterIDs: json.RawMessage(`["asset_character_1"]`),
		BudgetSnapshot:       json.RawMessage(`{"shot_count":2}`),
		PlanSnapshot:         json.RawMessage(`{"shots":[{"id":"shot_1"}]}`),
		CreatedBy:            "api_key_1",
		CreatedAt:            now.Add(-3 * time.Minute),
		UpdatedAt:            now,
	}).Error; err != nil {
		t.Fatalf("create director job: %v", err)
	}
	if err := db.Create(&[]domain.DirectorStep{
		{
			ID:             stepOneID,
			DirectorJobID:  runID,
			OrgID:          orgID,
			StepKey:        "storyboard",
			Status:         "succeeded",
			InputSnapshot:  json.RawMessage(`{"story":"One prompt"}`),
			OutputSnapshot: json.RawMessage(`{"shot_count":2}`),
			Attempts:       1,
			CreatedAt:      now.Add(-2 * time.Minute),
			UpdatedAt:      now.Add(-90 * time.Second),
		},
		{
			ID:             stepTwoID,
			DirectorJobID:  runID,
			OrgID:          orgID,
			StepKey:        "video_submit",
			Status:         "running",
			JobID:          &videoJobID,
			InputSnapshot:  json.RawMessage(`{"workflow_id":"33333333-3333-3333-3333-333333333333"}`),
			OutputSnapshot: json.RawMessage(`{"job_ids":["77777777-7777-7777-7777-777777777777"]}`),
			Attempts:       1,
			CreatedAt:      now.Add(-1 * time.Minute),
			UpdatedAt:      now.Add(-30 * time.Second),
		},
	}).Error; err != nil {
		t.Fatalf("create director steps: %v", err)
	}
	if err := db.Create(&[]domain.DirectorMetering{
		{
			OrgID:          orgID,
			DirectorJobID:  &runID,
			StepID:         &stepOneID,
			MeterType:      "storyboard",
			Units:          1,
			EstimatedCents: 20,
			ActualCents:    18,
			CreditsDelta:   -20,
			Status:         "recorded",
			UsageJSON:      json.RawMessage(`{"engine_used":"advanced_sidecar"}`),
			CreatedAt:      now.Add(-110 * time.Second),
		},
		{
			OrgID:          orgID,
			DirectorJobID:  &runID,
			StepID:         &stepTwoID,
			JobID:          &videoJobID,
			MeterType:      "video_generation",
			Units:          1,
			EstimatedCents: 600,
			ActualCents:    600,
			CreditsDelta:   -600,
			Status:         "reserved",
			UsageJSON:      json.RawMessage(`{"job_status":"running"}`),
			CreatedAt:      now.Add(-20 * time.Second),
		},
	}).Error; err != nil {
		t.Fatalf("create director metering: %v", err)
	}
	h := &DirectorHandlers{DB: db}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/director/runs/"+runID, nil)
	c.Params = gin.Params{{Key: "id", Value: runID}}
	auth.SetOrg(c, &domain.Org{ID: orgID})

	h.GetRun(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body directorRunResponse
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.DirectorJob.ID != runID || body.DirectorJob.OrgID != orgID {
		t.Fatalf("unexpected director job: %#v", body.DirectorJob)
	}
	if len(body.Steps) != 2 || body.Steps[0].StepKey != "storyboard" || body.Steps[1].StepKey != "video_submit" {
		t.Fatalf("unexpected steps: %#v", body.Steps)
	}
	if len(body.Metering) != 2 || body.Metering[0].StepID == nil || *body.Metering[0].StepID != stepTwoID {
		t.Fatalf("expected newest metering first, got %#v", body.Metering)
	}
	if body.Totals.MeteringEvents != 2 || body.Totals.EstimatedCents != 620 || body.Totals.ActualCents != 618 || body.Totals.CreditsDelta != -620 {
		t.Fatalf("unexpected totals: %#v", body.Totals)
	}
}

func TestDirectorGetRunHidesRunsFromOtherOrgs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupDirectorRunDB(t)
	runID := "88888888-8888-8888-8888-888888888888"
	if err := db.Create(&domain.DirectorJob{
		ID:                   runID,
		OrgID:                "99999999-9999-9999-9999-999999999999",
		Status:               "workflow_ready",
		SelectedCharacterIDs: json.RawMessage(`[]`),
		BudgetSnapshot:       json.RawMessage(`{}`),
		PlanSnapshot:         json.RawMessage(`{}`),
	}).Error; err != nil {
		t.Fatalf("create director job: %v", err)
	}
	h := &DirectorHandlers{DB: db}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/director/runs/"+runID, nil)
	c.Params = gin.Params{{Key: "id", Value: runID}}
	auth.SetOrg(c, &domain.Org{ID: "00000000-0000-0000-0000-000000000000"})

	h.GetRun(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func setupDirectorRunDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	statements := []string{
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
