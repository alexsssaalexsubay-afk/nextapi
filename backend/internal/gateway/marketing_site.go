package gateway

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/abuse"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/storage/r2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const marketingPresignTTL = 24 * time.Hour

// marketingSiteSlotsR2Prefix is the only R2 key prefix the public marketing
// endpoint will presign. This prevents accidental exposure of customer job
// objects if a non-CMS key is written to marketing_site_slots.
const marketingSiteSlotsR2Prefix = "marketing/site-slots/"

var marketingSlotKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]{1,48}$`)

func marketingSiteAllowedObjectKey(key string) bool {
	k := strings.TrimSpace(strings.ReplaceAll(key, "\\", "/"))
	for strings.HasPrefix(k, "/") {
		k = strings.TrimPrefix(k, "/")
	}
	if k == "" || strings.Contains(k, "..") {
		return false
	}
	return strings.HasPrefix(k, marketingSiteSlotsR2Prefix)
}

// MarketingSiteHandlers serves public read models for nextapi.top and
// operator-only writes for homepage media slots.
type MarketingSiteHandlers struct {
	DB *gorm.DB
	R2 *r2.Client
}

type marketingSlotPublic struct {
	SlotKey   string  `json:"slot_key"`
	MediaKind string  `json:"media_kind"`
	URL       string  `json:"url"`
	PosterURL *string `json:"poster_url,omitempty"`
	UpdatedAt string  `json:"updated_at"`
}

func (h *MarketingSiteHandlers) readyDB(c *gin.Context) bool {
	if h == nil || h.DB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "service_unavailable"}})
		return false
	}
	return true
}

func (h *MarketingSiteHandlers) resolveURL(c *gin.Context, r2Key *string, extURL *string) (string, error) {
	if extURL != nil && strings.TrimSpace(*extURL) != "" {
		u := strings.TrimSpace(*extURL)
		if err := validateHTTPS(u); err != nil {
			return "", err
		}
		return u, nil
	}
	if r2Key == nil || strings.TrimSpace(*r2Key) == "" {
		return "", nil
	}
	if h.R2 == nil {
		return "", errors.New("r2 unavailable")
	}
	return h.R2.PresignGet(c.Request.Context(), strings.TrimSpace(*r2Key), marketingPresignTTL)
}

func (h *MarketingSiteHandlers) PublicListSlots(c *gin.Context) {
	if !h.readyDB(c) {
		return
	}
	var rows []domain.MarketingSiteSlot
	if err := h.DB.WithContext(c.Request.Context()).Order("slot_key ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	out := make([]marketingSlotPublic, 0, len(rows))
	for _, row := range rows {
		if row.URLR2Key != nil && strings.TrimSpace(*row.URLR2Key) != "" {
			if !marketingSiteAllowedObjectKey(*row.URLR2Key) {
				continue
			}
		}
		u, err := h.resolveURL(c, row.URLR2Key, row.URLExternal)
		if err != nil || u == "" {
			continue
		}
		var poster *string
		if row.PosterR2Key != nil && strings.TrimSpace(*row.PosterR2Key) != "" {
			if !marketingSiteAllowedObjectKey(*row.PosterR2Key) {
				poster = nil
			} else if p, err := h.resolveURL(c, row.PosterR2Key, row.PosterExternal); err == nil && p != "" {
				poster = &p
			}
		} else if p, err := h.resolveURL(c, row.PosterR2Key, row.PosterExternal); err == nil && p != "" {
			poster = &p
		}
		out = append(out, marketingSlotPublic{
			SlotKey:   row.SlotKey,
			MediaKind: row.MediaKind,
			URL:       u,
			PosterURL: poster,
			UpdatedAt: row.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, gin.H{"slots": out})
}

// --- Internal admin ---

type marketingPutBody struct {
	MediaKind      string  `json:"media_kind"`
	URLExternal    *string `json:"url"`
	PosterExternal *string `json:"poster_url"`
	ClearPoster    bool    `json:"clear_poster"`
}

func (h *MarketingSiteHandlers) AdminListSlots(c *gin.Context) {
	if !h.readyDB(c) {
		return
	}
	var rows []domain.MarketingSiteSlot
	if err := h.DB.WithContext(c.Request.Context()).Order("slot_key ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	type rowOut struct {
		SlotKey   string  `json:"slot_key"`
		MediaKind string  `json:"media_kind"`
		URL       string  `json:"url"`
		PosterURL *string `json:"poster_url,omitempty"`
		Source    string  `json:"source"`
		UpdatedAt string  `json:"updated_at"`
	}
	out := make([]rowOut, 0, len(rows))
	for _, row := range rows {
		var u string
		var err error
		src := "external"
		if row.URLR2Key != nil && strings.TrimSpace(*row.URLR2Key) != "" {
			if !marketingSiteAllowedObjectKey(*row.URLR2Key) {
				out = append(out, rowOut{
					SlotKey:   row.SlotKey,
					MediaKind: row.MediaKind,
					URL:       "",
					PosterURL: nil,
					Source:    "r2_non_cms",
					UpdatedAt: row.UpdatedAt.UTC().Format(time.RFC3339),
				})
				continue
			}
			src = "r2"
		}
		u, err = h.resolveURL(c, row.URLR2Key, row.URLExternal)
		if err != nil || u == "" {
			continue
		}
		var poster *string
		if row.PosterR2Key != nil && strings.TrimSpace(*row.PosterR2Key) != "" {
			if marketingSiteAllowedObjectKey(*row.PosterR2Key) {
				if p, err := h.resolveURL(c, row.PosterR2Key, row.PosterExternal); err == nil && p != "" {
					poster = &p
				}
			}
		} else {
			if p, err := h.resolveURL(c, row.PosterR2Key, row.PosterExternal); err == nil && p != "" {
				poster = &p
			}
		}
		out = append(out, rowOut{
			SlotKey:   row.SlotKey,
			MediaKind: row.MediaKind,
			URL:       u,
			PosterURL: poster,
			Source:    src,
			UpdatedAt: row.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, gin.H{"slots": out})
}

func validateHTTPS(u string) error {
	s := strings.TrimSpace(u)
	if s == "" {
		return nil
	}
	if err := abuse.ValidatePublicURL(s); err != nil {
		return err
	}
	if !strings.HasPrefix(strings.ToLower(s), "https://") {
		return errors.New("only https URLs are accepted")
	}
	return nil
}

func (h *MarketingSiteHandlers) AdminPutExternal(c *gin.Context) {
	if !h.readyDB(c) {
		return
	}
	slot := strings.TrimSpace(c.Param("slot"))
	if !marketingSlotKeyRe.MatchString(slot) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid slot key"}})
		return
	}
	var body marketingPutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	kind := strings.TrimSpace(strings.ToLower(body.MediaKind))
	if kind != "image" && kind != "video" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "media_kind must be image or video"}})
		return
	}
	if body.URLExternal == nil || strings.TrimSpace(*body.URLExternal) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "url is required"}})
		return
	}
	main := strings.TrimSpace(*body.URLExternal)
	if err := validateHTTPS(main); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "url must be a public https URL"}})
		return
	}
	var posterR2, posterExt *string
	if body.ClearPoster {
		posterR2, posterExt = nil, nil
	} else if body.PosterExternal != nil && strings.TrimSpace(*body.PosterExternal) != "" {
		p := strings.TrimSpace(*body.PosterExternal)
		if err := validateHTTPS(p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "poster_url must be https"}})
			return
		}
		posterExt = &p
	}
	row := domain.MarketingSiteSlot{
		SlotKey:        slot,
		MediaKind:      kind,
		URLR2Key:       nil,
		URLExternal:    &main,
		PosterR2Key:    posterR2,
		PosterExternal: posterExt,
		UpdatedAt:      time.Now(),
	}
	if err := h.DB.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "slot_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"media_kind", "url_r2_key", "url_external", "poster_r2_key", "poster_external", "updated_at"}),
	}).Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *MarketingSiteHandlers) AdminUploadSlot(c *gin.Context) {
	if !h.readyDB(c) {
		return
	}
	if h.R2 == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "uploads_unavailable", "message": "R2 is not configured"}})
		return
	}
	slot := strings.TrimSpace(c.Param("slot"))
	if !marketingSlotKeyRe.MatchString(slot) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid slot key"}})
		return
	}
	kind := strings.TrimSpace(strings.ToLower(c.PostForm("media_kind")))
	if kind != "image" && kind != "video" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "media_kind must be image or video"}})
		return
	}
	if err := c.Request.ParseMultipartForm(maxVideoUpload + 1<<20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "expected multipart/form-data"}})
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "missing file field"}})
		return
	}
	if fh.Size == 0 || fh.Size > maxVideoUpload {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "file size invalid"}})
		return
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "failed to read file"}})
		return
	}
	data, err := io.ReadAll(io.LimitReader(f, maxVideoUpload+1))
	_ = f.Close()
	if err != nil || len(data) == 0 || len(data) > maxVideoUpload {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "read failed"}})
		return
	}
	ct := http.DetectContentType(data)
	if ct == "application/octet-stream" || ct == "text/plain; charset=utf-8" {
		if headerCT := strings.TrimSpace(fh.Header.Get("Content-Type")); headerCT != "" {
			ct = headerCT
		}
	}
	detectedKind, maxBytes := mediaKindAndLimit(ct)
	if detectedKind != kind {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "file content type does not match media_kind"}})
		return
	}
	if len(data) > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "file exceeds size limit"}})
		return
	}
	ext := mediaExtForMIME(ct)
	mainKey := "marketing/site-slots/" + slot + "/" + uuid.NewString() + ext
	if err := h.R2.Upload(c.Request.Context(), mainKey, bytes.NewReader(data), ct); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": "storage upload failed"}})
		return
	}
	var posterR2 *string
	if kind == "video" {
		if pf, perr := c.FormFile("poster"); perr == nil && pf != nil {
			if pf.Size > 0 && pf.Size <= maxImageUpload {
				pfOpen, err := pf.Open()
				if err == nil {
					pData, _ := io.ReadAll(io.LimitReader(pfOpen, maxImageUpload+1))
					_ = pfOpen.Close()
					pct := http.DetectContentType(pData)
					if strings.HasPrefix(pct, "image/") && len(pData) <= maxImageUpload {
						pext := mediaExtForMIME(pct)
						pkey := "marketing/site-slots/" + slot + "/poster-" + uuid.NewString() + pext
						if err := h.R2.Upload(c.Request.Context(), pkey, bytes.NewReader(pData), pct); err == nil {
							posterR2 = &pkey
						}
					}
				}
			}
		}
	}
	row := domain.MarketingSiteSlot{
		SlotKey:        slot,
		MediaKind:      kind,
		URLR2Key:       &mainKey,
		URLExternal:    nil,
		PosterR2Key:    posterR2,
		PosterExternal: nil,
		UpdatedAt:      time.Now(),
	}
	if err := h.DB.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "slot_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"media_kind", "url_r2_key", "url_external", "poster_r2_key", "poster_external", "updated_at"}),
	}).Create(&row).Error; err != nil {
		_ = h.R2.Delete(c.Request.Context(), mainKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "storage_key": mainKey})
}

func (h *MarketingSiteHandlers) AdminDeleteSlot(c *gin.Context) {
	if !h.readyDB(c) {
		return
	}
	slot := strings.TrimSpace(c.Param("slot"))
	if !marketingSlotKeyRe.MatchString(slot) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid slot key"}})
		return
	}
	var row domain.MarketingSiteSlot
	if err := h.DB.WithContext(c.Request.Context()).First(&row, "slot_key = ?", slot).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.Status(http.StatusNoContent)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	if h.R2 != nil {
		if row.URLR2Key != nil {
			_ = h.R2.Delete(c.Request.Context(), *row.URLR2Key)
		}
		if row.PosterR2Key != nil {
			_ = h.R2.Delete(c.Request.Context(), *row.PosterR2Key)
		}
	}
	if err := h.DB.WithContext(c.Request.Context()).Delete(&domain.MarketingSiteSlot{}, "slot_key = ?", slot).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.Status(http.StatusNoContent)
}
