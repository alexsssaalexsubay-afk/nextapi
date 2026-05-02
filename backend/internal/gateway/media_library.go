package gateway

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/uptoken"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// MediaLibraryHandlers exposes the persistent asset library for the dashboard
// composer. Files live under library/<org>/<uuid> in R2 and are tracked in
// media_assets so the UI can list them with previews and surface size/kind
// without round-tripping the bucket.
//
// The library is intentionally bounded: per-org caps stop a single account
// from exhausting bucket quota and per-file caps mirror the temp upload path.
type MediaLibraryHandlers struct {
	DB            *gorm.DB
	R2            mediaLibraryStorage
	UpTokenAssets UpTokenAssetProvider
}

type mediaLibraryStorage interface {
	Upload(ctx context.Context, key string, body io.Reader, contentType string) error
	Delete(ctx context.Context, key string) error
	PresignGet(ctx context.Context, key string, expires time.Duration) (string, error)
}

type UpTokenAssetProvider interface {
	UploadAsset(ctx context.Context, filename string, contentType string, data []byte) (*uptoken.Asset, error)
	GetAsset(ctx context.Context, virtualID string) (*uptoken.Asset, error)
	WaitAssetActive(ctx context.Context, virtualID string, timeout time.Duration) (*uptoken.Asset, error)
}

// libraryAssetTTL controls how long the presigned GET URL lives in API
// responses. R2 caps presigned URLs at 7 days, so list responses are always
// served with a fresh 7-day URL even though the underlying object lives
// indefinitely. Callers expected to refresh by re-listing.
const libraryAssetTTL = 7 * 24 * time.Hour

// libraryMaxAssetsPerOrg keeps a single org from filling the bucket. Increase
// once we add storage tiers; today this is roughly 5 GB worst-case
// (250 × 50 MB upper bound for video).
const libraryMaxAssetsPerOrg = 250

type libraryAssetResponse struct {
	ID                       string    `json:"id"`
	Kind                     string    `json:"kind"`
	Filename                 string    `json:"filename"`
	ContentType              string    `json:"content_type"`
	SizeBytes                int64     `json:"size_bytes"`
	URL                      string    `json:"url"`
	GenerationURL            string    `json:"generation_url"`
	URLExpires               time.Time `json:"url_expires_at"`
	CreatedAt                time.Time `json:"created_at"`
	SeedanceAssetID          *string   `json:"seedance_asset_id,omitempty"`
	SeedanceAssetURL         *string   `json:"seedance_asset_url,omitempty"`
	SeedanceAssetStatus      *string   `json:"seedance_asset_status,omitempty"`
	SeedanceProcessingStatus *string   `json:"seedance_processing_status,omitempty"`
	SeedanceRejectionReason  *string   `json:"seedance_rejection_reason,omitempty"`
}

