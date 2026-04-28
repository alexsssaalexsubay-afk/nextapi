package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
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
			"shot_count": len(storyboard.Shots),
			"style":      req.Style,
			"resolution": req.Options.Resolution,
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
