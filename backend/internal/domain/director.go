package domain

import (
	"encoding/json"
	"time"
)

type DirectorJob struct {
	ID                   string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrgID                string          `gorm:"type:uuid;not null;index" json:"org_id"`
	WorkflowID           *string         `gorm:"type:uuid;column:workflow_id" json:"workflow_id,omitempty"`
	WorkflowRunID        *string         `gorm:"type:uuid;column:workflow_run_id" json:"workflow_run_id,omitempty"`
	BatchRunID           *string         `gorm:"type:uuid;column:batch_run_id" json:"batch_run_id,omitempty"`
	Title                string          `gorm:"type:text;not null;default:''" json:"title"`
	Story                string          `gorm:"type:text;not null;default:''" json:"story"`
	Status               string          `gorm:"type:text;not null;default:'draft'" json:"status"`
	EngineUsed           string          `gorm:"type:text;not null;default:''" json:"engine_used"`
	FallbackUsed         bool            `gorm:"not null;default:false" json:"fallback_used"`
	SelectedCharacterIDs json.RawMessage `gorm:"type:jsonb;not null;default:'[]'" json:"selected_character_ids"`
	BudgetSnapshot       json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"budget_snapshot"`
	PlanSnapshot         json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"plan_snapshot"`
	CreatedBy            string          `gorm:"type:text;not null;default:''" json:"created_by"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

func (DirectorJob) TableName() string { return "director_jobs" }

type DirectorStep struct {
	ID             string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	DirectorJobID  string          `gorm:"type:uuid;not null;column:director_job_id" json:"director_job_id"`
	OrgID          string          `gorm:"type:uuid;not null;index" json:"org_id"`
	StepKey        string          `gorm:"type:text;not null" json:"step_key"`
	Status         string          `gorm:"type:text;not null;default:'pending'" json:"status"`
	ProviderID     *string         `gorm:"type:uuid;column:provider_id" json:"provider_id,omitempty"`
	JobID          *string         `gorm:"type:uuid;column:job_id" json:"job_id,omitempty"`
	InputSnapshot  json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"input_snapshot"`
	OutputSnapshot json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"output_snapshot"`
	ErrorCode      string          `gorm:"type:text;not null;default:''" json:"error_code"`
	Attempts       int             `gorm:"not null;default:0" json:"attempts"`
	StartedAt      *time.Time      `json:"started_at,omitempty"`
	CompletedAt    *time.Time      `json:"completed_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

func (DirectorStep) TableName() string { return "director_steps" }