// GET /v1/me/library/assets
func (h *MediaLibraryHandlers) List(c *gin.Context) {
	if !h.ready(c) {
		return
	}
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}

	q := h.DB.WithContext(c.Request.Context()).
		Where("org_id = ?", org.ID).
		Order("created_at DESC").
		Limit(500)
	kind, ok := mediaLibraryKindFilter(c.Query("kind"))
	if !ok {
		c.JSON(http.StatusOK, gin.H{"assets": []libraryAssetResponse{}, "ttl_seconds": int(libraryAssetTTL.Seconds())})
		return
	}
	if kind != "" {
		q = q.Where("kind = ?", kind)
	}

	var rows []domain.MediaAsset
	if err := q.Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{
			"code":    "internal_error",
			"message": "failed to load asset library",
		}})
		return
	}

	out := make([]libraryAssetResponse, 0, len(rows))
	exp := time.Now().Add(libraryAssetTTL).UTC()
	for i := range rows {
		h.refreshUpTokenAsset(c.Request.Context(), &rows[i])
		url, err := h.R2.PresignGet(c.Request.Context(), rows[i].StorageKey, libraryAssetTTL)
		if err != nil {
			// Skip the row rather than failing the whole list — a single
			// stale key shouldn't block the user from seeing the rest of
			// their library. Logged so an operator can investigate.
			log.Printf("library: presign failed key=%s err=%v", rows[i].StorageKey, err)
			continue
		}
		generationURL := url
		if upTokenAssetStatusUsable(rows[i].UpTokenStatus) &&
			rows[i].UpTokenAssetURL != nil && *rows[i].UpTokenAssetURL != "" {
			generationURL = *rows[i].UpTokenAssetURL
		}
		out = append(out, libraryAssetResponse{
			ID:                       rows[i].ID,
			Kind:                     string(rows[i].Kind),
			Filename:                 rows[i].Filename,
			ContentType:              rows[i].ContentType,
			SizeBytes:                rows[i].SizeBytes,
			URL:                      url,
			GenerationURL:            generationURL,
			URLExpires:               exp,
			CreatedAt:                rows[i].CreatedAt,
			SeedanceAssetID:          rows[i].UpTokenVirtualID,
			SeedanceAssetURL:         rows[i].UpTokenAssetURL,
			SeedanceAssetStatus:      rows[i].UpTokenStatus,
			SeedanceProcessingStatus: rows[i].UpTokenProcessingStatus,
			SeedanceRejectionReason:  rows[i].UpTokenRejectionReason,
		})
	}
	c.JSON(http.StatusOK, gin.H{"assets": out, "ttl_seconds": int(libraryAssetTTL.Seconds())})
}

func (h *MediaLibraryHandlers) refreshUpTokenAsset(ctx context.Context, row *domain.MediaAsset) {
	if h.UpTokenAssets == nil || row == nil || row.Kind != domain.MediaAssetImage || row.UpTokenVirtualID == nil {
		return
	}
	if row.UpTokenStatus != nil {
		status := strings.ToLower(strings.TrimSpace(*row.UpTokenStatus))
		if status == "active" || status == "ready" {
			return
		}
		if status == "failed" && row.UpTokenRejectionReason != nil && strings.TrimSpace(*row.UpTokenRejectionReason) != "" {
			return
		}
	}
	asset, err := h.UpTokenAssets.GetAsset(ctx, *row.UpTokenVirtualID)
	if err != nil || asset == nil {
		if err != nil {
			log.Printf("library: uptoken asset refresh failed asset_id=%s err=%v", *row.UpTokenVirtualID, err)
		}
		return
	}
	updates := map[string]any{}
	if asset.Status != "" {
		row.UpTokenStatus = &asset.Status
		updates["uptoken_status"] = asset.Status
	}
	if asset.ProcessingStatus != "" {
		row.UpTokenProcessingStatus = &asset.ProcessingStatus
		updates["uptoken_processing_status"] = asset.ProcessingStatus
	}
	if asset.RejectionReason != "" {
		row.UpTokenRejectionReason = &asset.RejectionReason
		updates["uptoken_rejection_reason"] = asset.RejectionReason
	}
	if assetURL := upTokenGenerationURL(asset); assetURL != "" {
		row.UpTokenAssetURL = &assetURL
		updates["uptoken_asset_url"] = assetURL
	}
	if len(updates) == 0 {
		return
	}
	if err := h.DB.WithContext(ctx).
		Model(&domain.MediaAsset{}).
		Where("id = ? AND org_id = ?", row.ID, row.OrgID).
		Updates(updates).Error; err != nil {
		log.Printf("library: uptoken asset refresh persist failed asset_id=%s err=%v", *row.UpTokenVirtualID, err)
	}
}

func mediaLibraryKindFilter(raw string) (string, bool) {
	kind := strings.ToLower(strings.TrimSpace(raw))
	switch kind {
	case "", string(domain.MediaAssetImage):
		return string(domain.MediaAssetImage), true
	case string(domain.MediaAssetVideo), string(domain.MediaAssetAudio):
		return kind, true
	case "all":
		return "", true
	default:
		return "", false
	}
}

