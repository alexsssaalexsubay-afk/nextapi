package videomerge

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/storage/r2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	defaultMergeLimit       = 2
	defaultMaxClips         = 40
	defaultMaxClipBytes     = 700 << 20
	defaultMergedAssetTTL   = 7 * 24 * time.Hour
	defaultMergeHTTPTimeout = 5 * time.Minute
)

type Executor struct {
	db         *gorm.DB
	storage    *r2.Client
	httpClient *http.Client
	ffmpegPath string
	workDir    string
}

type mergeClip struct {
	JobID    string `json:"job_id"`
	VideoID  string `json:"video_id"`
	VideoURL string `json:"video_url"`
	Status   string `json:"status"`
}

type mergeSnapshot struct {
	BatchRunID string      `json:"batch_run_id"`
	Clips      []mergeClip `json:"clips"`
}

func NewExecutor(db *gorm.DB, storage *r2.Client) *Executor {
	return &Executor{
		db:         db,
		storage:    storage,
		httpClient: &http.Client{Timeout: defaultMergeHTTPTimeout},
		ffmpegPath: envString("VIDEO_MERGE_FFMPEG_PATH", "ffmpeg"),
		workDir:    envString("VIDEO_MERGE_WORK_DIR", os.TempDir()),
	}
}

func (e *Executor) Enabled() bool {
	return e != nil && e.db != nil && e.storage != nil && executorEnabled()
}

func (e *Executor) ProcessDue(ctx context.Context, limit int) (int, error) {
	if !e.Enabled() {
		return 0, nil
	}
	if limit <= 0 {
		limit = defaultMergeLimit
	}
	var rows []domain.VideoMergeJob
	if err := e.db.WithContext(ctx).
		Where("status = ?", "ready_for_merge").
		Order("updated_at ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return 0, err
	}
	processed := 0
	var firstErr error
	for i := range rows {
		claimed, err := e.claim(ctx, rows[i].ID)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if !claimed {
			continue
		}
		processed++
		if err := e.runOne(ctx, rows[i].ID); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			_ = e.markFailed(ctx, rows[i].ID, classifyMergeError(err))
		}
	}
	return processed, firstErr
}

func (e *Executor) claim(ctx context.Context, id string) (bool, error) {
	res := e.db.WithContext(ctx).
		Model(&domain.VideoMergeJob{}).
		Where("id = ? AND status = ?", id, "ready_for_merge").
		Updates(map[string]any{
			"status":     "merging",
			"error_code": "",
			"updated_at": time.Now(),
		})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected == 1, nil
}

