package domain

import (
	"encoding/json"
	"time"
)

type Template struct {
	ID                    string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID                 *string         `gorm:"type:uuid;index"`
	Name                  string          `gorm:"not null"`
	Slug                  string          `gorm:"not null;uniqueIndex"`
	Description           *string
	CoverImageURL         *string         `gorm:"column:cover_image_url"`
	Category              string          `gorm:"not null;default:'general'"`
	DefaultModel          string          `gorm:"not null;default:'seedance-2.0-pro'"`
	DefaultResolution     string          `gorm:"not null;default:'1080p'"`
	DefaultDuration       int             `gorm:"not null;default:5"`
	DefaultAspectRatio    string          `gorm:"not null;default:'16:9'"`
	DefaultMaxParallel    int             `gorm:"not null;default:5"`
	InputSchema           json.RawMessage `gorm:"type:jsonb;not null;default:'[]'"`
	DefaultPromptTemplate *string         `gorm:"column:default_prompt_template"`
	Visibility            string          `gorm:"not null;default:'private'"`
	PricingMultiplier     float64         `gorm:"type:numeric(4,2);not null;default:1.00"`
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

func (Template) TableName() string { return "templates" }
