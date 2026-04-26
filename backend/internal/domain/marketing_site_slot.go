package domain

import "time"

// MarketingSiteSlot stores CMS-style media for the public marketing site
// (nextapi.top). URLs are either an R2 object key (presigned on read) or a
// stable public https:// URL managed by operators.
type MarketingSiteSlot struct {
	SlotKey         string    `gorm:"type:varchar(64);primaryKey" json:"slot_key"`
	MediaKind       string    `gorm:"type:varchar(16);not null" json:"media_kind"`
	URLR2Key        *string   `gorm:"type:text" json:"-"`
	URLExternal     *string   `gorm:"type:text" json:"-"`
	PosterR2Key     *string   `gorm:"type:text" json:"-"`
	PosterExternal  *string   `gorm:"type:text" json:"-"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (MarketingSiteSlot) TableName() string { return "marketing_site_slots" }
