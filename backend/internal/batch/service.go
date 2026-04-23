// Package batch provides first-class batch run management.
// A batch run groups a set of video generation jobs submitted together
// (e.g. from Batch Studio). It tracks aggregated status, supports
// retry-failed-only, and emits batch.completed webhooks.
package batch

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/job"
	"gorm.io/gorm"
)

var (
	ErrNotFound  = errors.New("batch_run_not_found")
	ErrForbidden = errors.New("batch_run_access_denied")
)

type CreateInput struct {
	OrgID     string
	APIKeyID  *string
	Name      *string
	Shots     []job.CreateInput
	Manifest  json.RawMessage
}

type CreateResult struct {
	BatchRunID string   `json:"batch_run_id"`
	JobIDs     []string `json:"job_ids"`
	Total      int      `json:"total"`
}

type Service struct {
	db     *gorm.DB
	jobSvc *job.Service
}

func NewService(db *gorm.DB, jobSvc *job.Service) *Service {
	return &Service{db: db, jobSvc: jobSvc}
}

// Create creates a batch run and enqueues all shots as individual jobs.
// If any shot fails credit reservation, the run is still created but
// the failing shot's job is marked failed immediately — this allows
// partial batches to start rather than the entire batch blocking.
func (s *Service) Create(ctx context.Context, in CreateInput) (*CreateResult, error) {
	totalShots := len(in.Shots)
	if totalShots == 0 {
		return nil, fmt.Errorf("batch must contain at least one shot")
	}

	br := domain.BatchRun{
		OrgID:      in.OrgID,
		APIKeyID:   in.APIKeyID,
		Name:       in.Name,
		Status:     "running",
		TotalShots: totalShots,
		Manifest:   in.Manifest,
	}
	if err := s.db.WithContext(ctx).Create(&br).Error; err != nil {
		return nil, fmt.Errorf("create batch_run: %w", err)
	}

	jobIDs := make([]string, 0, totalShots)
	queued := 0
	for _, shot := range in.Shots {
		shot.BatchRunID = &br.ID
		res, err := s.jobSvc.Create(ctx, shot)
		if err != nil {
			// Record as a failed slot but keep going.
			s.db.WithContext(ctx).Model(&domain.BatchRun{}).
				Where("id = ?", br.ID).
				Updates(map[string]any{"failed_count": gorm.Expr("failed_count + 1")})
			continue
		}
		jobIDs = append(jobIDs, res.JobID)
		queued++
	}

	// Update queued count atomically.
	s.db.WithContext(ctx).Model(&domain.BatchRun{}).
		Where("id = ?", br.ID).
		Updates(map[string]any{"queued_count": queued})

	// If every shot failed (e.g. insufficient credits for all), close immediately.
	if queued == 0 {
		now := time.Now()
		s.db.WithContext(ctx).Model(&domain.BatchRun{}).
			Where("id = ?", br.ID).
			Updates(map[string]any{"status": "failed", "completed_at": now})
	}

	return &CreateResult{BatchRunID: br.ID, JobIDs: jobIDs, Total: totalShots}, nil
}

// Get retrieves a batch run with live status summary computed from job rows.
func (s *Service) Get(ctx context.Context, orgID, batchRunID string) (*domain.BatchRun, *domain.BatchStatusSummary, error) {
	var br domain.BatchRun
	if err := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", batchRunID, orgID).
		First(&br).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, err
	}

	// Compute a live summary — more reliable than stale counters.
	type statusCount struct {
		Status string
		Count  int
	}
	var counts []statusCount
	s.db.WithContext(ctx).
		Table("jobs").
		Select("status, count(*) as count").
		Where("batch_run_id = ?", batchRunID).
		Group("status").
		Scan(&counts)

	summary := &domain.BatchStatusSummary{Total: br.TotalShots}
	for _, c := range counts {
		switch domain.JobStatus(c.Status) {
		case domain.JobQueued, domain.JobSubmitting:
			summary.Queued += c.Count
		case domain.JobRunning, domain.JobRetrying:
			summary.Running += c.Count
		case domain.JobSucceeded:
			summary.Succeeded += c.Count
		case domain.JobFailed, domain.JobTimedOut, domain.JobCanceled:
			summary.Failed += c.Count
		}
	}

	return &br, summary, nil
}

// List returns batch runs for an org, most recent first.
func (s *Service) List(ctx context.Context, orgID string, limit, offset int) ([]domain.BatchRun, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var out []domain.BatchRun
	err := s.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&out).Error
	return out, err
}

// ListJobs returns all jobs belonging to a batch run.
func (s *Service) ListJobs(ctx context.Context, orgID, batchRunID string, limit, offset int) ([]domain.Job, error) {
	// Verify ownership first.
	var exists int64
	s.db.WithContext(ctx).Model(&domain.BatchRun{}).
		Where("id = ? AND org_id = ?", batchRunID, orgID).
		Count(&exists)
	if exists == 0 {
		return nil, ErrNotFound
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []domain.Job
	err := s.db.WithContext(ctx).
		Where("batch_run_id = ?", batchRunID).
		Order("created_at ASC").
		Limit(limit).Offset(offset).
		Find(&out).Error
	return out, err
}

// RetryFailed re-enqueues all failed/timed-out jobs in the batch.
// Returns the count of jobs that were successfully re-enqueued.
func (s *Service) RetryFailed(ctx context.Context, orgID, batchRunID string) (int, error) {
	var br domain.BatchRun
	if err := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", batchRunID, orgID).
		First(&br).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrNotFound
		}
		return 0, err
	}

	var failedJobs []domain.Job
	if err := s.db.WithContext(ctx).
		Where("batch_run_id = ? AND status IN ('failed','timed_out')", batchRunID).
		Find(&failedJobs).Error; err != nil {
		return 0, err
	}

	if len(failedJobs) == 0 {
		return 0, nil
	}

	retried := 0
	for _, j := range failedJobs {
		var req job.CreateInput
		// Re-parse the original request.
		if err := json.Unmarshal(j.Request, &req.Request); err != nil {
			continue
		}
		req.OrgID = orgID
		req.APIKeyID = j.APIKeyID
		req.BatchRunID = &batchRunID

		if _, err := s.jobSvc.Create(ctx, req); err != nil {
			continue
		}
		retried++
	}

	// Reopen the batch if it was closed.
	if retried > 0 {
		s.db.WithContext(ctx).Model(&domain.BatchRun{}).
			Where("id = ?", batchRunID).
			Updates(map[string]any{
				"status":       "running",
				"completed_at": nil,
				"queued_count": gorm.Expr("queued_count + ?", retried),
			})
	}

	return retried, nil
}

// Manifest returns the original manifest JSON for download.
func (s *Service) Manifest(ctx context.Context, orgID, batchRunID string) (json.RawMessage, error) {
	var br domain.BatchRun
	if err := s.db.WithContext(ctx).
		Select("id, org_id, manifest").
		Where("id = ? AND org_id = ?", batchRunID, orgID).
		First(&br).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return br.Manifest, nil
}
