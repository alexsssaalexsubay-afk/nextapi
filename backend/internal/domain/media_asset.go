package domain

import "time"

// MediaAssetKind enumerates the asset categories the asset library accepts.
// Mirrors the kinds that the temp-upload endpoint handles so a customer can
// promote a temp upload into the library without reformatting.
type MediaAssetKind string

const (
	MediaAssetImage MediaAssetKind = "image"
	MediaAssetVideo MediaAssetKind = "video"
	MediaAssetAudio MediaAssetKind = "audio"
)

// MediaAsset is a long-lived reusable upload that lives outside the temp R2
// prefix. The dashboard surfaces these as the "asset library" so customers can
// reuse the same reference image / video / voiceover across many generations
// without re-uploading and without risking a 7-day temp expiry mid-batch.
//
// Keep this table small: enforce per-org caps in the handler so we do not let
// a single account fill the bucket. We also store enough metadata (kind,
// content_type, size) for the UI to render previews without round-tripping R2.
type MediaAsset struct {
	ID          string         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrgID       string         `gorm:"type:uuid;not null;index" json:"-"`
	Kind        MediaAssetKind `gorm:"type:text;not null" json:"kind"`
	StorageKey  string         `gorm:"type:text;not null" json:"-"`
	ContentType string         `gorm:"type:text;not null" json:"content_type"`
	Filename    string         `gorm:"type:text" json:"filename"`
	SizeBytes   int64          `json:"size_bytes"`
	CreatedAt   time.Time      `json:"created_at"`

	UpTokenVirtualID        *string `gorm:"column:uptoken_virtual_id" json:"uptoken_virtual_id,omitempty"`
	UpTokenAssetURL         *string `gorm:"column:uptoken_asset_url" json:"uptoken_asset_url,omitempty"`
	UpTokenStatus           *string `gorm:"column:uptoken_status" json:"uptoken_status,omitempty"`
	UpTokenProcessingStatus *string `gorm:"column:uptoken_processing_status" json:"uptoken_processing_status,omitempty"`
	UpTokenRejectionReason  *string `gorm:"column:uptoken_rejection_reason" json:"uptoken_rejection_reason,omitempty"`
}

// TableName lets GORM use the snake_case table name without auto-pluralising
// "MediaAsset" into "media_assets" (which is fine here; we set it explicitly
// for clarity and so future renames stay obvious).
func (MediaAsset) TableName() string { return "media_assets" }
