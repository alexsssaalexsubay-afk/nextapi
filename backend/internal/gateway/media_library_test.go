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
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/uptoken"
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

func TestMediaLibraryListResponseExcludesSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupMediaLibraryDB(t)
	orgID := "11111111-1111-1111-1111-111111111111"
	now := time.Date(2026, 4, 29, 10, 0, 0, 0, time.UTC)
	active := "active"
	if err := db.Create(&[]domain.MediaAsset{
		{
			ID:               "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
			OrgID:            orgID,
			Kind:             domain.MediaAssetImage,
			StorageKey:       "library/org/ref.png",
			ContentType:      "image/png",
			Filename:         "ref.png",
			SizeBytes:        100,
			CreatedAt:        now,
			UpTokenVirtualID: mediaLibraryStringPtr("seedance-internal-id"),
			UpTokenAssetURL:  mediaLibraryStringPtr("https://seedance.internal/asset"),
			UpTokenStatus:    &active,
		},
		{
			ID:          "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
			OrgID:       orgID,
			Kind:        domain.MediaAssetVideo,
			StorageKey:  "merges/org/final-merged.mp4",
			ContentType: "video/mp4",
			Filename:    "director-merged-xxx.mp4",
			SizeBytes:   99999,
			CreatedAt:   now,
		},
	}).Error; err != nil {
		t.Fatalf("create media assets: %v", err)
	}
	h := &MediaLibraryHandlers{DB: db, R2: fakeMediaLibraryStorage{}}

	allBody := listMediaLibraryAssetsRaw(t, h, orgID, "all")
	for i, asset := range allBody.Assets {
		if asset.StorageKey != "" {
			t.Errorf("asset[%d] storage_key exposed: %q", i, asset.StorageKey)
		}
		if asset.OrgID != "" {
			t.Errorf("asset[%d] org_id exposed: %q", i, asset.OrgID)
		}
		if asset.Kind == "video" {
			if asset.SeedanceAssetID != nil && *asset.SeedanceAssetID != "" {
				t.Errorf("video asset[%d] seedance_asset_id should be nil/empty, got %q", i, *asset.SeedanceAssetID)
			}
			if asset.SeedanceAssetURL != nil && *asset.SeedanceAssetURL != "" {
				t.Errorf("video asset[%d] seedance_asset_url should be nil/empty, got %q", i, *asset.SeedanceAssetURL)
			}
			if asset.SeedanceAssetStatus != nil && *asset.SeedanceAssetStatus != "" {
				t.Errorf("video asset[%d] seedance_asset_status should be nil/empty, got %q", i, *asset.SeedanceAssetStatus)
			}
		}
	}

	videoBody := listMediaLibraryAssetsRaw(t, h, orgID, "video")
	if len(videoBody.Assets) != 1 {
		t.Fatalf("video list should return 1 asset, got %d", len(videoBody.Assets))
	}
	v := videoBody.Assets[0]
	if v.StorageKey != "" {
		t.Errorf("video response storage_key exposed: %q", v.StorageKey)
	}
	if v.OrgID != "" {
		t.Errorf("video response org_id exposed: %q", v.OrgID)
	}
	if v.URL == "" || !strings.Contains(v.URL, "merges/org/final-merged.mp4") {
		t.Errorf("video URL should contain merge storage path, got %q", v.URL)
	}
}

func TestMediaLibraryListRefreshesProcessingUpTokenAsset(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupMediaLibraryDB(t)
	orgID := "11111111-1111-1111-1111-111111111111"
	processing := "processing"
	if err := db.Create(&domain.MediaAsset{
		ID:               "77777777-7777-7777-7777-777777777777",
		OrgID:            orgID,
		Kind:             domain.MediaAssetImage,
		StorageKey:       "library/org/real-person.png",
		ContentType:      "image/png",
		Filename:         "real-person.png",
		SizeBytes:        100,
		CreatedAt:        time.Date(2026, 4, 30, 6, 0, 0, 0, time.UTC),
		UpTokenVirtualID: mediaLibraryStringPtr("ut-asset-real-person"),
		UpTokenStatus:    &processing,
	}).Error; err != nil {
		t.Fatalf("create media asset: %v", err)
	}
	h := &MediaLibraryHandlers{
		DB: db,
		R2: fakeMediaLibraryStorage{},
		UpTokenAssets: fakeUpTokenAssetProvider{
			assets: map[string]*uptoken.Asset{
				"ut-asset-real-person": {
					VirtualID: "ut-asset-real-person",
					AssetURL:  "asset://ut-asset-real-person",
					Status:    "active",
				},
			},
		},
	}

	body := listMediaLibraryAssets(t, h, orgID, "")
	if len(body.Assets) != 1 {
		t.Fatalf("expected one asset, got %#v", body.Assets)
	}
	if body.Assets[0].GenerationURL != "asset://ut-asset-real-person" {
		t.Fatalf("generation_url = %q; want refreshed asset URL", body.Assets[0].GenerationURL)
	}
	if body.Assets[0].SeedanceAssetStatus == nil || *body.Assets[0].SeedanceAssetStatus != "active" {
		t.Fatalf("seedance_asset_status = %+v; want active", body.Assets[0].SeedanceAssetStatus)
	}

	var row domain.MediaAsset
	if err := db.First(&row, "id = ?", "77777777-7777-7777-7777-777777777777").Error; err != nil {
		t.Fatalf("reload row: %v", err)
	}
	if row.UpTokenStatus == nil || *row.UpTokenStatus != "active" {
		t.Fatalf("persisted status = %+v; want active", row.UpTokenStatus)
	}
	if row.UpTokenAssetURL == nil || *row.UpTokenAssetURL != "asset://ut-asset-real-person" {
		t.Fatalf("persisted asset url = %+v; want asset URL", row.UpTokenAssetURL)
	}
}

