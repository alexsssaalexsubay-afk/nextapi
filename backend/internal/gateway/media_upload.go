package gateway

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/storage/r2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// MediaUploadHandlers optional image upload for dashboard (R2). When R2 is nil, POST /me/uploads/image returns 503.
type MediaUploadHandlers struct{ R2 *r2.Client }

const (
	maxImageUpload = 30 << 20
	maxVideoUpload = 50 << 20
	maxAudioUpload = 15 << 20
)

// PostImage stores an image in R2 and returns a time-limited HTTPS URL suitable for /v1/videos image_url.
func (h *MediaUploadHandlers) PostImage(c *gin.Context) {
	h.postMedia(c, "image")
}

// PostMedia stores a temporary image/video/audio object in R2 and returns a 7-day URL.
func (h *MediaUploadHandlers) PostMedia(c *gin.Context) {
	h.postMedia(c, "")
}

func (h *MediaUploadHandlers) postMedia(c *gin.Context, forcedKind string) {
	if h == nil || h.R2 == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": gin.H{
				"code":    "uploads_unavailable",
				"message": "temporary uploads are not configured (R2); paste a public https:// media URL instead",
			},
		})
		return
	}
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if err := c.Request.ParseMultipartForm(maxVideoUpload + 1<<20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "expected multipart/form-data upload with field \"file\"",
			},
		})
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
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "missing multipart file field; use field name \"file\"",
			},
		})
		return
	}
	if fh.Size == 0 || fh.Size > maxVideoUpload {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "file must be 1 byte to 50 MB",
			},
		})
		return
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "failed to read file",
			},
		})
		return
	}
	data, err := io.ReadAll(io.LimitReader(f, maxVideoUpload+1))
	_ = f.Close()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "internal_error",
				"message": "read failed",
			},
		})
		return
	}
	if len(data) == 0 || len(data) > maxVideoUpload {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "file must be 1 byte to 50 MB",
			},
		})
		return
	}
	ct := http.DetectContentType(data)
	if ct == "application/octet-stream" || ct == "text/plain; charset=utf-8" {
		if headerCT := strings.TrimSpace(fh.Header.Get("Content-Type")); headerCT != "" {
			ct = headerCT
		}
	}
	kind, maxBytes := mediaKindAndLimit(ct)
	if forcedKind != "" && kind != forcedKind {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "only " + forcedKind + " uploads are allowed",
			},
		})
		return
	}
	if kind == "" || maxBytes == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "unsupported media type",
			},
		})
		return
	}
	if len(data) > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": kind + " exceeds upload size limit",
			},
		})
		return
	}
	ext := mediaExtForMIME(ct)
	key := "temp/" + org.ID + "/" + uuid.NewString() + ext
	if err := h.R2.Upload(c.Request.Context(), key, bytes.NewReader(data), ct); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "internal_error",
				"message": "storage upload failed",
			},
		})
		return
	}
	// 7d is enough to create a job and for upstream to fetch; keeps signed URLs from living forever.
	ttl := 7 * 24 * time.Hour
	url, err := h.R2.PresignGet(c.Request.Context(), key, ttl)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "internal_error",
				"message": "failed to sign download URL",
			},
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"url":          url,
		"key":          key,
		"kind":         kind,
		"content_type": ct,
		"size":         len(data),
		"storage":      "temporary_r2",
		"expires_at":   time.Now().Add(ttl).UTC().Format(time.RFC3339),
		"ttl_seconds":  int(ttl.Seconds()),
	})
}

func mediaKindAndLimit(ct string) (string, int) {
	switch {
	case strings.HasPrefix(ct, "image/"):
		return "image", maxImageUpload
	case strings.HasPrefix(ct, "video/"):
		return "video", maxVideoUpload
	case strings.HasPrefix(ct, "audio/"):
		return "audio", maxAudioUpload
	default:
		return "", 0
	}
}

func mediaExtForMIME(ct string) string {
	switch {
	case strings.HasPrefix(ct, "image/jpeg"):
		return ".jpg"
	case strings.HasPrefix(ct, "image/png"):
		return ".png"
	case strings.HasPrefix(ct, "image/gif"):
		return ".gif"
	case strings.HasPrefix(ct, "image/webp"):
		return ".webp"
	case strings.Contains(ct, "mp4"):
		return ".mp4"
	case strings.Contains(ct, "quicktime"):
		return ".mov"
	case strings.Contains(ct, "mpeg"):
		return ".mp3"
	case strings.Contains(ct, "wav"):
		return ".wav"
	case strings.Contains(ct, "aac"):
		return ".aac"
	default:
		return ".bin"
	}
}