// POST /v1/me/library/assets — multipart with field "file"
func (h *MediaLibraryHandlers) Create(c *gin.Context) {
	if !h.ready(c) {
		return
	}
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	ct := c.GetHeader("Content-Type")
	if err := c.Request.ParseMultipartForm(maxVideoUpload + 1<<20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": "expected multipart/form-data with field \"file\" (" + err.Error() + ")",
		}})
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		fh, err = c.FormFile("media")
	}
	if err != nil {
		fh, err = c.FormFile("upload")
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": "missing multipart file field; use field name \"file\"",
		}})
		return
	}
	if fh.Size == 0 || fh.Size > maxVideoUpload {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": "file must be 1 byte to 50 MB",
		}})
		return
	}

	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": "failed to read file",
		}})
		return
	}
	data, err := io.ReadAll(io.LimitReader(f, maxVideoUpload+1))
	_ = f.Close()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{
			"code":    "internal_error",
			"message": "read failed",
		}})
		return
	}
	if len(data) == 0 || len(data) > maxVideoUpload {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": "file must be 1 byte to 50 MB",
		}})
		return
	}

	detected := http.DetectContentType(data)
	if detected == "application/octet-stream" || detected == "text/plain; charset=utf-8" {
		if headerCT := strings.TrimSpace(fh.Header.Get("Content-Type")); headerCT != "" {
			detected = headerCT
		}
	}
	kind, maxBytes := mediaKindAndLimit(detected)
	if kind == "" || maxBytes == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": "unsupported media type",
		}})
		return
	}
	// Permanent library only stores reusable still images. Videos and audio use
	// the per-job temporary upload path so large transient media does not grow
	// persistent storage unexpectedly.
	if kind != "image" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": "the permanent library only accepts images; use the temporary upload for video/audio",
		}})
		return
	}
	if len(data) > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code":    "invalid_request",
			"message": kind + " exceeds upload size limit",
		}})
		return
	}

	var current int64
	if err := h.DB.WithContext(c.Request.Context()).
		Model(&domain.MediaAsset{}).
		Where("org_id = ?", org.ID).
		Count(&current).Error; err == nil && current >= libraryMaxAssetsPerOrg {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{
			"code":    "library_full",
			"message": "asset library is full; delete unused items to free space",
		}})
		return
	}

	id := uuid.NewString()
	ext := mediaExtForMIME(detected)
	storageKey := "library/" + org.ID + "/" + id + ext

	if err := h.R2.Upload(c.Request.Context(), storageKey, bytes.NewReader(data), detected); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{
			"code":    "internal_error",
			"message": "storage upload failed",
		}})
		return
	}

	var upAsset *uptoken.Asset
	if h.UpTokenAssets != nil {
		if uploaded, upErr := h.UpTokenAssets.UploadAsset(c.Request.Context(), fh.Filename, detected, data); upErr == nil && uploaded != nil {
			upAsset = uploaded
			if uploaded.VirtualID != "" {
				if active, waitErr := h.UpTokenAssets.WaitAssetActive(c.Request.Context(), uploaded.VirtualID, 20*time.Second); waitErr == nil && active != nil {
					upAsset = active
				}
			}
		} else if upErr != nil {
			log.Printf("library: uptoken asset upload failed filename=%s err=%v", fh.Filename, upErr)
			var assetErr *uptoken.AssetError
			rejectionReason := ""
			if errors.As(upErr, &assetErr) {
				rejectionReason = strings.TrimSpace(assetErr.Message)
				if rejectionReason == "" {
					rejectionReason = strings.TrimSpace(assetErr.Code)
				}
			}
			status := "failed"
			upAsset = &uptoken.Asset{Status: status, ProcessingStatus: status, RejectionReason: rejectionReason}
		}
	}

	row := domain.MediaAsset{
		ID:          id,
		OrgID:       org.ID,
		Kind:        domain.MediaAssetKind(kind),
		StorageKey:  storageKey,
		ContentType: detected,
		Filename:    fh.Filename,
		SizeBytes:   int64(len(data)),
	}
	if upAsset != nil {
		if upAsset.VirtualID != "" {
			row.UpTokenVirtualID = &upAsset.VirtualID
		}
		if assetURL := upTokenGenerationURL(upAsset); assetURL != "" {
			row.UpTokenAssetURL = &assetURL
		}
		if upAsset.Status != "" {
			row.UpTokenStatus = &upAsset.Status
		}
		if upAsset.ProcessingStatus != "" {
			row.UpTokenProcessingStatus = &upAsset.ProcessingStatus
		}
		if upAsset.RejectionReason != "" {
			row.UpTokenRejectionReason = &upAsset.RejectionReason
		}
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&row).Error; err != nil {
		// Best-effort cleanup of the orphan R2 object — better to leak a few
		// bytes than to leave a row pointing at nothing.
		_ = h.R2.Delete(c.Request.Context(), storageKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{
			"code":    "internal_error",
			"message": "failed to record asset",
		}})
		return
	}

	url, err := h.R2.PresignGet(c.Request.Context(), storageKey, libraryAssetTTL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{
			"code":    "internal_error",
			"message": "failed to sign download URL",
		}})
		return
	}
	generationURL := url
	if upTokenAssetStatusUsable(row.UpTokenStatus) &&
		row.UpTokenAssetURL != nil && *row.UpTokenAssetURL != "" {
		generationURL = *row.UpTokenAssetURL
	}
	c.JSON(http.StatusCreated, libraryAssetResponse{
		ID:                       row.ID,
		Kind:                     string(row.Kind),
		Filename:                 row.Filename,
		ContentType:              row.ContentType,
		SizeBytes:                row.SizeBytes,
		URL:                      url,
		GenerationURL:            generationURL,
		URLExpires:               time.Now().Add(libraryAssetTTL).UTC(),
		CreatedAt:                row.CreatedAt,
		SeedanceAssetID:          row.UpTokenVirtualID,
		SeedanceAssetURL:         row.UpTokenAssetURL,
		SeedanceAssetStatus:      row.UpTokenStatus,
		SeedanceProcessingStatus: row.UpTokenProcessingStatus,
		SeedanceRejectionReason:  row.UpTokenRejectionReason,
	})
	_ = ct
}

