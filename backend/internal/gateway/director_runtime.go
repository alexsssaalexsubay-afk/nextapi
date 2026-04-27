package gateway

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/director"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	"github.com/gin-gonic/gin"
)

const directorRuntimeTokenHeader = "X-Director-Runtime-Token"

type DirectorRuntimeHandlers struct {
	Text  director.TextGenerator
	Image director.ImageGenerator
	Token string
}

type directorRuntimeTextRequest struct {
	ProviderID string                 `json:"provider_id"`
	OrgID      string                 `json:"org_id"`
	UserID     string                 `json:"user_id"`
	Messages   []aiprovider.Message   `json:"messages" binding:"required"`
	Options    aiprovider.TextOptions `json:"options"`
}

type directorRuntimeImageRequest struct {
	ProviderID string                  `json:"provider_id"`
	OrgID      string                  `json:"org_id"`
	UserID     string                  `json:"user_id"`
	Prompt     string                  `json:"prompt" binding:"required"`
	Options    aiprovider.ImageOptions `json:"options"`
}

func (h *DirectorRuntimeHandlers) TextCompletion(c *gin.Context) {
	if !h.requireToken(c) {
		return
	}
	if h.Text == nil {
		httpx.WriteError(c, http.StatusServiceUnavailable, "director_runtime_unavailable", "director runtime is unavailable")
		return
	}
	var req directorRuntimeTextRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Messages) == 0 {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	ctx := aiprovider.WithUserID(aiprovider.WithOrgID(c.Request.Context(), strings.TrimSpace(req.OrgID)), strings.TrimSpace(req.UserID))
	out, err := h.Text.GenerateTextWithProvider(ctx, req.ProviderID, req.Messages, req.Options)
	if err != nil {
		httpx.WriteError(c, http.StatusServiceUnavailable, "text_provider_unavailable", "text provider is unavailable")
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *DirectorRuntimeHandlers) ImageGeneration(c *gin.Context) {
	if !h.requireToken(c) {
		return
	}
	if h.Image == nil {
		httpx.WriteError(c, http.StatusServiceUnavailable, "director_runtime_unavailable", "director runtime is unavailable")
		return
	}
	var req directorRuntimeImageRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Prompt) == "" {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	ctx := aiprovider.WithUserID(aiprovider.WithOrgID(c.Request.Context(), strings.TrimSpace(req.OrgID)), strings.TrimSpace(req.UserID))
	out, err := h.Image.GenerateImageWithProvider(ctx, req.ProviderID, req.Prompt, req.Options)
	if err != nil {
		httpx.WriteError(c, http.StatusServiceUnavailable, "image_provider_unavailable", "image provider is unavailable")
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *DirectorRuntimeHandlers) requireToken(c *gin.Context) bool {
	expected := strings.TrimSpace(h.Token)
	if expected == "" {
		expected = strings.TrimSpace(os.Getenv("DIRECTOR_RUNTIME_TOKEN"))
	}
	if expected == "" {
		httpx.WriteError(c, http.StatusServiceUnavailable, "director_runtime_token_missing", "director runtime token is not configured")
		return false
	}
	actual := strings.TrimSpace(c.GetHeader(directorRuntimeTokenHeader))
	if subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) != 1 {
		httpx.Unauthorized(c, "unauthorized", "unauthorized")
		return false
	}
	return true
}
