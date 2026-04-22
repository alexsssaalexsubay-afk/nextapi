package domain

import (
	"encoding/json"
	"time"
)

type JobStatus string

const (
	JobQueued    JobStatus = "queued"
	JobRunning   JobStatus = "running"
	JobSucceeded JobStatus = "succeeded"
	JobFailed    JobStatus = "failed"
)

type Job struct {
	ID              string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID           string          `gorm:"type:uuid;not null;index"`
	APIKeyID        *string         `gorm:"type:uuid"`
	Provider        string          `gorm:"not null"`
	ProviderJobID   *string
	Request         json.RawMessage `gorm:"type:jsonb;not null"`
	Status          JobStatus       `gorm:"type:job_status;not null;default:'queued'"`
	VideoURL        *string
	TokensUsed      *int64
	CostCredits     *int64
	ReservedCredits int64 `gorm:"not null;default:0"`
	ErrorCode       *string
	ErrorMessage    *string
	CreatedAt       time.Time
	CompletedAt     *time.Time
}

func (Job) TableName() string { return "jobs" }
