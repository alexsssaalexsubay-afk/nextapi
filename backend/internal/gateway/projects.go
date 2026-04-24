package gateway

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	projsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/project"
)

type ProjectHandlers struct {
	Svc *projsvc.Service
}

// GET /v1/projects
func (h *ProjectHandlers) List(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	projects, err := h.Svc.List(c.Request.Context(), org.ID)
	if err != nil {
		httpx.InternalError(c, "project_list_failed", "failed to list projects")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": projects})
}

// POST /v1/projects
func (h *ProjectHandlers) Create(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Name        string  `json:"name" binding:"required"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", err.Error())
		return
	}
	p, err := h.Svc.Create(c.Request.Context(), projsvc.CreateProjectInput{
		OrgID:       org.ID,
		Name:        req.Name,
		Description: req.Description,
	})
	if err != nil {
		httpx.InternalError(c, "project_create_failed", "failed to create project")
		return
	}
	c.JSON(http.StatusCreated, p)
}

// GET /v1/projects/:id
func (h *ProjectHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	p, err := h.Svc.Get(c.Request.Context(), org.ID, c.Param("id"))
	if err == projsvc.ErrNotFound {
		httpx.NotFoundCode(c, "project_not_found", "project not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "project_get_failed", "failed to get project")
		return
	}
	c.JSON(http.StatusOK, p)
}

// PATCH /v1/projects/:id
func (h *ProjectHandlers) Update(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Status      *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", err.Error())
		return
	}
	p, err := h.Svc.Update(c.Request.Context(), org.ID, c.Param("id"), projsvc.UpdateProjectInput{
		Name:        req.Name,
		Description: req.Description,
		Status:      req.Status,
	})
	if err == projsvc.ErrNotFound {
		httpx.NotFoundCode(c, "project_not_found", "project not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "project_update_failed", "failed to update project")
		return
	}
	c.JSON(http.StatusOK, p)
}

// DELETE /v1/projects/:id
func (h *ProjectHandlers) Delete(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if err := h.Svc.Delete(c.Request.Context(), org.ID, c.Param("id")); err != nil {
		if err == projsvc.ErrNotFound {
			httpx.NotFoundCode(c, "project_not_found", "project not found")
			return
		}
		httpx.InternalError(c, "project_delete_failed", "failed to delete project")
		return
	}
	c.Status(http.StatusNoContent)
}

// GET /v1/projects/:id/assets
func (h *ProjectHandlers) ListAssets(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	assets, err := h.Svc.ListAssets(c.Request.Context(), org.ID, c.Param("id"))
	if err == projsvc.ErrNotFound {
		httpx.NotFoundCode(c, "project_not_found", "project not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "asset_list_failed", "failed to list assets")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": assets})
}

// POST /v1/projects/:id/assets
func (h *ProjectHandlers) CreateAsset(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Kind      string  `json:"kind" binding:"required"`
		Name      string  `json:"name" binding:"required"`
		ImageURL  *string `json:"image_url"`
		SortOrder int     `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", err.Error())
		return
	}
	a, err := h.Svc.CreateAsset(c.Request.Context(), org.ID, projsvc.CreateAssetInput{
		ProjectID: c.Param("id"),
		Kind:      req.Kind,
		Name:      req.Name,
		ImageURL:  req.ImageURL,
		SortOrder: req.SortOrder,
	})
	if err == projsvc.ErrNotFound {
		httpx.NotFoundCode(c, "project_not_found", "project not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "asset_create_failed", "failed to create asset")
		return
	}
	c.JSON(http.StatusCreated, a)
}

// DELETE /v1/projects/:id/assets/:assetId
func (h *ProjectHandlers) DeleteAsset(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if err := h.Svc.DeleteAsset(c.Request.Context(), org.ID, c.Param("id"), c.Param("assetId")); err != nil {
		if err == projsvc.ErrNotFound {
			httpx.NotFoundCode(c, "not_found", "project or asset not found")
			return
		}
		httpx.InternalError(c, "asset_delete_failed", "failed to delete asset")
		return
	}
	c.Status(http.StatusNoContent)
}
