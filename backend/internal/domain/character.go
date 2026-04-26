package domain

import (
	"encoding/json"
	"time"
)

// Character is a reusable set of reference images for template inputs. It does
// not call providers or create embeddings in v0.3.
type Character struct {
	ID              string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrgID           string          `gorm:"type:uuid;not null;index" json:"-"`
	Name            string          `gorm:"not null" json:"name"`
	ReferenceImages json.RawMessage `gorm:"type:jsonb;not null;default:'[]'" json:"reference_images"`
	Metadata        json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"metadata"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

func (Character) TableName() string { return "characters" }
