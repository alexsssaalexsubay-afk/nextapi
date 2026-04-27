package domain

import (
	"encoding/json"
	"time"
)

// Workflow stores the editable dashboard canvas JSON. Execution is handled by
// the workflow adapter, which compiles the canvas into the existing video task
// request rather than invoking any provider directly.
type Workflow struct {
	ID           string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrgID        string          `gorm:"type:uuid;not null;index" json:"-"`
	ProjectID    *string         `gorm:"type:uuid" json:"project_id,omitempty"`
	Name         string          `gorm:"not null" json:"name"`
	Description  *string         `json:"description,omitempty"`
	WorkflowJSON json.RawMessage `gorm:"type:jsonb;not null" json:"workflow_json"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

func (Workflow) TableName() string { return "workflows" }

// WorkflowRun is an execution audit record for a workflow run. The actual video
// task remains in jobs/videos so billing, polling, retries, and downloads keep
// using the established system.
type WorkflowRun struct {
	ID             string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkflowID     string          `gorm:"type:uuid;not null;index" json:"workflow_id"`
	OrgID          string          `gorm:"type:uuid;not null;index" json:"-"`
	JobID          *string         `gorm:"type:uuid;index" json:"job_id,omitempty"`
	BatchRunID     *string         `gorm:"type:uuid;index;column:batch_run_id" json:"batch_run_id,omitempty"`
	VideoID        *string         `gorm:"type:uuid" json:"video_id,omitempty"`
	Status         string          `gorm:"not null;default:'queued'" json:"status"`
	InputSnapshot  json.RawMessage `gorm:"type:jsonb;not null" json:"input_snapshot"`
	OutputSnapshot json.RawMessage `gorm:"type:jsonb" json:"output_snapshot,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

func (WorkflowRun) TableName() string { return "workflow_runs" }

// WorkflowVersion protects users from losing a working canvas when they keep
// iterating. Restores create a new version instead of rewriting history.
type WorkflowVersion struct {
	ID           string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkflowID   string          `gorm:"type:uuid;not null;index" json:"workflow_id"`
	Version      int             `gorm:"not null" json:"version"`
	WorkflowJSON json.RawMessage `gorm:"type:jsonb;not null" json:"workflow_json"`
	ChangeNote   *string         `json:"change_note,omitempty"`
	CreatedBy    *string         `json:"created_by,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
}

func (WorkflowVersion) TableName() string { return "workflow_versions" }
