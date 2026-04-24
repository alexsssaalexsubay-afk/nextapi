package gateway

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/storage/r2"
)

// MediaUploadHandlers optional image upload for dashboard (R2). When R2 is nil, POST /me/uploads/image returns 503.
type MediaUploadHandlers struct{ R2 *r2.Client }

const maxImageUpload = 8 << 20

// PostImage stores an image in R2 and returns a time-limited HTTPS URL suitable for /v1/videos image_url.
func (h *MediaUploadHandlers) PostImage(c *gin.Context) {
	if h == nil || h.R2 == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": gin.H{
				"code":    "uploads_unavailable",
				"message": "image uploads are not configured (R2); paste a public https:// image URL instead",
			},
		})
		return
	}
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if err := c.Request.ParseMultipartForm(maxImageUpload + 1<<20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "expected multipart with field \"file\"",
			},
		})
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "missing file field",
			},
		})
		return
	}
	if fh.Size == 0 || fh.Size > maxImageUpload {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "file must be 1 byte to 8 MB",
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
	data, err := io.ReadAll(io.LimitReader(f, maxImageUpload+1))
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
	if len(data) == 0 || len(data) > maxImageUpload {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "file must be 1 byte to 8 MB",
			},
		})
		return
	}
	ct := http.DetectContentType(data)
	if !strings.HasPrefix(ct, "image/") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "only image uploads are allowed",
			},
		})
		return
	}
	ext := imageExtForMIME(ct)
	if ext == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "invalid_request",
				"message": "unsupported image type",
			},
		})
		return
	}
	key := "uploads/" + org.ID + "/" + uuid.NewString() + ext
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
	url, err := h.R2.PresignGet(c.Request.Context(), key, 7*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "internal_error",
				"message": "failed to sign download URL",
			},
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": url})
}

func imageExtForMIME(ct string) string {
	switch {
	case strings.HasPrefix(ct, "image/jpeg"):
		return ".jpg"
	case strings.HasPrefix(ct, "image/png"):
		return ".png"
	case strings.HasPrefix(ct, "image/gif"):
		return ".gif"
	case strings.HasPrefix(ct, "image/webp"):
		return ".webp"
	default:
		return ""
	}
}