package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMediaLibraryListSupportsGeneratedMediaKinds(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupMediaLibraryDB(t)
	orgID := "11111111-1111-1111-1111-111111111111"
	otherOrgID := "22222222-2222-2222-2222-222222222222"
	now := time.Date(2026, 4, 29, 10, 0, 0, 0, time.UTC)
	active := "active"
	if err := db.Create(&[]domain.MediaAsset{
		{
			ID:              "33333333-3333-3333-3333-333333333333",
			OrgID:           orgID,
			Kind:            domain.MediaAssetImage,
			StorageKey:      "library/org/reference.png",
			ContentType:     "image/png",
			Filename:        "reference.png",
			SizeBytes:       123,
			CreatedAt:       now.Add(-3 * time.Minute),
			UpTokenStatus:   &active,
			UpTokenAssetURL: mediaLibraryStringPtr("https://seedance.example/reference.png"),
		},
		{
			ID:          "44444444-4444-4444-4444-444444444444",
			OrgID:       orgID,
			Kind:        domain.MediaAssetVideo,
			StorageKey:  "merges/org/final.mp4",
			ContentType: "video/mp4",
			Filename:    "director-final.mp4",
			SizeBytes:   456,
			CreatedAt:   now.Add(-2 * time.Minute),
		},
		{
			ID:          "55555555-5555-5555-5555-555555555555",
			OrgID:       orgID,
			Kind:        domain.MediaAssetAudio,
			StorageKey:  "library/org/voice.mp3",
			ContentType: "audio/mpeg",
			Filename:    "voice.mp3",
			SizeBytes:   789,
			CreatedAt:   now.Add(-1 * time.Minute),
		},
		{
			ID:          "66666666-6666-6666-6666-666666666666",
			OrgID:       otherOrgID,
			Kind:        domain.MediaAssetVideo,
			StorageKey:  "merges/other/final.mp4",
			ContentType: "video/mp4",
			Filename:    "other.mp4",
			SizeBytes:   999,
			CreatedAt:   now,
		},
	}).Error; err != nil {
		t.Fatalf("create media assets: %v", err)
	}
	h := &MediaLibraryHandlers{DB: db, R2: fakeMediaLibraryStorage{}}

	defaultBody := listMediaLibraryAssets(t, h, orgID, "")
	if len(defaultBody.Assets) != 1 || defaultBody.Assets[0].Kind != "image" || defaultBody.Assets[0].GenerationURL != "https://seedance.example/reference.png" {
		t.Fatalf("default list should return active image assets only, got %#v", defaultBody.Assets)
	}

	videoBody := listMediaLibraryAssets(t, h, orgID, "video")
	if len(videoBody.Assets) != 1 || videoBody.Assets[0].ID != "44444444-4444-4444-4444-444444444444" || !strings.Contains(videoBody.Assets[0].URL, "merges/org/final.mp4") {
		t.Fatalf("video list should return org-scoped final video asset, got %#v", videoBody.Assets)
	}

	allBody := listMediaLibraryAssets(t, h, orgID, "all")
	if len(allBody.Assets) != 3 {
		t.Fatalf("all list should include image, video, and audio for the org, got %#v", allBody.Assets)
	}

	invalidBody := listMediaLibraryAssets(t, h, orgID, "document")
	if len(invalidBody.Assets) != 0 {
		t.Fatalf("invalid kind should return empty assets, got %#v", invalidBody.Assets)
	}
}

func listMediaLibraryAssets(t *testing.T, h *MediaLibraryHandlers, orgID string, kind string) mediaLibraryListResponse {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	target := "/v1/me/library/assets"
	if kind != "" {
		target += "?kind=" + kind
	}
	c.Request = httptest.NewRequest(http.MethodGet, target, nil)
	auth.SetOrg(c, &domain.Org{ID: orgID})

	h.List(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body mediaLibraryListResponse
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return body
}

type mediaLibraryListResponse struct {
	Assets     []libraryAssetResponse `json:"assets"`
	TTLSeconds int                    `json:"ttl_seconds"`
}

type fakeMediaLibraryStorage struct{}

func (fakeMediaLibraryStorage) Upload(context.Context, string, io.Reader, string) error {
	return nil
}

func (fakeMediaLibraryStorage) Delete(context.Context, string) error {
	return nil
}

func (fakeMediaLibraryStorage) PresignGet(_ context.Context, key string, _ time.Duration) (string, error) {
	return "https://cdn.example/" + key, nil
}

func setupMediaLibraryDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	stmt := `CREATE TABLE media_assets (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		storage_key TEXT NOT NULL,
		content_type TEXT NOT NULL,
		filename TEXT,
		size_bytes BIGINT NOT NULL DEFAULT 0,
		created_at DATETIME,
		uptoken_virtual_id TEXT,
		uptoken_asset_url TEXT,
		uptoken_status TEXT
	)`
	if err := db.Exec(stmt).Error; err != nil {
		t.Fatalf("create media_assets table: %v", err)
	}
	return db
}

func mediaLibraryStringPtr(value string) *string {
	return &value
}
