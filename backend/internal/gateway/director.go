package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/director"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/storage/r2"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/workflow"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type DirectorHandlers struct {
	Service     *director.Service
	WorkflowSvc *workflow.Service
	DB          *gorm.DB
	R2          *r2.Client
}

type directorStatusResponse struct {
	Available               bool                  `json:"available"`
	RequiresVIP             bool                  `json:"requires_vip"`
	Entitled                bool                  `json:"entitled"`
	TextProviderConfigured  bool                  `json:"text_provider_configured"`
	ImageProviderConfigured bool                  `json:"image_provider_configured"`
	MergeEnabled            bool                  `json:"merge_enabled"`
	Runtime                 director.EngineStatus `json:"runtime"`
	EngineStatus            director.EngineStatus `json:"engine_status"`
	EngineUsed              string                `json:"engine_used"`
	FallbackUsed            bool                  `json:"fallback_used"`
	FallbackEnabled         bool                  `json:"fallback_enabled"`
	SidecarConfigured       bool                  `json:"sidecar_configured"`
	SidecarHealthy          bool                  `json:"sidecar_healthy"`
	Reason                  string                `json:"reason,omitempty"`
	BlockingReason          string                `json:"blocking_reason,omitempty"`
	UsageNotice             string                `json:"usage_notice"`
}

type directorRunResponse struct {
	DirectorJob domain.DirectorJob          `json:"director_job"`
	Steps       []domain.DirectorStep       `json:"steps"`
	Metering    []domain.DirectorMetering   `json:"metering"`
	Checkpoints []domain.DirectorCheckpoint `json:"checkpoints"`
	Totals      directorRunTotals           `json:"totals"`
	FinalAsset  *directorRunFinalAsset      `json:"final_asset,omitempty"`
}

type directorRunSummary struct {
	DirectorJob      domain.DirectorJob         `json:"director_job"`
	StepCount        int64                      `json:"step_count"`
	Totals           directorRunTotals          `json:"totals"`
	LatestCheckpoint *domain.DirectorCheckpoint `json:"latest_checkpoint,omitempty"`
	FinalAsset       *directorRunFinalAsset     `json:"final_asset,omitempty"`
}

type directorRunPage struct {
	Data       []directorRunSummary `json:"data"`
	HasMore    bool                 `json:"has_more"`
	NextCursor *string              `json:"next_cursor,omitempty"`
}

type directorRunTotals struct {
	MeteringEvents int   `json:"metering_events"`
	EstimatedCents int64 `json:"estimated_cents"`
	ActualCents    int64 `json:"actual_cents"`
	CreditsDelta   int64 `json:"credits_delta"`
}

type directorRunFinalAsset struct {
	Available  bool   `json:"available"`
	StepStatus string `json:"step_status"`
	ErrorCode  string `json:"error_code,omitempty"`
	AssetID    string `json:"asset_id,omitempty"`
	VideoURL   string `json:"video_url,omitempty"`
	StorageKey string `json:"storage_key,omitempty"`
	MergedAt   string `json:"merged_at,omitempty"`
}

type directorRunStepAggregate struct {
	DirectorJobID string `gorm:"column:director_job_id"`
	StepCount     int64  `gorm:"column:step_count"`
}

type directorRunMeteringAggregate struct {
	DirectorJobID  string `gorm:"column:director_job_id"`
	MeteringEvents int64  `gorm:"column:metering_events"`
	EstimatedCents int64  `gorm:"column:estimated_cents"`
	ActualCents    int64  `gorm:"column:actual_cents"`
	CreditsDelta   int64  `gorm:"column:credits_delta"`
}

const directorFinalAssetStepKey = "final_asset"

func (h *DirectorHandlers) Status(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	status, err := h.directorStatus(c.Request.Context(), org.ID)
	if err != nil {
		httpx.InternalError(c, "director_status_failed", "failed to load director status")
		return
	}
	c.JSON(http.StatusOK, status)
}

func (h *DirectorHandlers) ListRuns(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if h.DB == nil {
		httpx.InternalError(c, "director_runs_unavailable", "failed to list director runs")
		return
	}
	limit := parseDirectorRunLimit(c.DefaultQuery("limit", "20"))
	cursorTime, cursorID, ok := parseDirectorRunCursor(c.Query("cursor"))
	if !ok {
		httpx.BadRequest(c, "invalid_request", "invalid cursor")
		return
	}
	q := h.DB.WithContext(c.Request.Context()).Where("org_id = ?", org.ID)
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if cursorTime != nil {
		q = q.Where("(updated_at < ?) OR (updated_at = ? AND id < ?)", *cursorTime, *cursorTime, cursorID)
	}
	var jobs []domain.DirectorJob
	if err := q.Order("updated_at DESC, id DESC").Limit(limit + 1).Find(&jobs).Error; err != nil {
		httpx.InternalError(c, "director_runs_unavailable", "failed to list director runs")
		return
	}
	hasMore := len(jobs) > limit
	if hasMore {
		jobs = jobs[:limit]
	}
	summaries, err := h.directorRunSummaries(c.Request.Context(), org.ID, jobs)
	if err != nil {
		httpx.InternalError(c, "director_runs_unavailable", "failed to list director runs")
		return
	}
	var nextCursor *string
	if hasMore && len(jobs) > 0 {
		cursor := directorRunCursor(jobs[len(jobs)-1])
		nextCursor = &cursor
	}
	c.JSON(http.StatusOK, directorRunPage{
		Data:       summaries,
		HasMore:    hasMore,
		NextCursor: nextCursor,
	})
}

