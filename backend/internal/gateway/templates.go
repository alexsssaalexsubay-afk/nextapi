package gateway

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	tmplsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/template"
)

type TemplateHandlers struct {
	Svc *tmplsvc.Service
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
		httpx.BadRequest(c, "invalid_request", err.Error())
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