func upTokenAssetStatusUsable(status *string) bool {
	if status == nil {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(*status)) {
	case "active", "ready":
		return true
	default:
		return false
	}
}

func upTokenGenerationURL(asset *uptoken.Asset) string {
	if asset == nil {
		return ""
	}
	if u := strings.TrimSpace(asset.AssetURL); u != "" {
		return u
	}
	return strings.TrimSpace(asset.URL)
}

// DELETE /v1/me/library/assets/:id
func (h *MediaLibraryHandlers) Delete(c *gin.Context) {
	if !h.ready(c) {
		return
	}
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "missing id"}})
		return
	}
	var row domain.MediaAsset
	err := h.DB.WithContext(c.Request.Context()).
		Where("id = ? AND org_id = ?", id, org.ID).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": "lookup failed"}})
		return
	}
	if err := h.DB.WithContext(c.Request.Context()).Delete(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": "delete failed"}})
		return
	}
	if err := h.R2.Delete(c.Request.Context(), row.StorageKey); err != nil {
		// The DB row is already gone; log so an operator can sweep the
		// orphan if it ever matters. Returning 200 keeps the UX simple.
		log.Printf("library: r2 delete failed key=%s err=%v", row.StorageKey, err)
	}
	c.Status(http.StatusNoContent)
}

func (h *MediaLibraryHandlers) ready(c *gin.Context) bool {
	if h == nil || h.DB == nil || h.R2 == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{
			"code":    "uploads_unavailable",
			"message": "asset library is not configured (R2)",
		}})
		return false
	}
	return true
}
