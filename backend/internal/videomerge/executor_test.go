package videomerge

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSucceededClipsKeepsOnlyFinishedClipsWithURLs(t *testing.T) {
	clips := succeededClips([]mergeClip{
		{JobID: "1", Status: "succeeded", VideoURL: "https://cdn.example/1.mp4"},
		{JobID: "2", Status: "failed", VideoURL: "https://cdn.example/2.mp4"},
		{JobID: "3", Status: "succeeded", VideoURL: "   "},
		{JobID: "4", Status: "succeeded", VideoURL: "https://cdn.example/4.mp4"},
	})
	if len(clips) != 2 {
		t.Fatalf("succeeded clips = %d; want 2", len(clips))
	}
	if clips[0].JobID != "1" || clips[1].JobID != "4" {
		t.Fatalf("clip order = %#v; want successful source order", clips)
	}
}

func TestWriteConcatListUsesFFmpegConcatFormat(t *testing.T) {
	path := filepath.Join(t.TempDir(), "concat.txt")
	if err := writeConcatList(path, []string{"/tmp/a.mp4", "/tmp/b.mp4"}); err != nil {
		t.Fatalf("writeConcatList returned error: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read concat list: %v", err)
	}
	got := string(data)
	for _, want := range []string{"file '/tmp/a.mp4'", "file '/tmp/b.mp4'"} {
		if !strings.Contains(got, want) {
			t.Fatalf("concat list = %q; missing %q", got, want)
		}
	}
}

func TestExecutorEnabledRequiresBothFlags(t *testing.T) {
	t.Setenv("VIDEO_MERGE_ENABLED", "true")
	t.Setenv("VIDEO_MERGE_EXECUTOR_ENABLED", "false")
	if executorEnabled() {
		t.Fatal("executor should stay disabled until executor flag is true")
	}
	t.Setenv("VIDEO_MERGE_EXECUTOR_ENABLED", "true")
	if !executorEnabled() {
		t.Fatal("executor should be enabled when both flags are true")
	}
}

func TestUpdateDirectorFinalAssetMarksJobAndStep(t *testing.T) {
	db := setupMergeDirectorDB(t)
	orgID := "11111111-1111-1111-1111-111111111111"
	directorJobID := "22222222-2222-2222-2222-222222222222"
	workflowRunID := "33333333-3333-3333-3333-333333333333"
	if err := db.Create(&domain.DirectorJob{
		ID:                   directorJobID,
		OrgID:                orgID,
		WorkflowRunID:        &workflowRunID,
		Story:                "make a trailer",
		Status:               "video_complete",
		SelectedCharacterIDs: []byte(`[]`),
		BudgetSnapshot:       []byte(`{}`),
		PlanSnapshot:         []byte(`{"title":"original plan"}`),
	}).Error; err != nil {
		t.Fatalf("create director job: %v", err)
	}

	output := json.RawMessage(`{"asset_id":"asset_1","video_url":"https://cdn.example/final.mp4"}`)
	exec := &Executor{db: db}
	exec.updateDirectorFinalAsset(context.Background(), domain.VideoMergeJob{
		ID:            "44444444-4444-4444-4444-444444444444",
		OrgID:         orgID,
		WorkflowRunID: &workflowRunID,
	}, "succeeded", output, "")

	var job domain.DirectorJob
	if err := db.First(&job, "id = ?", directorJobID).Error; err != nil {
		t.Fatalf("reload director job: %v", err)
	}
	if job.Status != "final_asset" || !strings.Contains(string(job.PlanSnapshot), "original plan") {
		t.Fatalf("unexpected director job: status=%s plan=%s", job.Status, string(job.PlanSnapshot))
	}
	var step domain.DirectorStep
	if err := db.First(&step, "director_job_id = ? AND step_key = ?", directorJobID, "final_asset").Error; err != nil {
		t.Fatalf("reload final asset step: %v", err)
	}
	if step.Status != "succeeded" || step.ErrorCode != "" || !strings.Contains(string(step.OutputSnapshot), "final.mp4") {
		t.Fatalf("unexpected final asset step: %#v output=%s", step, string(step.OutputSnapshot))
	}
}