func (e *Executor) runOne(ctx context.Context, id string) error {
	var row domain.VideoMergeJob
	if err := e.db.WithContext(ctx).First(&row, "id = ?", id).Error; err != nil {
		return err
	}
	var snapshot mergeSnapshot
	if err := json.Unmarshal(row.OutputSnapshot, &snapshot); err != nil {
		return fmt.Errorf("invalid merge snapshot: %w", err)
	}
	clips := succeededClips(snapshot.Clips)
	if len(clips) == 0 {
		return errors.New("merge has no successful clips")
	}
	if len(clips) > envInt("VIDEO_MERGE_MAX_CLIPS", defaultMaxClips) {
		return fmt.Errorf("too many clips for one merge: %d", len(clips))
	}

	dir, err := os.MkdirTemp(e.workDir, "nextapi-merge-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)

	inputs := make([]string, 0, len(clips))
	for i, clip := range clips {
		path := filepath.Join(dir, fmt.Sprintf("%03d.mp4", i+1))
		if err := e.downloadClip(ctx, clip.VideoURL, path); err != nil {
			return fmt.Errorf("download clip %d: %w", i+1, err)
		}
		inputs = append(inputs, path)
	}
	concatList := filepath.Join(dir, "concat.txt")
	if err := writeConcatList(concatList, inputs); err != nil {
		return err
	}
	outPath := filepath.Join(dir, "merged.mp4")
	if err := e.ffmpegConcat(ctx, concatList, outPath); err != nil {
		return err
	}
	info, err := os.Stat(outPath)
	if err != nil {
		return err
	}
	if info.Size() == 0 {
		return errors.New("merged output is empty")
	}

	storageKey := fmt.Sprintf("merges/%s/%s.mp4", row.OrgID, row.ID)
	f, err := os.Open(outPath)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := e.storage.Upload(ctx, storageKey, f, "video/mp4"); err != nil {
		return err
	}
	url, err := e.storage.PresignGet(ctx, storageKey, defaultMergedAssetTTL)
	if err != nil {
		return err
	}
	asset := domain.MediaAsset{
		OrgID:       row.OrgID,
		Kind:        domain.MediaAssetVideo,
		StorageKey:  storageKey,
		ContentType: "video/mp4",
		Filename:    "director-merged-" + row.ID + ".mp4",
		SizeBytes:   info.Size(),
	}
	if err := e.db.WithContext(ctx).Create(&asset).Error; err != nil {
		return err
	}

	output := map[string]any{
		"batch_run_id": snapshot.BatchRunID,
		"asset_id":     asset.ID,
		"storage_key":  storageKey,
		"url":          url,
		"video_url":    url,
		"clips":        clips,
		"merged_at":    time.Now().UTC().Format(time.RFC3339),
	}
	outputJSON, _ := json.Marshal(output)
	updates := map[string]any{
		"status":          "succeeded",
		"output_snapshot": outputJSON,
		"error_code":      "",
		"updated_at":      time.Now(),
	}
	if err := e.db.WithContext(ctx).Model(&domain.VideoMergeJob{}).
		Where("id = ?", row.ID).
		Updates(updates).Error; err != nil {
		return err
	}
	if row.WorkflowRunID != nil && strings.TrimSpace(*row.WorkflowRunID) != "" {
		_ = e.db.WithContext(ctx).Model(&domain.WorkflowRun{}).
			Where("id = ?", *row.WorkflowRunID).
			Updates(map[string]any{
				"status":          "succeeded",
				"output_snapshot": outputJSON,
				"updated_at":      time.Now(),
			}).Error
	}
	e.updateDirectorFinalAsset(ctx, row, "succeeded", outputJSON, "")
	return nil
}

func (e *Executor) downloadClip(ctx context.Context, rawURL string, dest string) error {
	if strings.TrimSpace(rawURL) == "" {
		return errors.New("empty clip URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	resp, err := e.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("clip fetch returned HTTP %d", resp.StatusCode)
	}
	maxBytes := int64(envInt("VIDEO_MERGE_MAX_CLIP_BYTES", defaultMaxClipBytes))
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	limited := io.LimitReader(resp.Body, maxBytes+1)
	n, err := io.Copy(out, limited)
	if err != nil {
		return err
	}
	if n > maxBytes {
		return fmt.Errorf("clip exceeds %d bytes", maxBytes)
	}
	return nil
}

func (e *Executor) ffmpegConcat(ctx context.Context, concatList string, outPath string) error {
	args := []string{"-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", outPath}
	cmd := exec.CommandContext(ctx, e.ffmpegPath, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		// Provider clips are usually stream-compatible, so copy is the fast path.
		// When upstream returns slightly different stream metadata per shot, fall
		// back to re-encoding instead of leaving the user's final video stuck.
		if encErr := e.ffmpegConcatReencode(ctx, concatList, outPath); encErr != nil {
			return fmt.Errorf("ffmpeg concat failed: copy=%w: %s; reencode=%w", err, strings.TrimSpace(string(out)), encErr)
		}
	}
	return nil
}

func (e *Executor) ffmpegConcatReencode(ctx context.Context, concatList string, outPath string) error {
	args := []string{
		"-hide_banner", "-loglevel", "error", "-y",
		"-f", "concat", "-safe", "0", "-i", concatList,
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
		"-c:a", "aac", "-movflags", "+faststart",
		outPath,
	}
	cmd := exec.CommandContext(ctx, e.ffmpegPath, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (e *Executor) markFailed(ctx context.Context, id string, code string) error {
	var row domain.VideoMergeJob
	_ = e.db.WithContext(ctx).First(&row, "id = ?", id).Error
	output := map[string]any{}
	if len(row.OutputSnapshot) > 0 {
		_ = json.Unmarshal(row.OutputSnapshot, &output)
	}
	output["error_code"] = code
	output["failed_at"] = time.Now().UTC().Format(time.RFC3339)
	outputJSON, _ := json.Marshal(output)
	if err := e.db.WithContext(ctx).Model(&domain.VideoMergeJob{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":          "failed",
			"error_code":      code,
			"output_snapshot": outputJSON,
			"updated_at":      time.Now(),
		}).Error; err != nil {
		return err
	}
	if row.WorkflowRunID != nil && strings.TrimSpace(*row.WorkflowRunID) != "" {
		_ = e.db.WithContext(ctx).Model(&domain.WorkflowRun{}).
			Where("id = ?", *row.WorkflowRunID).
			Updates(map[string]any{
				"status":          "failed",
				"output_snapshot": outputJSON,
				"updated_at":      time.Now(),
			}).Error
	}
	e.updateDirectorFinalAsset(ctx, row, "failed", outputJSON, code)
	return nil
}

func (e *Executor) updateDirectorFinalAsset(ctx context.Context, merge domain.VideoMergeJob, stepStatus string, outputJSON json.RawMessage, errorCode string) {
	if e == nil || e.db == nil || !e.db.Migrator().HasTable(&domain.DirectorJob{}) || !e.db.Migrator().HasTable(&domain.DirectorStep{}) {
		return
	}
	query := e.db.WithContext(ctx).Model(&domain.DirectorJob{})
	if merge.WorkflowRunID != nil && strings.TrimSpace(*merge.WorkflowRunID) != "" {
		query = query.Where("workflow_run_id = ?", *merge.WorkflowRunID)
	} else if merge.BatchRunID != nil && strings.TrimSpace(*merge.BatchRunID) != "" {
		query = query.Where("batch_run_id = ?", *merge.BatchRunID)
	} else {
		return
	}
	var directorJob domain.DirectorJob
	if err := query.First(&directorJob).Error; err != nil {
		return
	}
	now := time.Now().UTC()
	nextStatus := "final_asset"
	if stepStatus != "succeeded" {
		nextStatus = "failed"
	}
	_ = e.db.WithContext(ctx).Model(&domain.DirectorJob{}).
		Where("id = ?", directorJob.ID).
		Updates(map[string]any{
			"status":     nextStatus,
			"updated_at": now,
		}).Error

	var existing domain.DirectorStep
	err := e.db.WithContext(ctx).
		Where("director_job_id = ? AND step_key = ?", directorJob.ID, "final_asset").
		First(&existing).Error
	if err == nil {
		_ = e.db.WithContext(ctx).Model(&domain.DirectorStep{}).
			Where("id = ?", existing.ID).
			Updates(map[string]any{
				"completed_at":    now,
				"error_code":      errorCode,
				"output_snapshot": outputJSON,
				"status":          stepStatus,
				"updated_at":      now,
			}).Error
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return
	}
	step := domain.DirectorStep{
		ID:             uuid.NewString(),
		DirectorJobID:  directorJob.ID,
		OrgID:          directorJob.OrgID,
		StepKey:        "final_asset",
		Status:         stepStatus,
		InputSnapshot:  snapshotMergeJob(merge),
		OutputSnapshot: outputJSON,
		ErrorCode:      errorCode,
		Attempts:       1,
		StartedAt:      &now,
		CompletedAt:    &now,
	}
	_ = e.db.WithContext(ctx).Create(&step).Error
}

func snapshotMergeJob(merge domain.VideoMergeJob) json.RawMessage {
	raw, err := json.Marshal(map[string]any{
		"batch_run_id":    merge.BatchRunID,
		"merge_job_id":    merge.ID,
		"workflow_run_id": merge.WorkflowRunID,
	})
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return raw
}

func succeededClips(clips []mergeClip) []mergeClip {
	out := make([]mergeClip, 0, len(clips))
	for _, clip := range clips {
		if clip.Status == "succeeded" && strings.TrimSpace(clip.VideoURL) != "" {
			out = append(out, clip)
		}
	}
	return out
}

func writeConcatList(path string, inputs []string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	for _, input := range inputs {
		if _, err := fmt.Fprintf(w, "file '%s'\n", strings.ReplaceAll(input, "'", "'\\''")); err != nil {
			return err
		}
	}
	return w.Flush()
}

func classifyMergeError(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "ffmpeg"):
		return "merge_ffmpeg_failed"
	case strings.Contains(msg, "download") || strings.Contains(msg, "clip fetch"):
		return "merge_clip_download_failed"
	case strings.Contains(msg, "no successful clips"):
		return "merge_no_clips"
	default:
		return "merge_failed"
	}
}

func executorEnabled() bool {
	return os.Getenv("VIDEO_MERGE_ENABLED") == "true" && os.Getenv("VIDEO_MERGE_EXECUTOR_ENABLED") == "true"
}

func envString(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
