package domain

import (
	"encoding/json"
	"time"

	"github.com/lib/pq"
)

type Video struct {
	ID                    string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID                 string          `gorm:"type:uuid;not null;index"`
	APIKeyID              *string         `gorm:"type:uuid"`
	Model                 string          `gorm:"not null"`
	Status                string          `gorm:"not null;default:'queued'"`
	Input                 json.RawMessage `gorm:"type:jsonb;not null"`
	Output                json.RawMessage `gorm:"type:jsonb"`
	Metadata              json.RawMessage `gorm:"type:jsonb;not null;default:'{}'"`
	UpstreamJobID         *string
	UpstreamTokens        *int64
	VideoSeconds          *float64
	EstimatedCostCents    int64 `gorm:"not null"`
	ActualCostCents       *int64
	ReservedCents         int64   `gorm:"not null"`
	UpstreamEstimateCents *int64  `gorm:"column:upstream_estimate_cents"`
	UpstreamActualCents   *int64  `gorm:"column:upstream_actual_cents"`
	MarginCents           *int64  `gorm:"column:margin_cents"`
	PricingMarkupBPS      *int    `gorm:"column:pricing_markup_bps"`
	PricingSource         *string `gorm:"column:pricing_source"`
	ErrorCode             *string
	ErrorMessage          *string
	WebhookURL            *string
	CreatedAt             time.Time
	StartedAt             *time.Time
	FinishedAt            *time.Time
	IdempotencyKey        *string
	RequestID             *string
}

func (Video) TableName() string { return "videos" }

type SpendControls struct {
	OrgID               string `gorm:"type:uuid;primaryKey"`
	HardCapCents        *int64
	SoftAlertCents      *int64
	AutoPauseBelowCents *int64
	MonthlyLimitCents   *int64
	PeriodResetsOn      int16 `gorm:"not null;default:1"`
	UpdatedAt           time.Time
}

func (SpendControls) TableName() string { return "spend_controls" }

type SpendAlert struct {
	ID          int64  `gorm:"primaryKey;autoIncrement"`
	OrgID       string `gorm:"type:uuid;not null"`
	Kind        string `gorm:"not null"`
	PeriodStart time.Time
	AmountCents int64
	FiredAt     time.Time
}

func (SpendAlert) TableName() string { return "spend_alerts" }

type ThroughputConfig struct {
	OrgID               string `gorm:"type:uuid;primaryKey"`
	ReservedConcurrency int    `gorm:"not null;default:2"`
	BurstConcurrency    int    `gorm:"not null;default:200"`
	PriorityLane        string `gorm:"not null;default:'standard'"`
	RPMLimit            int    `gorm:"not null;default:60"`
	QueueTier           string `gorm:"not null;default:'default'"`
	Unlimited           bool   `gorm:"not null;default:false"`
	UpdatedAt           time.Time
}

func (ThroughputConfig) TableName() string { return "throughput_config" }

type ModerationProfileRow struct {
	OrgID       string          `gorm:"type:uuid;primaryKey"`
	Profile     string          `gorm:"not null;default:'balanced'"`
	CustomRules json.RawMessage `gorm:"type:jsonb;not null;default:'{}'"`
	UpdatedAt   time.Time
}

func (ModerationProfileRow) TableName() string { return "moderation_profile" }

type ModerationEvent struct {
	ID           int64  `gorm:"primaryKey;autoIncrement"`
	OrgID        string `gorm:"type:uuid;not null;index"`
	VideoID      *string
	APIKeyID     *string
	ProfileUsed  string `gorm:"not null"`
	Verdict      string `gorm:"not null"` // allow | block | review
	Reason       *string
	InternalNote *string
	Reviewer     *string
	CreatedAt    time.Time
}

func (ModerationEvent) TableName() string { return "moderation_events" }

type IdempotencyKey struct {
	OrgID      string          `gorm:"type:uuid;primaryKey"`
	Key        string          `gorm:"primaryKey"`
	BodySHA256 string          `gorm:"not null"`
	Response   json.RawMessage `gorm:"type:jsonb;not null"`
	StatusCode int             `gorm:"not null"`
	CreatedAt  time.Time
}

func (IdempotencyKey) TableName() string { return "idempotency_keys" }

// Extended fields on api_keys (migration 00005 added these).
type APIKeyExt struct {
	Env                  string         `gorm:"not null;default:'live'"`
	Disabled             bool           `gorm:"not null;default:false"`
	AllowedModels        pq.StringArray `gorm:"type:text[];not null;default:'{}'"`
	MonthlySpendCapCents *int64
	RateLimitRPM         *int
	IPAllowlist          pq.StringArray `gorm:"type:text[];not null;default:'{}'"`
	ModerationProfile    *string
	Kind                 string `gorm:"not null;default:'business'"`
}
