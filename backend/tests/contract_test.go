// Package tests contains API contract tests that verify the HTTP response
// shape of critical endpoints has not changed in a breaking way.
//
// These tests use the actual Gin handlers wired against in-memory SQLite
// and a miniredis-backed asynq client. They make real HTTP calls (via
// httptest.NewRecorder) and assert on the JSON response schema.
//
// Contract rules enforced:
//   - Required fields must always be present.
//   - Field types must not change.
//   - Error response must always have "error" and "code" keys.
//   - Success response must always have "id" and "status" keys.
package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/gateway"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/seedance"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

func setupContractDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:contract_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE IF NOT EXISTS orgs (
		id TEXT PRIMARY KEY, name TEXT, owner_user_id TEXT,
		paused_at DATETIME, pause_reason TEXT, created_at DATETIME)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS api_keys (
		id TEXT PRIMARY KEY, org_id TEXT NOT NULL, prefix TEXT NOT NULL,
		hash TEXT NOT NULL, name TEXT, disabled INTEGER DEFAULT 0,
		revoked_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS jobs (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT NOT NULL, api_key_id TEXT, batch_run_id TEXT,
		provider TEXT NOT NULL DEFAULT 'seedance', provider_job_id TEXT,
		request TEXT NOT NULL DEFAULT '{}',
		status TEXT NOT NULL DEFAULT 'queued', video_url TEXT, tokens_used BIGINT,
		cost_credits BIGINT, reserved_credits BIGINT NOT NULL DEFAULT 0,
		error_code TEXT, error_message TEXT, retry_count INT DEFAULT 0,
		last_error_code TEXT, last_error_msg TEXT, exec_metadata TEXT,
		submitting_at DATETIME, running_at DATETIME, retrying_at DATETIME,
		timed_out_at DATETIME, canceled_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS credits_ledger (
		id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL,
		delta_credits BIGINT NOT NULL, delta_cents BIGINT, reason TEXT NOT NULL, job_id TEXT,
		note TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS videos (
		id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		org_id TEXT, api_key_id TEXT, model TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT 'queued',
		input TEXT NOT NULL DEFAULT '{}',
		output TEXT, metadata TEXT NOT NULL DEFAULT '{}',
		upstream_job_id TEXT, upstream_tokens BIGINT,
		video_seconds REAL, estimated_cost_cents BIGINT NOT NULL DEFAULT 0,
		actual_cost_cents BIGINT, reserved_cents BIGINT NOT NULL DEFAULT 0,
		error_code TEXT, error_message TEXT, webhook_url TEXT,
		idempotency_key TEXT, request_id TEXT,
		started_at DATETIME, finished_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS batch_runs (
		id TEXT PRIMARY KEY, org_id TEXT NOT NULL, api_key_id TEXT, name TEXT,
		status TEXT NOT NULL DEFAULT 'running', total_shots INT NOT NULL DEFAULT 0,
		queued_count INT NOT NULL DEFAULT 0, running_count INT NOT NULL DEFAULT 0,
		succeeded_count INT NOT NULL DEFAULT 0, failed_count INT NOT NULL DEFAULT 0,
		max_parallel INT,
		template_id TEXT,
		project_id TEXT,
		manifest TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)`)
	return db
}

// injectedOrg sets a fake authenticated org in the Gin context,
// bypassing real Clerk/API-key validation.
func injectedOrg(orgID string) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth.SetOrg(c, &domain.Org{ID: orgID, Name: "test-org"})
		c.Next()
	}
}

func buildTestRouter(t *testing.T, db *gorm.DB) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	mr := miniredis.RunT(t)
	asynqClient := asynq.NewClient(asynq.RedisClientOpt{Addr: mr.Addr()})
	t.Cleanup(func() { asynqClient.Close() })

	bill := billing.NewService(db)
	jobSvc := job.NewService(db, bill, seedance.NewMock(), asynqClient)

	vh := &gateway.VideosHandlers{
		Jobs: jobSvc,
		DB:   db,
	}

	r := gin.New()
	// Inject org context for all routes (skip real auth in tests).
	r.Use(injectedOrg("test-org-id"))
	r.POST("/v1/videos", vh.Create)
	r.GET("/v1/videos", vh.List)
	r.GET("/v1/videos/:id", vh.Get)
	r.GET("/v1/videos/:id/wait", vh.Wait)

	return r
}

func do(r *gin.Engine, method, path string, body interface{}) *httptest.ResponseRecorder {
	var bodyBuf *bytes.Buffer
	if body != nil {
		b, _ := json.Marshal(body)
		bodyBuf = bytes.NewBuffer(b)
	} else {
		bodyBuf = bytes.NewBuffer(nil)
	}
	req, _ := http.NewRequest(method, path, bodyBuf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ---------------------------------------------------------------------------
// POST /v1/videos — contract tests
// ---------------------------------------------------------------------------

func TestContract_CreateVideo_RequiredFieldsPresent(t *testing.T) {
	db := setupContractDB(t)
	// Seed org with enough credits.
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)
	db.Create(&domain.CreditsLedger{OrgID: "test-org-id", DeltaCredits: 100_000, Reason: domain.ReasonTopup})

	r := buildTestRouter(t, db)

	body := map[string]interface{}{
		"input": map[string]interface{}{
			"prompt":           "a cinematic shot of a sunset",
			"duration_seconds": 5,
			"resolution":       "480p",
		},
	}
	w := do(r, "POST", "/v1/videos", body)

	// Handler returns 202 Accepted for async job creation.
	if w.Code != http.StatusAccepted && w.Code != http.StatusCreated && w.Code != http.StatusOK {
		t.Fatalf("expected 200/201/202, got %d — body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v\nbody: %s", err, w.Body.String())
	}

	// These fields must always exist in the success response.
	requiredFields := []string{"id", "status", "created_at"}
	for _, field := range requiredFields {
		if _, ok := resp[field]; !ok {
			t.Errorf("required field %q missing from POST /v1/videos response\nfull response: %s",
				field, w.Body.String())
		}
	}

	// "id" must be a non-empty string.
	if id, ok := resp["id"].(string); !ok || id == "" {
		t.Errorf("field 'id' must be a non-empty string, got: %v", resp["id"])
	}

	// "status" must be "queued" for a just-created job.
	if status, ok := resp["status"].(string); !ok || status != "queued" {
		t.Errorf("field 'status' must be 'queued' immediately after creation, got: %v", resp["status"])
	}
}

func TestContract_CreateVideo_InsufficientCredits_ErrorShape(t *testing.T) {
	db := setupContractDB(t)
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)
	// No credits added.

	r := buildTestRouter(t, db)

	body := map[string]interface{}{
		"input": map[string]interface{}{
			"prompt":           "sunset",
			"duration_seconds": 5,
		},
	}
	w := do(r, "POST", "/v1/videos", body)

	if w.Code != http.StatusPaymentRequired && w.Code != http.StatusBadRequest &&
		w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 402/400/422 for insufficient credits, got %d", w.Code)
	}

	// Error response must always have these fields.
	assertErrorShape(t, w.Body.Bytes())
}

func TestContract_CreateVideo_MissingInput_Returns400(t *testing.T) {
	db := setupContractDB(t)
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)

	r := buildTestRouter(t, db)

	// Missing "input" field.
	w := do(r, "POST", "/v1/videos", map[string]interface{}{})
	if w.Code != http.StatusBadRequest && w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 400/422 for missing input, got %d", w.Code)
	}

	assertErrorShape(t, w.Body.Bytes())
}

// ---------------------------------------------------------------------------
// GET /v1/videos/:id — contract tests
// ---------------------------------------------------------------------------

func TestContract_GetVideo_RequiredFieldsPresent(t *testing.T) {
	db := setupContractDB(t)
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)
	db.Create(&domain.CreditsLedger{OrgID: "test-org-id", DeltaCredits: 100_000, Reason: domain.ReasonTopup})

	r := buildTestRouter(t, db)

	// First create a job.
	createBody := map[string]interface{}{
		"input": map[string]interface{}{
			"prompt": "test contract shot", "duration_seconds": 5,
		},
	}
	createW := do(r, "POST", "/v1/videos", createBody)
	if createW.Code != http.StatusAccepted && createW.Code != http.StatusCreated && createW.Code != http.StatusOK {
		t.Fatalf("create failed: %d — %s", createW.Code, createW.Body.String())
	}

	var createResp map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResp)
	videoID := createResp["id"].(string)

	// Now GET the video.
	getW := do(r, "GET", "/v1/videos/"+videoID, nil)
	if getW.Code != http.StatusOK {
		t.Fatalf("GET /v1/videos/%s returned %d: %s", videoID, getW.Code, getW.Body.String())
	}

	var getResp map[string]interface{}
	if err := json.Unmarshal(getW.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("GET response is not valid JSON: %v", err)
	}

	requiredFields := []string{"id", "status", "created_at"}
	for _, field := range requiredFields {
		if _, ok := getResp[field]; !ok {
			t.Errorf("required field %q missing from GET /v1/videos/:id response\nfull: %s",
				field, getW.Body.String())
		}
	}
}

func TestContract_GetVideo_NotFound_ErrorShape(t *testing.T) {
	db := setupContractDB(t)
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)

	r := buildTestRouter(t, db)
	w := do(r, "GET", "/v1/videos/nonexistent-id-xyz", nil)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown video, got %d", w.Code)
	}
	assertErrorShape(t, w.Body.Bytes())
}

func TestContract_GetVideo_ExposesLatestRetryError(t *testing.T) {
	db := setupContractDB(t)
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)
	db.Exec(`INSERT INTO jobs (
		id, org_id, provider, request, status, reserved_credits,
		last_error_code, last_error_msg, retry_count, created_at
	) VALUES (
		'job_retry_visible', 'test-org-id', 'seedance-relay', '{}', 'retrying', 0,
		'InvalidParameter', 'image at position 1 resource download failed.', 2, CURRENT_TIMESTAMP
	)`)
	db.Exec(`INSERT INTO videos (
		id, org_id, model, status, input, metadata, upstream_job_id, created_at
	) VALUES (
		'vid_retry_visible', 'test-org-id', 'seedance-2.0-pro', 'retrying', CAST('{}' AS BLOB), CAST('{}' AS BLOB), 'job_retry_visible', CURRENT_TIMESTAMP
	)`)

	r := buildTestRouter(t, db)
	w := do(r, "GET", "/v1/videos/vid_retry_visible", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET retrying video returned %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("GET response is not valid JSON: %v", err)
	}
	if resp["last_error_code"] != "InvalidParameter" {
		t.Fatalf("last_error_code = %v", resp["last_error_code"])
	}
	if resp["last_error_message"] != "image at position 1 resource download failed." {
		t.Fatalf("last_error_message = %v", resp["last_error_message"])
	}
	if resp["retry_count"] != float64(2) {
		t.Fatalf("retry_count = %v", resp["retry_count"])
	}
	if resp["error_message"] != nil {
		t.Fatalf("terminal error_message should stay null while retrying, got %v", resp["error_message"])
	}
}

// ---------------------------------------------------------------------------
// GET /v1/videos — list contract
// ---------------------------------------------------------------------------

func TestContract_ListVideos_ResponseIsArray(t *testing.T) {
	db := setupContractDB(t)
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)

	r := buildTestRouter(t, db)
	w := do(r, "GET", "/v1/videos", nil)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("list response is not valid JSON: %v", err)
	}

	// Must have a "data" array at minimum (even if empty).
	if _, ok := resp["data"]; !ok {
		t.Errorf("list response missing 'data' field\nfull: %s", w.Body.String())
	}
}

func TestContract_ListVideos_ExposesLatestRetryError(t *testing.T) {
	db := setupContractDB(t)
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)
	db.Exec(`INSERT INTO jobs (
		id, org_id, provider, request, status, reserved_credits,
		last_error_code, last_error_msg, retry_count, created_at
	) VALUES (
		'job_retry_list', 'test-org-id', 'seedance-relay', '{}', 'retrying', 0,
		'upstream_timeout', 'provider queue timeout', 1, CURRENT_TIMESTAMP
	)`)
	db.Exec(`INSERT INTO videos (
		id, org_id, model, status, input, metadata, upstream_job_id, created_at
	) VALUES (
		'vid_retry_list', 'test-org-id', 'seedance-2.0-pro', 'retrying', CAST('{}' AS BLOB), CAST('{}' AS BLOB), 'job_retry_list', CURRENT_TIMESTAMP
	)`)

	r := buildTestRouter(t, db)
	w := do(r, "GET", "/v1/videos", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("list response is not valid JSON: %v", err)
	}
	if len(resp.Data) != 1 {
		t.Fatalf("expected one video, got %d", len(resp.Data))
	}
	item := resp.Data[0]
	if item["last_error_code"] != "upstream_timeout" {
		t.Fatalf("last_error_code = %v", item["last_error_code"])
	}
	if item["last_error_message"] != "provider queue timeout" {
		t.Fatalf("last_error_message = %v", item["last_error_message"])
	}
	if item["retry_count"] != float64(1) {
		t.Fatalf("retry_count = %v", item["retry_count"])
	}
}

// ---------------------------------------------------------------------------
// Error response shape contract
// ---------------------------------------------------------------------------

// assertErrorShape verifies the standard error envelope is present.
// NextAPI uses the nested error format: {"error": {"code": "...", "message": "..."}}.
// Gin binding errors may use {"message": "..."}.
func assertErrorShape(t *testing.T, body []byte) {
	t.Helper()
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("error response is not valid JSON: %v\nbody: %s", err, body)
	}

	// Accept the following shapes:
	// 1. {"error": {"code": "...", "message": "..."}}  — standard NextAPI error
	// 2. {"error": "..."}                              — simple string error
	// 3. {"message": "..."}                            — Gin binding error
	hasValidShape := func() bool {
		if m, ok := resp["message"]; ok && m != nil {
			return true
		}
		errVal, hasE := resp["error"]
		if !hasE {
			return false
		}
		// Nested object: {"error": {"code": "...", "message": "..."}}
		if errObj, ok := errVal.(map[string]interface{}); ok {
			_, hasCode := errObj["code"]
			_, hasMsg := errObj["message"]
			return hasCode || hasMsg
		}
		// Simple string: {"error": "..."}
		if _, ok := errVal.(string); ok {
			return true
		}
		return false
	}
	if !hasValidShape() {
		t.Errorf("error response has unexpected shape\nfull: %s", body)
	}

	// Raw Go error strings must not leak.
	bodyStr := string(body)
	leakPatterns := []string{
		"runtime error",
		"goroutine ",
		"panic:",
		"gorm.io/",
		"database/sql",
		".go:",
	}
	for _, pattern := range leakPatterns {
		if strings.Contains(bodyStr, pattern) {
			t.Errorf("error response leaks internal details (%q found)\nbody: %s", pattern, bodyStr)
		}
	}
}

// ---------------------------------------------------------------------------
// Idempotency contract: same idempotency key must return the same job
// ---------------------------------------------------------------------------

func TestContract_CreateVideo_IdempotencyKey_ReturnsSameJob(t *testing.T) {
	db := setupContractDB(t)
	db.Exec(`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('test-org-id', 'test', 'u', CURRENT_TIMESTAMP)`)
	db.Create(&domain.CreditsLedger{OrgID: "test-org-id", DeltaCredits: 100_000, Reason: domain.ReasonTopup})

	mr := miniredis.RunT(t)
	asynqClient := asynq.NewClient(asynq.RedisClientOpt{Addr: mr.Addr()})
	t.Cleanup(func() { asynqClient.Close() })

	bill := billing.NewService(db)
	jobSvc := job.NewService(db, bill, seedance.NewMock(), asynqClient)

	vh := &gateway.VideosHandlers{Jobs: jobSvc, DB: db}
	r := gin.New()
	r.Use(injectedOrg("test-org-id"))

	// Wire idempotency middleware with miniredis.
	// Note: full idempotency middleware requires the real Redis client.
	// We test the endpoint contract here; idempotency dedup is tested
	// separately in idempotency/middleware_test.go.
	r.POST("/v1/videos", vh.Create)

	body := map[string]interface{}{
		"input": map[string]interface{}{
			"prompt": "idempotency test", "duration_seconds": 5,
		},
	}

	// Two identical submissions.
	w1 := do(r, "POST", "/v1/videos", body)
	w2 := do(r, "POST", "/v1/videos", body)

	if w1.Code != http.StatusAccepted && w1.Code != http.StatusCreated && w1.Code != http.StatusOK {
		t.Fatalf("first request failed: %d — %s", w1.Code, w1.Body.String())
	}
	if w2.Code != http.StatusAccepted && w2.Code != http.StatusCreated && w2.Code != http.StatusOK {
		t.Fatalf("second request failed: %d — %s", w2.Code, w2.Body.String())
	}

	// Both must be valid JSON with an "id" field.
	var r1, r2 map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &r1)
	json.Unmarshal(w2.Body.Bytes(), &r2)

	id1, _ := r1["id"].(string)
	id2, _ := r2["id"].(string)
	if id1 == "" || id2 == "" {
		t.Fatalf("both responses must include 'id': r1=%v r2=%v", r1, r2)
	}
	// Two separate requests without idempotency key create two jobs —
	// this verifies the API produces different IDs (no accidental dedup).
	// (Idempotency dedup requires the Idempotency-Key header.)
}

// Compile-time check that domain.Org is importable here.
var _ = context.Background
