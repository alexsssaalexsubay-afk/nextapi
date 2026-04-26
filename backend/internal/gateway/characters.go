package gateway

import (
	"errors"
	"net/http"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	charsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/character"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	"github.com/gin-gonic/gin"
)

type CharacterHandlers struct {
	Svc *charsvc.Service
}

func (h *CharacterHandlers) List(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	rows, err := h.Svc.List(c.Request.Context(), org.ID)
	if err != nil {
		httpx.InternalError(c, "character_list_failed", "failed to list characters")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *CharacterHandlers) Create(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Name            string   `json:"name"`
		ReferenceImages []string `json:"reference_images"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	row, err := h.Svc.Create(c.Request.Context(), charsvc.CreateInput{
		OrgID:           org.ID,
		Name:            req.Name,
		ReferenceImages: req.ReferenceImages,
	})
	if err != nil {
		handleCharacterError(c, err)
		return
	}
	c.JSON(http.StatusCreated, row)
}

func (h *CharacterHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	row, err := h.Svc.Get(c.Request.Context(), org.ID, c.Param("id"))
	if err != nil {
		handleCharacterError(c, err)
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *CharacterHandlers) Update(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req struct {
		Name            *string  `json:"name"`
		ReferenceImages []string `json:"reference_images"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	row, err := h.Svc.Update(c.Request.Context(), org.ID, c.Param("id"), charsvc.UpdateInput{
		Name:            req.Name,
		ReferenceImages: req.ReferenceImages,
	})
	if err != nil {
		handleCharacterError(c, err)
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *CharacterHandlers) Delete(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if err := h.Svc.Delete(c.Request.Context(), org.ID, c.Param("id")); err != nil {
		handleCharacterError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func handleCharacterError(c *gin.Context, err error) {
	if errors.Is(err, charsvc.ErrNotFound) {
		httpx.NotFoundCode(c, "character_not_found", "character not found")
		return
	}
	if errors.Is(err, charsvc.ErrInvalidCharacter) {
		httpx.BadRequest(c, "invalid_character", "character is invalid")
		return
	}
	httpx.InternalError(c, "character_error", "character request failed")
}
