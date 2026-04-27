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
	"os"
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
	Available               bool   `json:"available"`
	RequiresVIP             bool   `json:"requires_vip"`
	Entitled                bool   `json:"entitled"`
	TextProviderConfigured  bool   `json:"text_provider_configured"`
	ImageProviderConfigured bool   `json:"image_provider_configured"`
	MergeEnabled            bool   `json:"merge_enabled"`
	BlockingReason          string `json:"blocking_reason,omitempty"`
	UsageNotice             string `json:"usage_notice"`
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
	req.TextProviderID = ""
	out, err := h.Service.GenerateShots(c.Request.Context(), req)
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
	if !h.requireDirectorAccess(c, false) {
		return
	}
	var req struct {
		Story          string                   `json:"story" binding:"required"`
		Genre          string                   `json:"genre"`
		Style          string                   `json:"style"`
		ShotCount      int                      `json:"shot_count"`
		Duration       int                      `json:"duration_per_shot"`
		GenerateImages bool                     `json:"generate_images"`
		Options        director.WorkflowOptions `json:"options"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}
	shotsReq := director.GenerateShotsInput{
		OrgID:           org.ID,
		Story:           req.Story,
		Genre:           req.Genre,
		Style:           req.Style,
		ShotCount:       req.ShotCount,
		DurationPerShot: req.Duration,
	}
	storyboard, err := h.Service.GenerateShots(c.Request.Context(), shotsReq)
	if err != nil {
		handleDirectorError(c, err)
		return
	}
	if req.GenerateImages {
		if !h.requireDirectorAccess(c, true) {
			return
		}
		generated, imgErr := h.Service.GenerateShotImages(c.Request.Context(), director.GenerateShotImagesInput{
			OrgID:      org.ID,
			Style:      req.Style,
			Resolution: req.Options.Resolution,
			Shots:      storyboard.Shots,
		})
		if imgErr == nil {
			storyboard.Shots = generated
			if h.R2 != nil && h.DB != nil {
				for i := range storyboard.Shots {
					if storyboard.Shots[i].ReferenceImageURL == "" {
						continue
					}
					id, url, saveErr := h.persistGeneratedImage(c.Request.Context(), org.ID, storyboard.Shots[i].ReferenceImageURL)
					if saveErr != nil {
						continue
					}
					storyboard.Shots[i].ReferenceImageAssetID = id
					storyboard.Shots[i].ReferenceImageURL = url
				}
			}
		}
	}
	req.Options.EnableMerge = true
	def, err := director.BuildWorkflowFromShots(*storyboard, req.Options)
	if err != nil {
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
	row, err := h.WorkflowSvc.Create(c.Request.Context(), workflow.CreateInput{
		OrgID:        org.ID,
		Name:         name,
		WorkflowJSON: json.RawMessage(def),
	})
	if err != nil {
		httpx.InternalError(c, "workflow_create_failed", "failed to create workflow")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"plan":     director.StoryboardToDirectorPlan(*storyboard, shotsReq.Characters),
		"workflow": json.RawMessage(def),
		"record":   row,
	})
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
	req.ImageProviderID = ""
	for i := range req.Shots {
		req.Shots[i].ReferenceImageURL = ""
		req.Shots[i].ReferenceImageAssetID = ""
	}
	shots, err := h.Service.GenerateShotImages(c.Request.Context(), req)
	if err != nil {
		handleDirectorError(c, err)
		return
	}
	if h.R2 != nil && h.DB != nil {
		for i := range shots {
			if shots[i].ReferenceImageURL == "" {
				continue
			}
			id, url, saveErr := h.persistGeneratedImage(c.Request.Context(), org.ID, shots[i].ReferenceImageURL)
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
		MergeEnabled:            os.Getenv("VIDEO_MERGE_ENABLED") == "true",
		UsageNotice:             "AI Director can use text, image, and video generation. VIP access unlocks the workspace, but every live generation still consumes credits.",
	}
	out.Available = out.Entitled && out.TextProviderConfigured
	switch {
	case !out.Entitled:
		out.BlockingReason = "vip_required"
	case !out.TextProviderConfigured:
		out.BlockingReason = "text_provider_not_configured"
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
	case errors.Is(err, aiprovider.ErrProviderNotFound):
		httpx.BadRequest(c, "provider_not_found", "provider not found")
	case errors.Is(err, aiprovider.ErrProviderDisabled), errors.Is(err, aiprovider.ErrInvalidProvider):
		httpx.BadRequest(c, "invalid_provider", "provider unavailable")
	default:
		httpx.InternalError(c, "director_failed", "director request failed")
	}
}