func (h *DirectorHandlers) GetRun(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if h.DB == nil {
		httpx.InternalError(c, "director_run_unavailable", "failed to load director run")
		return
	}
	runID := strings.TrimSpace(c.Param("id"))
	if _, err := uuid.Parse(runID); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid director run id")
		return
	}
	var directorJob domain.DirectorJob
	if err := h.DB.WithContext(c.Request.Context()).First(&directorJob, "id = ? AND org_id = ?", runID, org.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFoundCode(c, "director_run_not_found", "director run not found")
			return
		}
		httpx.InternalError(c, "director_run_unavailable", "failed to load director run")
		return
	}
	var steps []domain.DirectorStep
	if err := h.DB.WithContext(c.Request.Context()).
		Where("director_job_id = ? AND org_id = ?", directorJob.ID, org.ID).
		Order("created_at ASC").
		Find(&steps).Error; err != nil {
		httpx.InternalError(c, "director_run_unavailable", "failed to load director run")
		return
	}
	var metering []domain.DirectorMetering
	if err := h.DB.WithContext(c.Request.Context()).
		Where("director_job_id = ? AND org_id = ?", directorJob.ID, org.ID).
		Order("created_at DESC").
		Find(&metering).Error; err != nil {
		httpx.InternalError(c, "director_run_unavailable", "failed to load director run")
		return
	}
	checkpoints := []domain.DirectorCheckpoint{}
	if err := h.DB.WithContext(c.Request.Context()).
		Where("director_job_id = ? AND org_id = ?", directorJob.ID, org.ID).
		Order("created_at ASC, id ASC").
		Find(&checkpoints).Error; err != nil {
		httpx.InternalError(c, "director_run_unavailable", "failed to load director run")
		return
	}
	totals := directorRunTotals{MeteringEvents: len(metering)}
	for _, row := range metering {
		totals.EstimatedCents += row.EstimatedCents
		totals.ActualCents += row.ActualCents
		totals.CreditsDelta += row.CreditsDelta
	}
	c.JSON(http.StatusOK, directorRunResponse{
		DirectorJob: directorJob,
		Steps:       steps,
		Metering:    metering,
		Checkpoints: checkpoints,
		Totals:      totals,
		FinalAsset:  directorFinalAssetFromSteps(steps),
	})
}

func (h *DirectorHandlers) directorRunSummaries(ctx context.Context, orgID string, jobs []domain.DirectorJob) ([]directorRunSummary, error) {
	summaries := make([]directorRunSummary, 0, len(jobs))
	if len(jobs) == 0 {
		return summaries, nil
	}
	ids := make([]string, 0, len(jobs))
	for _, job := range jobs {
		ids = append(ids, job.ID)
	}
	stepCounts := map[string]int64{}
	var stepRows []directorRunStepAggregate
	if err := h.DB.WithContext(ctx).
		Model(&domain.DirectorStep{}).
		Select("director_job_id, COUNT(*) AS step_count").
		Where("org_id = ? AND director_job_id IN ?", orgID, ids).
		Group("director_job_id").
		Scan(&stepRows).Error; err != nil {
		return nil, err
	}
	for _, row := range stepRows {
		stepCounts[row.DirectorJobID] = row.StepCount
	}
	totalsByJob := map[string]directorRunTotals{}
	var meteringRows []directorRunMeteringAggregate
	if err := h.DB.WithContext(ctx).
		Model(&domain.DirectorMetering{}).
		Select("director_job_id, COUNT(*) AS metering_events, COALESCE(SUM(estimated_cents), 0) AS estimated_cents, COALESCE(SUM(actual_cents), 0) AS actual_cents, COALESCE(SUM(credits_delta), 0) AS credits_delta").
		Where("org_id = ? AND director_job_id IN ?", orgID, ids).
		Group("director_job_id").
		Scan(&meteringRows).Error; err != nil {
		return nil, err
	}
	for _, row := range meteringRows {
		totalsByJob[row.DirectorJobID] = directorRunTotals{
			MeteringEvents: int(row.MeteringEvents),
			EstimatedCents: row.EstimatedCents,
			ActualCents:    row.ActualCents,
			CreditsDelta:   row.CreditsDelta,
		}
	}
	finalAssetsByJob, err := h.directorFinalAssetsByJob(ctx, orgID, ids)
	if err != nil {
		return nil, err
	}
	latestCheckpointsByJob, err := h.directorLatestCheckpointsByJob(ctx, orgID, ids)
	if err != nil {
		return nil, err
	}
	for _, job := range jobs {
		summaries = append(summaries, directorRunSummary{
			DirectorJob:      job,
			StepCount:        stepCounts[job.ID],
			Totals:           totalsByJob[job.ID],
			LatestCheckpoint: latestCheckpointsByJob[job.ID],
			FinalAsset:       finalAssetsByJob[job.ID],
		})
	}
	return summaries, nil
}

func (h *DirectorHandlers) directorLatestCheckpointsByJob(ctx context.Context, orgID string, jobIDs []string) (map[string]*domain.DirectorCheckpoint, error) {
	checkpointsByJob := map[string]*domain.DirectorCheckpoint{}
	if len(jobIDs) == 0 {
		return checkpointsByJob, nil
	}
	var checkpoints []domain.DirectorCheckpoint
	if err := h.DB.WithContext(ctx).
		Where("org_id = ? AND director_job_id IN ?", orgID, jobIDs).
		Order("created_at DESC, id DESC").
		Find(&checkpoints).Error; err != nil {
		return nil, err
	}
	for i := range checkpoints {
		checkpoint := checkpoints[i]
		if _, ok := checkpointsByJob[checkpoint.DirectorJobID]; ok {
			continue
		}
		checkpointsByJob[checkpoint.DirectorJobID] = &checkpoint
	}
	return checkpointsByJob, nil
}

