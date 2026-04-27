package domain

import (
	"encoding/json"
	"time"
)

type Template struct {
	ID                     string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrgID                  *string         `gorm:"type:uuid;index" json:"org_id,omitempty"`
	Name                   string          `gorm:"not null" json:"name"`
	Slug                   string          `gorm:"not null;uniqueIndex" json:"slug"`
	Description            *string         `json:"description,omitempty"`
	CoverImageURL          *string         `gorm:"column:cover_image_url" json:"cover_image_url,omitempty"`
	Category               string          `gorm:"not null;default:'general'" json:"category"`
	DefaultModel           string          `gorm:"not null;default:'seedance-2.0-pro'" json:"default_model"`
	DefaultResolution      string          `gorm:"not null;default:'1080p'" json:"default_resolution"`
	DefaultDuration        int             `gorm:"not null;default:5" json:"default_duration"`
	DefaultAspectRatio     string          `gorm:"not null;default:'16:9'" json:"default_aspect_ratio"`
	DefaultMaxParallel     int             `gorm:"not null;default:5" json:"default_max_parallel"`
	InputSchema            json.RawMessage `gorm:"type:jsonb;not null;default:'[]'" json:"input_schema"`
	WorkflowJSON           json.RawMessage `gorm:"type:jsonb;column:workflow_json" json:"workflow_json,omitempty"`
	RecommendedInputSchema json.RawMessage `gorm:"type:jsonb;column:recommended_inputs_schema;not null;default:'[]'" json:"recommended_inputs_schema"`
	DefaultPromptTemplate  *string         `gorm:"column:default_prompt_template" json:"default_prompt_template,omitempty"`
	Visibility             string          `gorm:"not null;default:'private'" json:"visibility"`
	PricingMultiplier      float64         `gorm:"type:numeric(4,2);not null;default:1.00" json:"pricing_multiplier"`
	PreviewVideoURL        *string         `gorm:"column:preview_video_url" json:"preview_video_url,omitempty"`
	EstimatedCostCents     *int64          `gorm:"column:estimated_cost_cents" json:"estimated_cost_cents,omitempty"`
	UsageCount             int64           `gorm:"not null;default:0" json:"usage_count"`
	CreatedAt              time.Time       `json:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

func (Template) TableName() string { return "templates" }
