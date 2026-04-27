package domain

import (
	"encoding/json"
	"time"
)

type VideoMergeJob struct {
	ID             string          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrgID          string          `gorm:"type:uuid;not null;index" json:"-"`
	WorkflowRunID  *string         `gorm:"type:uuid;column:workflow_run_id;index" json:"workflow_run_id,omitempty"`
	BatchRunID     *string         `gorm:"type:uuid;column:batch_run_id;index" json:"batch_run_id,omitempty"`
	Status         string          `gorm:"type:text;not null;default:'waiting_for_shots'" json:"status"`
	InputSnapshot  json.RawMessage `gorm:"type:jsonb;not null" json:"input_snapshot"`
	OutputSnapshot json.RawMessage `gorm:"type:jsonb" json:"output_snapshot,omitempty"`
	ErrorCode      string          `gorm:"type:text;not null;default:''" json:"error_code,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

func (VideoMergeJob) TableName() string { return "video_merge_jobs" }
