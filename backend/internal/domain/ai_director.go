package domain

import "time"

type AIDirectorEntitlement struct {
	OrgID     string     `gorm:"type:uuid;primaryKey;column:org_id" json:"org_id"`
	Tier      string     `gorm:"type:text;not null;default:'vip'" json:"tier"`
	Enabled   bool       `gorm:"not null;default:true" json:"enabled"`
	ExpiresAt *time.Time `gorm:"column:expires_at" json:"expires_at,omitempty"`
	Note      string     `gorm:"type:text;not null;default:''" json:"note"`
	UpdatedBy string     `gorm:"column:updated_by;not null;default:''" json:"updated_by"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

func (AIDirectorEntitlement) TableName() string { return "ai_director_entitlements" }