func (h *DirectorHandlers) directorFinalAssetsByJob(ctx context.Context, orgID string, jobIDs []string) (map[string]*directorRunFinalAsset, error) {
	assetsByJob := map[string]*directorRunFinalAsset{}
	if len(jobIDs) == 0 {
		return assetsByJob, nil
	}
	var steps []domain.DirectorStep
	if err := h.DB.WithContext(ctx).
		Where("org_id = ? AND director_job_id IN ? AND step_key = ?", orgID, jobIDs, directorFinalAssetStepKey).
		Order("updated_at DESC, created_at DESC, id DESC").
		Find(&steps).Error; err != nil {
		return nil, err
	}
	for _, step := range steps {
		if _, ok := assetsByJob[step.DirectorJobID]; ok {
			continue
		}
		if asset := directorFinalAssetFromStep(step); asset != nil {
			assetsByJob[step.DirectorJobID] = asset
		}
	}
	return assetsByJob, nil
}

func directorFinalAssetFromSteps(steps []domain.DirectorStep) *directorRunFinalAsset {
	var selected *domain.DirectorStep
	for i := range steps {
		step := &steps[i]
		if step.StepKey != directorFinalAssetStepKey {
			continue
		}
		if selected == nil || directorStepAfter(*step, *selected) {
			selected = step
		}
	}
	if selected == nil {
		return nil
	}
	return directorFinalAssetFromStep(*selected)
}

func directorFinalAssetFromStep(step domain.DirectorStep) *directorRunFinalAsset {
	if step.StepKey != directorFinalAssetStepKey {
		return nil
	}
	fields := map[string]json.RawMessage{}
	if len(step.OutputSnapshot) > 0 {
		_ = json.Unmarshal(step.OutputSnapshot, &fields)
	}
	videoURL := directorRawStringField(fields, "video_url")
	if videoURL == "" {
		videoURL = directorRawStringField(fields, "url")
	}
	errorCode := strings.TrimSpace(step.ErrorCode)
	if errorCode == "" {
		errorCode = directorRawStringField(fields, "error_code")
	}
	assetID := directorRawStringField(fields, "asset_id")
	storageKey := directorRawStringField(fields, "storage_key")
	return &directorRunFinalAsset{
		Available:  step.Status == "succeeded" && (assetID != "" || videoURL != "" || storageKey != ""),
		StepStatus: strings.TrimSpace(step.Status),
		ErrorCode:  errorCode,
		AssetID:    assetID,
		VideoURL:   videoURL,
		StorageKey: storageKey,
		MergedAt:   directorRawStringField(fields, "merged_at"),
	}
}

func directorStepAfter(candidate domain.DirectorStep, current domain.DirectorStep) bool {
	candidateTime := candidate.UpdatedAt
	if candidateTime.IsZero() {
		candidateTime = candidate.CreatedAt
	}
	currentTime := current.UpdatedAt
	if currentTime.IsZero() {
		currentTime = current.CreatedAt
	}
	if candidateTime.Equal(currentTime) {
		return candidate.ID > current.ID
	}
	return candidateTime.After(currentTime)
}

