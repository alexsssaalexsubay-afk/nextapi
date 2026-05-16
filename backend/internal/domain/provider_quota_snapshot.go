package domain

import (
	"encoding/json"
	"time"
)

type ProviderQuotaSnapshot struct {
	ID              int64           `gorm:"primaryKey;autoIncrement" json:"id"`
	ProviderID      *string         `gorm:"type:uuid;column:provider_id" json:"provider_id,omitempty"`
	Provider        string          `gorm:"type:text;not null;default:''" json:"provider"`
	Scope           string          `gorm:"type:text;not null;default:'account'" json:"scope"`
	Mode            string          `gorm:"type:text;not null;default:'local_ledger'" json:"mode"`
	Currency        string          `gorm:"type:text;not null;default:'USD'" json:"currency"`
	TotalCents      *int64          `gorm:"column:total_cents" json:"total_cents,omitempty"`
	UsedCents       int64           `gorm:"column:used_cents;not null;default:0" json:"used_cents"`
	RemainingCents  *int64          `gorm:"column:remaining_cents" json:"remaining_cents,omitempty"`
	LowBalanceCents *int64          `gorm:"column:low_balance_cents" json:"low_balance_cents,omitempty"`
	PeriodStart     *time.Time      `gorm:"column:period_start" json:"period_start,omitempty"`
	PeriodEnd       *time.Time      `gorm:"column:period_end" json:"period_end,omitempty"`
	Status          string          `gorm:"type:text;not null;default:'recorded'" json:"status"`
	Message         string          `gorm:"type:text;not null;default:''" json:"message"`
	Source          string          `gorm:"type:text;not null;default:''" json:"source"`
	RawJSON         json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"raw_json"`
	CreatedAt       time.Time       `json:"created_at"`
}

func (ProviderQuotaSnapshot) TableName() string { return "provider_quota_snapshots" }