func TestMediaLibraryListDefaultBackwardCompat(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupMediaLibraryDB(t)
	orgID := "11111111-1111-1111-1111-111111111111"
	now := time.Date(2026, 4, 29, 10, 0, 0, 0, time.UTC)
	if err := db.Create(&[]domain.MediaAsset{
		{
			ID:          "cccccccc-cccc-cccc-cccc-cccccccccccc",
			OrgID:       orgID,
			Kind:        domain.MediaAssetImage,
			StorageKey:  "library/org/img1.png",
			ContentType: "image/png",
			Filename:    "img1.png",
			SizeBytes:   100,
			CreatedAt:   now,
		},
		{
			ID:          "dddddddd-dddd-dddd-dddd-dddddddddddd",
			OrgID:       orgID,
			Kind:        domain.MediaAssetVideo,
			StorageKey:  "merges/org/final.mp4",
			ContentType: "video/mp4",
			Filename:    "final.mp4",
			SizeBytes:   500,
			CreatedAt:   now.Add(-1 * time.Minute),
		},
		{
			ID:          "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
			OrgID:       orgID,
			Kind:        domain.MediaAssetImage,
			StorageKey:  "library/org/img2.jpg",
			ContentType: "image/jpeg",
			Filename:    "img2.jpg",
			SizeBytes:   200,
			CreatedAt:   now.Add(-2 * time.Minute),
		},
	}).Error; err != nil {
		t.Fatalf("create media assets: %v", err)
	}
	h := &MediaLibraryHandlers{DB: db, R2: fakeMediaLibraryStorage{}}

	noKindBody := listMediaLibraryAssets(t, h, orgID, "")
	if len(noKindBody.Assets) != 2 {
		t.Fatalf("default (no kind) should return images only, got %d assets", len(noKindBody.Assets))
	}
	for _, a := range noKindBody.Assets {
		if a.Kind != "image" {
			t.Errorf("default list should only contain images, got kind=%q", a.Kind)
		}
	}

	imageBody := listMediaLibraryAssets(t, h, orgID, "image")
	if len(imageBody.Assets) != 2 {
		t.Fatalf("explicit image kind should return 2 images, got %d", len(imageBody.Assets))
	}

	allBody := listMediaLibraryAssets(t, h, orgID, "all")
	if len(allBody.Assets) != 3 {
		t.Fatalf("all kind should return 3 assets (2 images + 1 video), got %d", len(allBody.Assets))
	}
	hasVideo := false
	for _, a := range allBody.Assets {
		if a.Kind == "video" {
			hasVideo = true
		}
	}
	if !hasVideo {
		t.Fatal("all list should include the final_asset video")
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

type fakeUpTokenAssetProvider struct {
	assets map[string]*uptoken.Asset
}

func (f fakeUpTokenAssetProvider) UploadAsset(context.Context, string, string, []byte) (*uptoken.Asset, error) {
	return nil, nil
}

func (f fakeUpTokenAssetProvider) GetAsset(_ context.Context, virtualID string) (*uptoken.Asset, error) {
	return f.assets[virtualID], nil
}

func (f fakeUpTokenAssetProvider) WaitAssetActive(context.Context, string, time.Duration) (*uptoken.Asset, error) {
	return nil, nil
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

type mediaLibraryAssetResponseRaw struct {
	ID                  string  `json:"id"`
	Kind                string  `json:"kind"`
	Filename            string  `json:"filename"`
	ContentType         string  `json:"content_type"`
	SizeBytes           int64   `json:"size_bytes"`
	URL                 string  `json:"url"`
	GenerationURL       string  `json:"generation_url"`
	CreatedAt           string  `json:"created_at"`
	StorageKey          string  `json:"storage_key"`
	OrgID               string  `json:"org_id"`
	SeedanceAssetID     *string `json:"seedance_asset_id"`
	SeedanceAssetURL    *string `json:"seedance_asset_url"`
	SeedanceAssetStatus *string `json:"seedance_asset_status"`
}

type mediaLibraryListResponseRaw struct {
	Assets     []mediaLibraryAssetResponseRaw `json:"assets"`
	TTLSeconds int                            `json:"ttl_seconds"`
}

func listMediaLibraryAssetsRaw(t *testing.T, h *MediaLibraryHandlers, orgID string, kind string) mediaLibraryListResponseRaw {
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
	var body mediaLibraryListResponseRaw
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return body
}

func mediaLibraryStringPtr(value string) *string {
	return &value
}
