package videomerge

import (
	"context"
	"encoding/json"
	"os"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

type CreateInput struct {
	OrgID         string
	WorkflowRunID *string
	BatchRunID    *string
	Snapshot      json.RawMessage
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) Enabled() bool {
	return s != nil && os.Getenv("VIDEO_MERGE_ENABLED") == "true"
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*domain.VideoMergeJob, error) {
	if len(in.Snapshot) == 0 {
		in.Snapshot = json.RawMessage(`{}`)
	}
	status := "disabled"
	if s.Enabled() {
		status = "waiting_for_shots"
	}
	row := domain.VideoMergeJob{
		OrgID:         in.OrgID,
		WorkflowRunID: in.WorkflowRunID,
		BatchRunID:    in.BatchRunID,
		Status:        status,
		InputSnapshot: in.Snapshot,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}
