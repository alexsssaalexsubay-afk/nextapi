package gateway

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/moderation"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	workflowsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/workflow"
	"github.com/gin-gonic/gin"
)

type WorkflowHandlers struct {
	Svc *workflowsvc.Service
}

func (h *WorkflowHandlers) List(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	rows, err := h.Svc.List(c.Request.Context(), org.ID, limit)
	if err != nil {
		httpx.InternalError(c, "workflow_list_failed", "failed to list workflows")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *WorkflowHandlers) Create(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		ProjectID    *string         `json:"project_id"`
		Name         string          `json:"name"`
		Description  *string         `json:"description"`
		WorkflowJSON json.RawMessage `json:"workflow_json" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	row, err := h.Svc.Create(c.Request.Context(), workflowsvc.CreateInput{
		OrgID:        org.ID,
		ProjectID:    req.ProjectID,
		Name:         req.Name,
		Description:  req.Description,
		WorkflowJSON: req.WorkflowJSON,
	})
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusCreated, row)
}

func (h *WorkflowHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	row, err := h.Svc.Get(c.Request.Context(), org.ID, c.Param("id"))
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *WorkflowHandlers) Update(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Name         *string          `json:"name"`
		Description  *string          `json:"description"`
		WorkflowJSON *json.RawMessage `json:"workflow_json"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	row, err := h.Svc.Update(c.Request.Context(), org.ID, c.Param("id"), workflowsvc.UpdateInput{
		Name:         req.Name,
		Description:  req.Description,
		WorkflowJSON: req.WorkflowJSON,
	})
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *WorkflowHandlers) Duplicate(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	row, err := h.Svc.Duplicate(c.Request.Context(), org.ID, c.Param("id"))
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusCreated, row)
}

func (h *WorkflowHandlers) Run(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var apiKeyID *string
	if ak := auth.APIKeyFrom(c); ak != nil {
		apiKeyID = &ak.ID
	}
	res, err := h.Svc.Run(c.Request.Context(), c.Param("id"), workflowsvc.RunInput{
		OrgID:    org.ID,
		APIKeyID: apiKeyID,
	})
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	if res.TaskID != "" {
		c.Set("created_job_id", res.TaskID)
	}
	if len(res.JobIDs) > 0 {
		c.Set("created_job_id", res.JobIDs[0])
	}
	if res.BatchRunID != "" {
		c.Set("created_batch_run_id", res.BatchRunID)
	}
	c.JSON(http.StatusAccepted, res)
}

func (h *WorkflowHandlers) ListVersions(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	rows, err := h.Svc.ListVersions(c.Request.Context(), org.ID, c.Param("id"))
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *WorkflowHandlers) CreateVersion(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		ChangeNote *string `json:"change_note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.ChangeNote = nil
	}
	version, err := h.Svc.CreateVersion(c.Request.Context(), org.ID, c.Param("id"), req.ChangeNote)
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusCreated, version)
}

func (h *WorkflowHandlers) RestoreVersion(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	row, err := h.Svc.RestoreVersion(c.Request.Context(), org.ID, c.Param("id"), c.Param("versionId"))
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *WorkflowHandlers) SaveAsTemplate(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Name                   string          `json:"name"`
		Description            *string         `json:"description"`
		Category               string          `json:"category"`
		CoverImageURL          *string         `json:"cover_image_url"`
		PreviewVideoURL        *string         `json:"preview_video_url"`
		RecommendedInputSchema json.RawMessage `json:"recommended_inputs_schema"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	t, err := h.Svc.SaveAsTemplate(c.Request.Context(), workflowsvc.SaveAsTemplateInput{
		OrgID:                  org.ID,
		WorkflowID:             c.Param("id"),
		Name:                   req.Name,
		Description:            req.Description,
		Category:               req.Category,
		CoverImageURL:          req.CoverImageURL,
		PreviewVideoURL:        req.PreviewVideoURL,
		RecommendedInputSchema: req.RecommendedInputSchema,
	})
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusCreated, t)
}

func (h *WorkflowHandlers) ExportAPI(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	out, err := h.Svc.ExportAPI(c.Request.Context(), org.ID, c.Param("id"))
	if err != nil {
		h.handleWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *WorkflowHandlers) handleWorkflowError(c *gin.Context, err error) {
	if errors.Is(err, workflowsvc.ErrWorkflowNotFound) {
		httpx.NotFoundCode(c, "workflow_not_found", "workflow not found")
		return
	}
	if errors.Is(err, workflowsvc.ErrInvalidWorkflow) {
		httpx.BadRequest(c, "invalid_workflow", "workflow is invalid")
		return
	}
	if errors.Is(err, workflowsvc.ErrDirectorEntitlementRequired) {
		httpx.PaymentRequired(c, "ai_director_entitlement_required", "AI Director membership is required to run Director or LLM workflow nodes")
		return
	}
	if errors.Is(err, job.ErrInsufficient) || errors.Is(err, spend.ErrInsufficientBalance) {
		httpx.PaymentRequired(c, "insufficient_quota.balance", "top up to continue")
		return
	}
	if errors.Is(err, spend.ErrBudgetCap) {
		httpx.PaymentRequired(c, "insufficient_quota.budget_cap", "period budget cap reached")
		return
	}
	if errors.Is(err, spend.ErrMonthlyLimit) {
		httpx.PaymentRequired(c, "insufficient_quota.monthly_limit", "monthly usage limit reached")
		return
	}
	if errors.Is(err, spend.ErrOrgPaused) {
		httpx.PaymentRequired(c, "insufficient_quota.org_paused", "organization is paused")
		return
	}
	if errors.Is(err, throughput.ErrBurstExceeded) {
		c.Header("Retry-After", "5")
		httpx.TooManyRequests(c, "rate_limited.burst_exceeded", "concurrency limit reached")
		return
	}
	if errors.Is(err, moderation.ErrBlocked) {
		httpx.WriteError(c, http.StatusUnprocessableEntity, "content_moderation.blocked", "content rejected")
		return
	}
	if errors.Is(err, moderation.ErrReviewRequired) {
		httpx.WriteError(c, http.StatusUnprocessableEntity, "content_moderation.review_required", "queued for review")
		return
	}
	httpx.InternalError(c, "workflow_error", "workflow request failed")
}
