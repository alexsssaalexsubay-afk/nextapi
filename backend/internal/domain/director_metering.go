package domain

import (
	"encoding/json"
	"time"
)

type DirectorMetering struct {
	ID             int64           `gorm:"primaryKey;autoIncrement" json:"id"`
	OrgID          string          `gorm:"type:uuid;not null;index:idx_director_metering_org,priority:1" json:"org_id"`
	DirectorJobID  *string         `gorm:"type:uuid;column:director_job_id" json:"director_job_id,omitempty"`
	StepID         *string         `gorm:"type:uuid;column:step_id" json:"step_id,omitempty"`
	JobID          *string         `gorm:"type:uuid;column:job_id" json:"job_id,omitempty"`
	ProviderID     *string         `gorm:"type:uuid;column:provider_id" json:"provider_id,omitempty"`
	MeterType      string          `gorm:"type:text;not null" json:"meter_type"`
	Units          float64         `gorm:"type:numeric(20,6);not null;default:0" json:"units"`
	EstimatedCents int64           `gorm:"column:estimated_cents;not null;default:0" json:"estimated_cents"`
	ActualCents    int64           `gorm:"column:actual_cents;not null;default:0" json:"actual_cents"`
	CreditsDelta   int64           `gorm:"column:credits_delta;not null;default:0" json:"credits_delta"`
	Status         string          `gorm:"type:text;not null;default:'recorded'" json:"status"`
	UsageJSON      json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"usage_json"`
	CreatedAt      time.Time       `gorm:"index:idx_director_metering_org,priority:2,sort:desc" json:"created_at"`
}

func (DirectorMetering) TableName() string { return "director_metering" }