func TestUpdateDirectorFinalAssetIsIdempotent(t *testing.T) {
	db := setupMergeDirectorDB(t)
	orgID := "12121212-1212-1212-1212-121212121212"
	directorJobID := "23232323-2323-2323-2323-232323232323"
	workflowRunID := "34343434-3434-3434-3434-343434343434"
	if err := db.Create(&domain.DirectorJob{
		ID:                   directorJobID,
		OrgID:                orgID,
		WorkflowRunID:        &workflowRunID,
		Story:                "make a trailer",
		Status:               "video_complete",
		SelectedCharacterIDs: []byte(`[]`),
		BudgetSnapshot:       []byte(`{}`),
		PlanSnapshot:         []byte(`{}`),
	}).Error; err != nil {
		t.Fatalf("create director job: %v", err)
	}

	exec := &Executor{db: db}
	exec.updateDirectorFinalAsset(context.Background(), domain.VideoMergeJob{
		ID:            "45454545-4545-4545-4545-454545454545",
		OrgID:         orgID,
		WorkflowRunID: &workflowRunID,
	}, "failed", json.RawMessage(`{"error_code":"merge_timeout"}`), "merge_timeout")
	exec.updateDirectorFinalAsset(context.Background(), domain.VideoMergeJob{
		ID:            "56565656-5656-5656-5656-565656565656",
		OrgID:         orgID,
		WorkflowRunID: &workflowRunID,
	}, "succeeded", json.RawMessage(`{"asset_id":"asset_2","video_url":"https://cdn.example/final-2.mp4"}`), "")

	var count int64
	if err := db.Model(&domain.DirectorStep{}).
		Where("director_job_id = ? AND step_key = ?", directorJobID, "final_asset").
		Count(&count).Error; err != nil {
		t.Fatalf("count final asset steps: %v", err)
	}
	if count != 1 {
		t.Fatalf("final asset step count = %d; want 1", count)
	}
	var step domain.DirectorStep
	if err := db.First(&step, "director_job_id = ? AND step_key = ?", directorJobID, "final_asset").Error; err != nil {
		t.Fatalf("reload final asset step: %v", err)
	}
	if step.Status != "succeeded" || step.ErrorCode != "" || !strings.Contains(string(step.OutputSnapshot), "final-2.mp4") {
		t.Fatalf("unexpected final asset step after repeat completion: %#v output=%s", step, string(step.OutputSnapshot))
	}
}

func TestUpdateDirectorFinalAssetRecordsMergeFailureByBatch(t *testing.T) {
	db := setupMergeDirectorDB(t)
	orgID := "55555555-5555-5555-5555-555555555555"
	directorJobID := "66666666-6666-6666-6666-666666666666"
	batchRunID := "77777777-7777-7777-7777-777777777777"
	if err := db.Create(&domain.DirectorJob{
		ID:                   directorJobID,
		OrgID:                orgID,
		BatchRunID:           &batchRunID,
		Story:                "make a trailer",
		Status:               "video_complete",
		SelectedCharacterIDs: []byte(`[]`),
		BudgetSnapshot:       []byte(`{}`),
		PlanSnapshot:         []byte(`{}`),
	}).Error; err != nil {
		t.Fatalf("create director job: %v", err)
	}

	output := json.RawMessage(`{"error_code":"merge_ffmpeg_failed"}`)
	exec := &Executor{db: db}
	exec.updateDirectorFinalAsset(context.Background(), domain.VideoMergeJob{
		ID:         "88888888-8888-8888-8888-888888888888",
		OrgID:      orgID,
		BatchRunID: &batchRunID,
	}, "failed", output, "merge_ffmpeg_failed")

	var job domain.DirectorJob
	if err := db.First(&job, "id = ?", directorJobID).Error; err != nil {
		t.Fatalf("reload director job: %v", err)
	}
	if job.Status != "failed" {
		t.Fatalf("director job should fail after merge failure, got %s", job.Status)
	}
	var step domain.DirectorStep
	if err := db.First(&step, "director_job_id = ? AND step_key = ?", directorJobID, "final_asset").Error; err != nil {
		t.Fatalf("reload final asset step: %v", err)
	}
	if step.Status != "failed" || step.ErrorCode != "merge_ffmpeg_failed" {
		t.Fatalf("unexpected final asset step: %#v", step)
	}
}

func setupMergeDirectorDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
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
		`CREATE UNIQUE INDEX idx_director_steps_final_asset_unique
			ON director_steps (director_job_id)
			WHERE step_key = 'final_asset'`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("migrate: %v", err)
		}
	}
	return db
}