func directorRawStringField(fields map[string]json.RawMessage, key string) string {
	raw, ok := fields[key]
	if !ok || len(raw) == 0 {
		return ""
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func parseDirectorRunLimit(raw string) int {
	limit, err := strconv.Atoi(raw)
	if err != nil || limit <= 0 || limit > 100 {
		return 20
	}
	return limit
}

func parseDirectorRunCursor(raw string) (*time.Time, string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, "", true
	}
	parts := strings.SplitN(raw, ".", 2)
	if len(parts) != 2 {
		return nil, "", false
	}
	nanos, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || nanos <= 0 {
		return nil, "", false
	}
	if _, err := uuid.Parse(parts[1]); err != nil {
		return nil, "", false
	}
	tm := time.Unix(0, nanos).UTC()
	return &tm, parts[1], true
}

func directorRunCursor(job domain.DirectorJob) string {
	return fmt.Sprintf("%d.%s", job.UpdatedAt.UTC().UnixNano(), job.ID)
}

func (h *DirectorHandlers) GenerateShots(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if !h.requireDirectorAccess(c, false) {
		return
	}
	var req director.GenerateShotsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	req.OrgID = org.ID
	ctx := aiprovider.WithDirectorMetering(aiprovider.WithOrgID(c.Request.Context(), org.ID))
	out, err := h.Service.GenerateShots(ctx, req)
	if err != nil {
		handleDirectorError(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *DirectorHandlers) BuildWorkflow(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if !h.requireDirectorAccess(c, false) {
		return
	}
	var req struct {
		Storyboard director.Storyboard      `json:"storyboard" binding:"required"`
		Options    director.WorkflowOptions `json:"options"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	def, err := director.BuildWorkflowFromShots(req.Storyboard, req.Options)
	if err != nil {
		handleDirectorError(c, err)
		return
	}
	name := req.Options.Name
	if name == "" {
		name = req.Storyboard.Title
	}
	row, err := h.WorkflowSvc.Create(c.Request.Context(), workflow.CreateInput{
		OrgID:        org.ID,
		Name:         name,
		WorkflowJSON: json.RawMessage(def),
	})
	if err != nil {
		httpx.InternalError(c, "workflow_create_failed", "failed to create workflow")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"workflow": row})
}

func (h *DirectorHandlers) RunDirectorMode(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Story           string                    `json:"story" binding:"required"`
		Engine          string                    `json:"engine"`
		Genre           string                    `json:"genre"`
		Style           string                    `json:"style"`
		ShotCount       int                       `json:"shot_count"`
		Duration        int                       `json:"duration_per_shot"`
		GenerateImages  bool                      `json:"generate_images"`
		TextProviderID  string                    `json:"text_provider_id"`
		ImageProviderID string                    `json:"image_provider_id"`
		Characters      []director.CharacterInput `json:"characters"`
		Options         director.WorkflowOptions  `json:"options"`
		RunWorkflow     *bool                     `json:"run_workflow"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	if !h.requireDirectorAccess(c, req.GenerateImages) {
		return
	}
	directorJob, err := h.createDirectorJob(c.Request.Context(), c, org.ID, req.Story, req.Characters, req.Options, req.ShotCount, req.Duration, req.GenerateImages, shouldRunDirectorWorkflow(req.RunWorkflow))
	if err != nil {
		httpx.InternalError(c, "director_job_create_failed", "failed to create director job")
		return
	}
	planningStep, err := h.startDirectorStep(c.Request.Context(), org.ID, directorJob, "storyboard", gin.H{
		"engine":            req.Engine,
		"genre":             req.Genre,
		"style":             req.Style,
		"shot_count":        req.ShotCount,
		"duration_per_shot": req.Duration,
		"text_provider_id":  req.TextProviderID,
		"image_provider_id": req.ImageProviderID,
		"characters":        req.Characters,
	})
	if err != nil {
		httpx.InternalError(c, "director_step_create_failed", "failed to create director step")
		return
	}
	shotsReq := director.GenerateShotsInput{
		OrgID:           org.ID,
		Engine:          req.Engine,
		Story:           req.Story,
		Genre:           req.Genre,
		Style:           req.Style,
		ShotCount:       req.ShotCount,
		DurationPerShot: req.Duration,
		Characters:      req.Characters,
		TextProviderID:  req.TextProviderID,
		ImageProviderID: req.ImageProviderID,
	}
	ctx := h.directorMeteringContext(c.Request.Context(), org.ID, directorJob, planningStep)
	storyboard, err := h.Service.GenerateShots(ctx, shotsReq)
	if err != nil {
		h.failDirectorStep(c.Request.Context(), planningStep, "storyboard_failed")
		h.failDirectorJob(c.Request.Context(), directorJob, "planning_failed")
		handleDirectorError(c, err)
		return
	}
	h.completeDirectorStep(c.Request.Context(), planningStep, gin.H{
		"title":         storyboard.Title,
		"shot_count":    len(storyboard.Shots),
		"engine_used":   storyboard.EngineUsed,
		"engine_status": storyboard.EngineStatus,
	})
	if req.GenerateImages {
		imageStep, stepErr := h.startDirectorStep(c.Request.Context(), org.ID, directorJob, "image_submit", gin.H{
			"shot_count":        len(storyboard.Shots),
			"style":             req.Style,
			"resolution":        req.Options.Resolution,
			"image_provider_id": req.ImageProviderID,
		})
		if stepErr != nil {
			h.failDirectorJob(c.Request.Context(), directorJob, "image_step_create_failed")
			httpx.InternalError(c, "director_step_create_failed", "failed to create director step")
			return
		}
		imageCtx := h.directorMeteringContext(c.Request.Context(), org.ID, directorJob, imageStep)
		generated, imgErr := h.Service.GenerateShotImages(imageCtx, director.GenerateShotImagesInput{
			OrgID:           org.ID,
			ImageProviderID: req.ImageProviderID,
			Style:           req.Style,
			Resolution:      req.Options.Resolution,
			Shots:           storyboard.Shots,
		})
		if imgErr != nil {
			h.failDirectorStep(c.Request.Context(), imageStep, "image_generation_failed")
			h.failDirectorJob(c.Request.Context(), directorJob, "image_generation_failed")
			handleDirectorError(c, imgErr)
			return
		}
		storyboard.Shots = generated
		if h.R2 != nil && h.DB != nil {
			for i := range storyboard.Shots {
				if storyboard.Shots[i].ReferenceImageURL == "" {
					continue
				}
				id, url, saveErr := h.persistGeneratedImage(ctx, org.ID, storyboard.Shots[i].ReferenceImageURL)
				if saveErr != nil {
					h.failDirectorStep(c.Request.Context(), imageStep, "image_persist_failed")
					h.failDirectorJob(c.Request.Context(), directorJob, "image_persist_failed")
					handleDirectorError(c, director.ErrImageGenerationFailed)
					return
				}
				storyboard.Shots[i].ReferenceImageAssetID = id
				storyboard.Shots[i].ReferenceImageURL = url
			}
		}
		h.completeDirectorStep(c.Request.Context(), imageStep, gin.H{"shot_count": len(storyboard.Shots)})
	}
	req.Options.EnableMerge = h.WorkflowSvc.MergeEnabled()
	req.Options.Characters = req.Characters
	workflowStep, err := h.startDirectorStep(c.Request.Context(), org.ID, directorJob, "workflow_build", gin.H{
		"shot_count":     len(storyboard.Shots),
		"enable_merge":   req.Options.EnableMerge,
		"max_parallel":   req.Options.MaxParallel,
		"video_model":    req.Options.Model,
		"resolution":     req.Options.Resolution,
		"aspect_ratio":   req.Options.Ratio,
		"generate_audio": req.Options.GenerateAudio,
	})
	if err != nil {
		h.failDirectorJob(c.Request.Context(), directorJob, "workflow_step_create_failed")
		httpx.InternalError(c, "director_step_create_failed", "failed to create director step")
		return
	}
	def, err := director.BuildWorkflowFromShots(*storyboard, req.Options)
	if err != nil {
		h.failDirectorStep(c.Request.Context(), workflowStep, "workflow_build_failed")
		h.failDirectorJob(c.Request.Context(), directorJob, "workflow_build_failed")
		handleDirectorError(c, err)
		return
	}
	name := strings.TrimSpace(req.Options.Name)
	if name == "" {
		name = storyboard.Title
	}
	if name == "" {
		name = "NextAPI Director workflow"
	}
	row, err := h.WorkflowSvc.Create(ctx, workflow.CreateInput{
		OrgID:        org.ID,
		Name:         name,
		WorkflowJSON: json.RawMessage(def),
	})
	if err != nil {
		h.failDirectorStep(c.Request.Context(), workflowStep, "workflow_create_failed")
		h.failDirectorJob(c.Request.Context(), directorJob, "workflow_create_failed")
		httpx.InternalError(c, "workflow_create_failed", "failed to create workflow")
		return
	}
	h.completeDirectorStep(c.Request.Context(), workflowStep, gin.H{"workflow_id": row.ID})
	var runResult *workflow.RunResult
	shouldRunWorkflow := shouldRunDirectorWorkflow(req.RunWorkflow)
	if shouldRunWorkflow {
		executionStep, stepErr := h.startDirectorStep(c.Request.Context(), org.ID, directorJob, "video_submit", gin.H{
			"workflow_id":  row.ID,
			"shot_count":   len(storyboard.Shots),
			"max_parallel": req.Options.MaxParallel,
		})
		if stepErr != nil {
			h.failDirectorJob(c.Request.Context(), directorJob, "video_step_create_failed")
			httpx.InternalError(c, "director_step_create_failed", "failed to create director step")
			return
		}
		var apiKeyID *string
		if ak := auth.APIKeyFrom(c); ak != nil {
			apiKeyID = &ak.ID
		}
		runResult, err = h.WorkflowSvc.Run(ctx, row.ID, workflow.RunInput{
			OrgID:    org.ID,
			APIKeyID: apiKeyID,
		})
		if err != nil {
			h.failDirectorStep(c.Request.Context(), executionStep, "workflow_run_failed")
			h.failDirectorJob(c.Request.Context(), directorJob, "workflow_run_failed")
			(&WorkflowHandlers{}).handleWorkflowError(c, err)
			return
		}
		h.completeDirectorStep(c.Request.Context(), executionStep, gin.H{
			"workflow_run_id": runResult.RunID,
			"batch_run_id":    runResult.BatchRunID,
			"job_ids":         runResult.JobIDs,
			"video_ids":       runResult.VideoIDs,
			"merge_job_id":    runResult.MergeJobID,
		})
		h.recordDirectorVideoMetering(c.Request.Context(), org.ID, directorJob, executionStep, runResult.JobIDs)
		if runResult.TaskID != "" {
			c.Set("created_job_id", runResult.TaskID)
		}
		if len(runResult.JobIDs) > 0 {
			c.Set("created_job_id", runResult.JobIDs[0])
		}
		if runResult.BatchRunID != "" {
			c.Set("created_batch_run_id", runResult.BatchRunID)
		}
	}
	plan := director.StoryboardToDirectorPlan(*storyboard, shotsReq.Characters)
	h.finishDirectorJob(c.Request.Context(), directorJob, storyboard, &row.ID, runResult, plan)
	c.JSON(http.StatusOK, gin.H{
		"director_job":    directorJob,
		"director_job_id": directorJobID(directorJob),
		"plan":            plan,
		"workflow":        json.RawMessage(def),
		"record":          row,
		"run":             runResult,
		"engine_used":     storyboard.EngineUsed,
		"engine_status":   storyboard.EngineStatus,
	})
}

func shouldRunDirectorWorkflow(runWorkflow *bool) bool {
	return runWorkflow != nil && *runWorkflow
}

func (h *DirectorHandlers) createDirectorJob(ctx context.Context, c *gin.Context, orgID string, story string, characters []director.CharacterInput, options director.WorkflowOptions, shotCount int, duration int, generateImages bool, runWorkflow bool) (*domain.DirectorJob, error) {
	if h.DB == nil {
		return nil, nil
	}
	selectedCharacterIDs := make([]string, 0, len(characters))
	for _, character := range characters {
		if strings.TrimSpace(character.AssetID) != "" {
			selectedCharacterIDs = append(selectedCharacterIDs, strings.TrimSpace(character.AssetID))
		}
	}
	createdBy := orgID
	if ak := auth.APIKeyFrom(c); ak != nil && strings.TrimSpace(ak.ID) != "" {
		createdBy = ak.ID
	}
	row := domain.DirectorJob{
		ID:                   uuid.NewString(),
		OrgID:                orgID,
		Story:                strings.TrimSpace(story),
		Status:               "planning",
		SelectedCharacterIDs: snapshotJSON(selectedCharacterIDs),
		BudgetSnapshot: snapshotJSON(gin.H{
			"duration_per_shot": duration,
			"generate_audio":    options.GenerateAudio,
			"generate_images":   generateImages,
			"max_parallel":      options.MaxParallel,
			"model":             options.Model,
			"ratio":             options.Ratio,
			"resolution":        options.Resolution,
			"run_workflow":      runWorkflow,
			"shot_count":        shotCount,
		}),
		PlanSnapshot: snapshotJSON(gin.H{}),
		CreatedBy:    createdBy,
	}
	if err := h.DB.WithContext(ctx).Create(&row).Error; err != nil {
		if directorAuditUnavailable(err) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

func (h *DirectorHandlers) startDirectorStep(ctx context.Context, orgID string, directorJob *domain.DirectorJob, stepKey string, input any) (*domain.DirectorStep, error) {
	if h.DB == nil || directorJob == nil {
		return nil, nil
	}
	now := time.Now().UTC()
	row := domain.DirectorStep{
		ID:             uuid.NewString(),
		DirectorJobID:  directorJob.ID,
		OrgID:          orgID,
		StepKey:        stepKey,
		Status:         "running",
		InputSnapshot:  snapshotJSON(input),
		OutputSnapshot: snapshotJSON(gin.H{}),
		Attempts:       1,
		StartedAt:      &now,
	}
	if err := h.DB.WithContext(ctx).Create(&row).Error; err != nil {
		if directorAuditUnavailable(err) {
			return nil, nil
		}
		return nil, err
	}
	h.recordDirectorCheckpoint(ctx, orgID, directorJob.ID, "step."+stepKey+".running", gin.H{
		"step_id":  row.ID,
		"step_key": stepKey,
		"status":   row.Status,
		"attempts": row.Attempts,
	})
	return &row, nil
}

func (h *DirectorHandlers) completeDirectorStep(ctx context.Context, step *domain.DirectorStep, output any) {
	if h.DB == nil || step == nil {
		return
	}
	now := time.Now().UTC()
	outputSnapshot := snapshotJSON(output)
	updates := map[string]any{
		"status":          "succeeded",
		"output_snapshot": outputSnapshot,
		"completed_at":    &now,
		"updated_at":      now,
	}
	_ = h.DB.WithContext(ctx).Model(&domain.DirectorStep{}).Where("id = ?", step.ID).Updates(updates).Error
	step.Status = "succeeded"
	step.OutputSnapshot = outputSnapshot
	step.CompletedAt = &now
	step.UpdatedAt = now
	h.recordDirectorCheckpoint(ctx, step.OrgID, step.DirectorJobID, "step."+step.StepKey+".succeeded", gin.H{
		"step_id":  step.ID,
		"step_key": step.StepKey,
		"status":   step.Status,
		"attempts": step.Attempts,
	})
}

func (h *DirectorHandlers) failDirectorStep(ctx context.Context, step *domain.DirectorStep, errorCode string) {
	if h.DB == nil || step == nil {
		return
	}
	now := time.Now().UTC()
	updates := map[string]any{
		"status":       "failed",
		"error_code":   errorCode,
		"completed_at": &now,
		"updated_at":   now,
	}
	_ = h.DB.WithContext(ctx).Model(&domain.DirectorStep{}).Where("id = ?", step.ID).Updates(updates).Error
	step.Status = "failed"
	step.ErrorCode = errorCode
	step.CompletedAt = &now
	step.UpdatedAt = now
	h.recordDirectorCheckpoint(ctx, step.OrgID, step.DirectorJobID, "step."+step.StepKey+".failed", gin.H{
		"step_id":    step.ID,
		"step_key":   step.StepKey,
		"status":     step.Status,
		"error_code": errorCode,
		"attempts":   step.Attempts,
	})
}

func (h *DirectorHandlers) failDirectorJob(ctx context.Context, directorJob *domain.DirectorJob, errorCode string) {
	if h.DB == nil || directorJob == nil {
		return
	}
	now := time.Now().UTC()
	plan := snapshotJSON(gin.H{"error_code": errorCode})
	updates := map[string]any{
		"status":        "failed",
		"plan_snapshot": plan,
		"updated_at":    now,
	}
	_ = h.DB.WithContext(ctx).Model(&domain.DirectorJob{}).Where("id = ?", directorJob.ID).Updates(updates).Error
	directorJob.Status = "failed"
	directorJob.PlanSnapshot = plan
	directorJob.UpdatedAt = now
	h.recordDirectorCheckpoint(ctx, directorJob.OrgID, directorJob.ID, "job.failed", gin.H{
		"status":     directorJob.Status,
		"error_code": errorCode,
	})
}

func (h *DirectorHandlers) finishDirectorJob(ctx context.Context, directorJob *domain.DirectorJob, storyboard *director.Storyboard, workflowID *string, runResult *workflow.RunResult, plan director.DirectorPlan) {
	if h.DB == nil || directorJob == nil {
		return
	}
	status := "workflow_ready"
	if runResult != nil {
		status = "queued"
		if runResult.BatchRunID != "" || runResult.Status == "running" {
			status = "running"
		}
	}
	var workflowRunID *string
	var batchRunID *string
	if runResult != nil {
		if runResult.RunID != "" {
			workflowRunID = &runResult.RunID
		}
		if runResult.BatchRunID != "" {
			batchRunID = &runResult.BatchRunID
		}
	}
	title := ""
	engineUsed := ""
	fallbackUsed := false
	if storyboard != nil {
		title = storyboard.Title
		engineUsed = storyboard.EngineUsed
		fallbackUsed = storyboard.EngineStatus != nil && storyboard.EngineStatus.FallbackUsed
	}
	now := time.Now().UTC()
	planSnapshot := snapshotJSON(plan)
	updates := map[string]any{
		"batch_run_id":    batchRunID,
		"engine_used":     engineUsed,
		"fallback_used":   fallbackUsed,
		"plan_snapshot":   planSnapshot,
		"status":          status,
		"title":           title,
		"updated_at":      now,
		"workflow_id":     workflowID,
		"workflow_run_id": workflowRunID,
	}
	_ = h.DB.WithContext(ctx).Model(&domain.DirectorJob{}).Where("id = ?", directorJob.ID).Updates(updates).Error
	directorJob.BatchRunID = batchRunID
	directorJob.EngineUsed = engineUsed
	directorJob.FallbackUsed = fallbackUsed
	directorJob.PlanSnapshot = planSnapshot
	directorJob.Status = status
	directorJob.Title = title
	directorJob.UpdatedAt = now
	directorJob.WorkflowID = workflowID
	directorJob.WorkflowRunID = workflowRunID
	h.recordDirectorCheckpoint(ctx, directorJob.OrgID, directorJob.ID, "job."+status, gin.H{
		"status":          status,
		"workflow_id":     workflowID,
		"workflow_run_id": workflowRunID,
		"batch_run_id":    batchRunID,
		"engine_used":     engineUsed,
		"fallback_used":   fallbackUsed,
	})
}

func (h *DirectorHandlers) recordDirectorCheckpoint(ctx context.Context, orgID string, directorJobID string, checkpointKey string, state gin.H) {
	if h.DB == nil || strings.TrimSpace(orgID) == "" || strings.TrimSpace(directorJobID) == "" || strings.TrimSpace(checkpointKey) == "" {
		return
	}
	row := domain.DirectorCheckpoint{
		ID:            uuid.NewString(),
		DirectorJobID: directorJobID,
		OrgID:         orgID,
		CheckpointKey: strings.TrimSpace(checkpointKey),
		StateSnapshot: snapshotJSON(state),
	}
	if err := h.DB.WithContext(ctx).Create(&row).Error; err != nil && !directorAuditUnavailable(err) {
		return
	}
}

func (h *DirectorHandlers) recordDirectorVideoMetering(ctx context.Context, orgID string, directorJob *domain.DirectorJob, step *domain.DirectorStep, jobIDs []string) {
	if h.DB == nil || directorJob == nil || step == nil || len(jobIDs) == 0 {
		return
	}
	var rows []domain.Job
	if err := h.DB.WithContext(ctx).Where("org_id = ? AND id IN ?", orgID, jobIDs).Find(&rows).Error; err != nil {
		return
	}
	for _, row := range rows {
		cents := row.ReservedCredits
		if row.CostCredits != nil {
			cents = *row.CostCredits
		}
		metering := domain.DirectorMetering{
			OrgID:          orgID,
			DirectorJobID:  &directorJob.ID,
			StepID:         &step.ID,
			JobID:          &row.ID,
			MeterType:      string(domain.ReasonVideoGeneration),
			Units:          1,
			EstimatedCents: row.ReservedCredits,
			ActualCents:    cents,
			CreditsDelta:   -row.ReservedCredits,
			Status:         "reserved",
			UsageJSON: snapshotJSON(gin.H{
				"job_status": row.Status,
				"provider":   row.Provider,
			}),
		}
		_ = h.DB.WithContext(ctx).Create(&metering).Error
	}
}

func (h *DirectorHandlers) directorMeteringContext(ctx context.Context, orgID string, directorJob *domain.DirectorJob, step *domain.DirectorStep) context.Context {
	ctx = aiprovider.WithDirectorMetering(aiprovider.WithOrgID(ctx, orgID))
	if directorJob != nil {
		ctx = aiprovider.WithDirectorJobID(ctx, directorJob.ID)
	}
	if step != nil {
		ctx = aiprovider.WithDirectorStepID(ctx, step.ID)
	}
	return ctx
}

func directorJobID(directorJob *domain.DirectorJob) string {
	if directorJob == nil {
		return ""
	}
	return directorJob.ID
}

func snapshotJSON(value any) json.RawMessage {
	if value == nil {
		return json.RawMessage(`{}`)
	}
	raw, err := json.Marshal(value)
	if err != nil || len(raw) == 0 {
		return json.RawMessage(`{}`)
	}
	return raw
}

func directorAuditUnavailable(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "director_jobs") ||
		strings.Contains(msg, "director_steps") ||
		strings.Contains(msg, "director_checkpoints") ||
		strings.Contains(msg, "director_metering") ||
		strings.Contains(msg, "no such table")
}

func (h *DirectorHandlers) GenerateShotImages(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if !h.requireDirectorAccess(c, true) {
		return
	}
	var req director.GenerateShotImagesInput
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	req.OrgID = org.ID
	for i := range req.Shots {
		req.Shots[i].ReferenceImageURL = ""
		req.Shots[i].ReferenceImageAssetID = ""
	}
	ctx := aiprovider.WithDirectorMetering(aiprovider.WithOrgID(c.Request.Context(), org.ID))
	shots, err := h.Service.GenerateShotImages(ctx, req)
	if err != nil {
		handleDirectorError(c, err)
		return
	}
	if h.R2 != nil && h.DB != nil {
		for i := range shots {
			if shots[i].ReferenceImageURL == "" {
				continue
			}
			id, url, saveErr := h.persistGeneratedImage(ctx, org.ID, shots[i].ReferenceImageURL)
			if saveErr != nil {
				continue
			}
			shots[i].ReferenceImageAssetID = id
			shots[i].ReferenceImageURL = url
		}
	}
	c.JSON(http.StatusOK, gin.H{"shots": shots})
}

func (h *DirectorHandlers) requireDirectorAccess(c *gin.Context, needImage bool) bool {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return false
	}
	status, err := h.directorStatus(c.Request.Context(), org.ID)
	if err != nil {
		httpx.InternalError(c, "director_status_failed", "failed to load director status")
		return false
	}
	if !status.Entitled {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "ai_director_vip_required", "message": "AI Director requires VIP access"}})
		return false
	}
	if !status.TextProviderConfigured {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "ai_director_not_configured", "message": "AI Director is not configured yet"}})
		return false
	}
	if !status.Available {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "ai_director_runtime_unavailable", "message": "AI Director runtime is not available yet", "reason": status.BlockingReason}})
		return false
	}
	if needImage && !status.ImageProviderConfigured {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "ai_director_image_not_configured", "message": "AI Director image generation is not configured yet"}})
		return false
	}
	return true
}

