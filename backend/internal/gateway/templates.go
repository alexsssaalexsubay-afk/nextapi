package gateway

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/idempotency"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/moderation"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	tmplsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/template"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	workflowsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/workflow"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type TemplateHandlers struct {
	Svc         *tmplsvc.Service
	WorkflowSvc *workflowsvc.Service
	DB          *gorm.DB
}

// GET /v1/templates
func (h *TemplateHandlers) List(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	category := c.Query("category")
	templates, err := h.Svc.List(c.Request.Context(), org.ID, category)
	if err != nil {
		httpx.InternalError(c, "template_list_failed", "failed to list templates")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": templates})
}

// GET /v1/templates/:id
func (h *TemplateHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	t, err := h.Svc.Get(c.Request.Context(), org.ID, c.Param("id"))
	if err == tmplsvc.ErrNotFound {
		httpx.NotFoundCode(c, "template_not_found", "template not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "template_get_failed", "failed to get template")
		return
	}
	c.JSON(http.StatusOK, t)
}

// POST /v1/templates
func (h *TemplateHandlers) Create(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Name                  string  `json:"name" binding:"required"`
		Slug                  string  `json:"slug" binding:"required"`
		Description           *string `json:"description"`
		CoverImageURL         *string `json:"cover_image_url"`
		Category              string  `json:"category"`
		DefaultModel          string  `json:"default_model"`
		DefaultResolution     string  `json:"default_resolution"`
		DefaultDuration       int     `json:"default_duration"`
		DefaultAspectRatio    string  `json:"default_aspect_ratio"`
		DefaultMaxParallel    int     `json:"default_max_parallel"`
		DefaultPromptTemplate *string `json:"default_prompt_template"`
		Visibility            string  `json:"visibility"`
		PricingMultiplier     float64 `json:"pricing_multiplier"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	if req.Category == "" {
		req.Category = "general"
	}
	if req.DefaultModel == "" {
		req.DefaultModel = "seedance-2.0-pro"
	}
	if req.DefaultResolution == "" {
		req.DefaultResolution = "1080p"
	}
	if req.DefaultDuration == 0 {
		req.DefaultDuration = 5
	}
	if req.DefaultAspectRatio == "" {
		req.DefaultAspectRatio = "16:9"
	}
	if req.DefaultMaxParallel == 0 {
		req.DefaultMaxParallel = 5
	}
	if req.Visibility == "" {
		req.Visibility = "private"
	}
	if req.PricingMultiplier == 0 {
		req.PricingMultiplier = 1.00
	}

	orgID := org.ID
	t, err := h.Svc.Create(c.Request.Context(), tmplsvc.CreateInput{
		OrgID:                 &orgID,
		Name:                  req.Name,
		Slug:                  req.Slug,
		Description:           req.Description,
		CoverImageURL:         req.CoverImageURL,
		Category:              req.Category,
		DefaultModel:          req.DefaultModel,
		DefaultResolution:     req.DefaultResolution,
		DefaultDuration:       req.DefaultDuration,
		DefaultAspectRatio:    req.DefaultAspectRatio,
		DefaultMaxParallel:    req.DefaultMaxParallel,
		DefaultPromptTemplate: req.DefaultPromptTemplate,
		Visibility:            req.Visibility,
		PricingMultiplier:     req.PricingMultiplier,
	})
	if err != nil {
		httpx.InternalError(c, "template_create_failed", "failed to create template")
		return
	}
	c.JSON(http.StatusCreated, t)
}

// POST /v1/templates/:id/use
func (h *TemplateHandlers) Use(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if h.WorkflowSvc == nil {
		httpx.InternalError(c, "template_use_unavailable", "template use is unavailable")
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	_ = c.ShouldBindJSON(&req)
	row, err := h.WorkflowSvc.CreateFromTemplate(c.Request.Context(), workflowsvc.UseTemplateInput{
		OrgID:      org.ID,
		TemplateID: c.Param("id"),
		Name:       req.Name,
	})
	if err != nil {
		httpx.BadRequest(c, "template_use_failed", "failed to create workflow from template")
		return
	}
	c.JSON(http.StatusCreated, row)
}

// POST /v1/templates/:id/run
func (h *TemplateHandlers) Run(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if h.WorkflowSvc == nil {
		httpx.InternalError(c, "template_run_unavailable", "template run is unavailable")
		return
	}
	var req struct {
		Inputs map[string]any `json:"inputs"`
	}
	dec := json.NewDecoder(c.Request.Body)
	dec.UseNumber()
	if err := dec.Decode(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	var apiKeyID *string
	if ak := auth.APIKeyFrom(c); ak != nil {
		apiKeyID = &ak.ID
	}
	out, err := h.WorkflowSvc.RunTemplate(c.Request.Context(), c.Param("id"), workflowsvc.TemplateRunInput{
		OrgID:    org.ID,
		APIKeyID: apiKeyID,
		Inputs:   req.Inputs,
	})
	if err != nil {
		handleTemplateWorkflowError(c, err)
		return
	}
	if h.DB != nil {
		idempotency.Commit(c.Request.Context(), h.DB, org.ID, c, http.StatusAccepted, out)
	}
	c.JSON(http.StatusAccepted, out)
}

// POST /v1/templates/:id/run-batch
func (h *TemplateHandlers) RunBatch(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if h.WorkflowSvc == nil {
		httpx.InternalError(c, "template_batch_unavailable", "template batch is unavailable")
		return
	}
	var req struct {
		Name        *string          `json:"name"`
		MaxParallel *int             `json:"max_parallel"`
		Inputs      map[string]any   `json:"inputs"`
		Variables   map[string][]any `json:"variables"`
		Mode        string           `json:"mode"`
	}
	dec := json.NewDecoder(c.Request.Body)
	dec.UseNumber()
	if err := dec.Decode(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	var apiKeyID *string
	if ak := auth.APIKeyFrom(c); ak != nil {
		apiKeyID = &ak.ID
	}
	out, err := h.WorkflowSvc.RunTemplateBatch(c.Request.Context(), c.Param("id"), workflowsvc.TemplateBatchRunInput{
		OrgID:       org.ID,
		APIKeyID:    apiKeyID,
		Name:        req.Name,
		MaxParallel: req.MaxParallel,
		Inputs:      req.Inputs,
		Variables:   req.Variables,
		Mode:        req.Mode,
	})
	if err != nil {
		handleTemplateWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"batch_run_id": out.BatchRunID,
		"job_ids":      out.JobIDs,
		"total":        out.Total,
		"accepted":     out.Accepted,
		"rejected":     out.Rejected,
		"status":       "running",
	})
}

// POST /v1/templates/:id/duplicate
func (h *TemplateHandlers) Duplicate(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	row, err := h.Svc.Duplicate(c.Request.Context(), org.ID, c.Param("id"))
	if err == tmplsvc.ErrNotFound {
		httpx.NotFoundCode(c, "template_not_found", "template not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "template_duplicate_failed", "failed to duplicate template")
		return
	}
	c.JSON(http.StatusCreated, row)
}

// DELETE /v1/templates/:id
func (h *TemplateHandlers) Delete(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if err := h.Svc.Delete(c.Request.Context(), org.ID, c.Param("id")); err != nil {
		if err == tmplsvc.ErrNotFound {
			httpx.NotFoundCode(c, "template_not_found", "template not found")
			return
		}
		httpx.InternalError(c, "template_delete_failed", "failed to delete template")
		return
	}
	c.Status(http.StatusNoContent)
}

func handleTemplateWorkflowError(c *gin.Context, err error) {
	if errors.Is(err, tmplsvc.ErrNotFound) || errors.Is(err, workflowsvc.ErrWorkflowNotFound) {
		httpx.NotFoundCode(c, "template_not_found", "template not found")
		return
	}
	if errors.Is(err, workflowsvc.ErrInvalidWorkflow) {
		httpx.BadRequest(c, "invalid_template_inputs", "template inputs are invalid")
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
	httpx.InternalError(c, "template_run_failed", "failed to run template")
}
