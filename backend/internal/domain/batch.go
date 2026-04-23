package domain

import (
	"encoding/json"
	"time"
)

// BatchRun groups a set of jobs submitted together (e.g. from Batch Studio).
type BatchRun struct {
	ID             string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID          string          `gorm:"type:uuid;not null;index"`
	APIKeyID       *string         `gorm:"type:uuid"`
	Name           *string
	Status         string          `gorm:"not null;default:'running'"`
	TotalShots     int             `gorm:"not null;default:0;column:total_shots"`
	QueuedCount    int             `gorm:"not null;default:0;column:queued_count"`
	RunningCount   int             `gorm:"not null;default:0;column:running_count"`
	SucceededCount int             `gorm:"not null;default:0;column:succeeded_count"`
	FailedCount    int             `gorm:"not null;default:0;column:failed_count"`
	Manifest       json.RawMessage `gorm:"type:jsonb"`
	CreatedAt      time.Time
	CompletedAt    *time.Time
}

func (BatchRun) TableName() string { return "batch_runs" }

// BatchStatusSummary is a read-only aggregate computed from job rows.
type BatchStatusSummary struct {
	Total     int `json:"total"`
	Queued    int `json:"queued"`
	Running   int `json:"running"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
}

// DeadLetterJob records a job that exhausted all retry attempts.
type DeadLetterJob struct {
	ID         int64   `gorm:"primaryKey;autoIncrement"`
	JobID      string  `gorm:"type:uuid;not null;uniqueIndex"`
	OrgID      string  `gorm:"type:uuid;not null"`
	Reason     string  `gorm:"not null"`
	RetryCount int     `gorm:"not null;default:0"`
	LastError  *string
	ArchivedAt time.Time
	ReplayedAt *time.Time
	ReplayedBy *string
}

func (DeadLetterJob) TableName() string { return "dead_letter_jobs" }

// RequestLog is an immutable record of every authenticated API call.
// Sensitive payload fields are NOT stored; only a SHA-256 hash of the body.
type RequestLog struct {
	ID                 int64   `gorm:"primaryKey;autoIncrement"`
	RequestID          string  `gorm:"not null;index"`
	OrgID              string  `gorm:"type:uuid;not null"`
	APIKeyID           *string `gorm:"type:uuid"`
	JobID              *string `gorm:"type:uuid"`
	BatchRunID         *string `gorm:"type:uuid"`
	Provider           *string
	Endpoint           string  `gorm:"not null"`
	Method             string  `gorm:"not null;default:'POST'"`
	RequestHash        *string
	ResponseStatus     *int
	ProviderLatencyMs  *int64
	TotalLatencyMs     *int64
	ErrorCode          *string
	ErrorMessage       *string
	RetryCount         int     `gorm:"not null;default:0"`
	CreatedAt          time.Time
}

func (RequestLog) TableName() string { return "request_logs" }
