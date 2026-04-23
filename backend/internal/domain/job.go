package domain

import (
	"encoding/json"
	"time"
)

type JobStatus string

const (
	JobQueued     JobStatus = "queued"
	JobSubmitting JobStatus = "submitting"
	JobRunning    JobStatus = "running"
	JobRetrying   JobStatus = "retrying"
	JobSucceeded  JobStatus = "succeeded"
	JobFailed     JobStatus = "failed"
	JobTimedOut   JobStatus = "timed_out"
	JobCanceled   JobStatus = "canceled"
)

// IsTerminal returns true if no further status transitions are possible.
func (s JobStatus) IsTerminal() bool {
	return s == JobSucceeded || s == JobFailed || s == JobTimedOut || s == JobCanceled
}

// IsRetryable returns true if the job can be retried from the admin panel.
func (s JobStatus) IsRetryable() bool {
	return s == JobFailed || s == JobTimedOut
}

// ValidTransitions defines legal state machine edges.
var ValidTransitions = map[JobStatus][]JobStatus{
	JobQueued:     {JobSubmitting, JobFailed, JobCanceled},
	JobSubmitting: {JobRunning, JobRetrying, JobFailed, JobCanceled},
	JobRunning:    {JobSucceeded, JobFailed, JobTimedOut, JobCanceled},
	JobRetrying:   {JobSubmitting, JobFailed, JobTimedOut, JobCanceled},
	// Terminal states have no outgoing edges.
}

// CanTransitionTo returns true if transitioning from s to next is valid.
func (s JobStatus) CanTransitionTo(next JobStatus) bool {
	for _, allowed := range ValidTransitions[s] {
		if allowed == next {
			return true
		}
	}
	return false
}

type Job struct {
	ID              string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID           string          `gorm:"type:uuid;not null;index"`
	APIKeyID        *string         `gorm:"type:uuid"`
	BatchRunID      *string         `gorm:"type:uuid;column:batch_run_id"`
	Provider        string          `gorm:"not null"`
	ProviderJobID   *string
	Request         json.RawMessage `gorm:"type:jsonb;not null"`
	Status          JobStatus       `gorm:"type:job_status;not null;default:'queued'"`
	VideoURL        *string
	TokensUsed      *int64
	CostCredits     *int64
	ReservedCredits int64           `gorm:"not null;default:0"`
	ErrorCode       *string
	ErrorMessage    *string

	// Retry and execution metadata
	RetryCount    int     `gorm:"not null;default:0"`
	LastErrorCode *string `gorm:"column:last_error_code"`
	LastErrorMsg  *string `gorm:"column:last_error_msg"`
	ExecMetadata  json.RawMessage `gorm:"type:jsonb;column:exec_metadata"`

	// Lifecycle timestamps
	CreatedAt    time.Time
	SubmittingAt *time.Time `gorm:"column:submitting_at"`
	RunningAt    *time.Time `gorm:"column:running_at"`
	RetryingAt   *time.Time `gorm:"column:retrying_at"`
	TimedOutAt   *time.Time `gorm:"column:timed_out_at"`
	CanceledAt   *time.Time `gorm:"column:canceled_at"`
	CompletedAt  *time.Time
}

func (Job) TableName() string { return "jobs" }
