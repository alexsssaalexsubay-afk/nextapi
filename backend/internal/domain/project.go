package domain

import (
	"encoding/json"
	"time"
)

type Project struct {
	ID          string  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID       string  `gorm:"type:uuid;not null;index"`
	Name        string  `gorm:"not null"`
	Description *string
	Status      string `gorm:"not null;default:'active'"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (Project) TableName() string { return "projects" }

type ProjectAsset struct {
	ID        string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID string          `gorm:"type:uuid;not null;index"`
	Kind      string          `gorm:"not null"` // character, scene, prop, reference
	Name      string          `gorm:"not null"`
	ImageURL  *string         `gorm:"column:image_url"`
	Metadata  json.RawMessage `gorm:"type:jsonb;not null;default:'{}'"`
	SortOrder int             `gorm:"not null;default:0"`
	CreatedAt time.Time
}

func (ProjectAsset) TableName() string { return "project_assets" }