func (h *DirectorHandlers) directorStatus(ctx context.Context, orgID string) (*directorStatusResponse, error) {
	textConfigured, err := h.providerConfigured(ctx, domain.AIProviderTypeText)
	if err != nil {
		return nil, err
	}
	imageConfigured, err := h.providerConfigured(ctx, domain.AIProviderTypeImage)
	if err != nil {
		return nil, err
	}
	entitled, err := h.aiDirectorEntitled(ctx, orgID)
	if err != nil {
		return nil, err
	}
	out := &directorStatusResponse{
		RequiresVIP:             true,
		Entitled:                entitled,
		TextProviderConfigured:  textConfigured,
		ImageProviderConfigured: imageConfigured,
		MergeEnabled:            h.WorkflowSvc.MergeEnabled(),
		Runtime:                 h.Service.RuntimeStatus(ctx),
		UsageNotice:             "AI Director can use text, image, and video generation. VIP access unlocks the workspace, but every live generation still consumes credits.",
	}
	out.EngineUsed = out.Runtime.EngineUsed
	out.EngineStatus = out.Runtime
	out.FallbackUsed = out.Runtime.FallbackUsed
	out.FallbackEnabled = out.Runtime.FallbackEnabled
	out.SidecarConfigured = out.Runtime.SidecarConfigured
	out.SidecarHealthy = out.Runtime.SidecarHealthy
	out.Reason = out.Runtime.Reason
	runtimeReady := out.Runtime.SidecarHealthy || out.Runtime.FallbackEnabled
	out.Available = out.Entitled && out.TextProviderConfigured && runtimeReady
	switch {
	case !out.Entitled:
		out.BlockingReason = "vip_required"
	case !out.TextProviderConfigured:
		out.BlockingReason = "text_provider_not_configured"
	case !runtimeReady:
		out.BlockingReason = out.Runtime.Reason
	}
	return out, nil
}

