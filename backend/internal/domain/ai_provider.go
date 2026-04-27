package domain

import (
	"encoding/json"
	"time"
)

const (
	AIProviderTypeText  = "text"
	AIProviderTypeImage = "image"
	AIProviderTypeVideo = "video"
)

type AIProvider struct {
	ID              string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name            string          `gorm:"not null" json:"name"`
	Type            string          `gorm:"type:text;not null" json:"type"`
	Provider        string          `gorm:"type:text;not null" json:"provider"`
	BaseURL         string          `gorm:"column:base_url;not null;default:''" json:"base_url"`
	APIKeyEncrypted string          `gorm:"column:api_key_encrypted;not null;default:''" json:"-"`
	KeyHint         string          `gorm:"column:key_hint;not null;default:''" json:"key_hint"`
	Model           string          `gorm:"type:text;not null;default:''" json:"model"`
	Enabled         bool            `gorm:"not null;default:true" json:"enabled"`
	IsDefault       bool            `gorm:"column:is_default;not null;default:false" json:"is_default"`
	ConfigJSON      json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"config_json"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

func (AIProvider) TableName() string { return "ai_providers" }

type AIProviderLog struct {
	ID              int64           `gorm:"primaryKey;autoIncrement" json:"id"`
	ProviderID      *string         `gorm:"type:uuid;column:provider_id" json:"provider_id,omitempty"`
	UserID          string          `gorm:"column:user_id;not null;default:''" json:"user_id"`
	OrgID           *string         `gorm:"type:uuid;column:org_id" json:"org_id,omitempty"`
	Type            string          `gorm:"type:text;not null" json:"type"`
	RequestSummary  string          `gorm:"column:request_summary;not null;default:''" json:"request_summary"`
	ResponseSummary string          `gorm:"column:response_summary;not null;default:''" json:"response_summary"`
	UsageJSON       json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"usage_json"`
	Error           string          `gorm:"type:text;not null;default:''" json:"error"`
	CreatedAt       time.Time       `json:"created_at"`
}

func (AIProviderLog) TableName() string { return "ai_provider_logs" }