func (h *DirectorHandlers) providerConfigured(ctx context.Context, typ string) (bool, error) {
	if h.DB == nil {
		return false, nil
	}
	var row domain.AIProvider
	err := h.DB.WithContext(ctx).
		Where("type = ? AND enabled = ? AND is_default = ?", typ, true, true).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(row.APIKeyEncrypted) != "" && strings.TrimSpace(row.Model) != "", nil
}

func (h *DirectorHandlers) aiDirectorEntitled(ctx context.Context, orgID string) (bool, error) {
	if h.DB == nil {
		return false, nil
	}
	var row domain.AIDirectorEntitlement
	err := h.DB.WithContext(ctx).First(&row, "org_id = ?", orgID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !row.Enabled {
		return false, nil
	}
	return row.ExpiresAt == nil || row.ExpiresAt.After(time.Now()), nil
}

func (h *DirectorHandlers) persistGeneratedImage(ctx context.Context, orgID string, imageURL string) (string, string, error) {
	parsed, err := url.Parse(imageURL)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" {
		return "", "", errors.New("unsupported image url")
	}
	if err := rejectPrivateHost(parsed.Hostname()); err != nil {
		return "", "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return "", "", err
	}
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", errors.New("download failed")
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil || len(data) == 0 {
		return "", "", errors.New("download failed")
	}
	contentType := http.DetectContentType(data)
	if !strings.HasPrefix(contentType, "image/") {
		return "", "", errors.New("unsupported content type")
	}
	id := uuid.NewString()
	key := "library/" + orgID + "/" + id + ".png"
	if err := h.R2.Upload(ctx, key, bytes.NewReader(data), contentType); err != nil {
		return "", "", err
	}
	row := domain.MediaAsset{
		ID:          id,
		OrgID:       orgID,
		Kind:        domain.MediaAssetImage,
		StorageKey:  key,
		ContentType: contentType,
		Filename:    "director-shot-" + time.Now().UTC().Format("20060102150405") + ".png",
		SizeBytes:   int64(len(data)),
	}
	if err := h.DB.WithContext(ctx).Create(&row).Error; err != nil {
		return "", "", err
	}
	url, err := h.R2.PresignGet(ctx, key, 7*24*time.Hour)
	if err != nil {
		return "", "", err
	}
	return id, url, nil
}

func rejectPrivateHost(host string) error {
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return errors.New("unsupported image host")
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return errors.New("unsupported image host")
		}
	}
	return nil
}

func handleDirectorError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, director.ErrInvalidInput), errors.Is(err, director.ErrInvalidStoryboard):
		httpx.BadRequest(c, "invalid_request", "invalid request body")
	case errors.Is(err, director.ErrPlannerUnavailable):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "director_runtime_unavailable", "message": "director runtime is unavailable"}})
	case errors.Is(err, director.ErrImageGenerationFailed):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "director_image_failed", "message": "director image generation failed"}})
	case errors.Is(err, aiprovider.ErrProviderNotFound):
		httpx.BadRequest(c, "provider_not_found", "provider not found")
	case errors.Is(err, aiprovider.ErrProviderDisabled), errors.Is(err, aiprovider.ErrInvalidProvider):
		httpx.BadRequest(c, "invalid_provider", "provider unavailable")
	default:
		httpx.InternalError(c, "director_failed", "director request failed")
	}
}
