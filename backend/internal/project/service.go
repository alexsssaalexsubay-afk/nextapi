package project

import (
	"context"
	"errors"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

var (
	ErrNotFound  = errors.New("project_not_found")
	ErrForbidden = errors.New("project_access_denied")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// List returns all projects for an org.
func (s *Service) List(ctx context.Context, orgID string) ([]domain.Project, error) {
	var projects []domain.Project
	err := s.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Order("updated_at DESC").
		Find(&projects).Error
	return projects, err
}

type CreateProjectInput struct {
	OrgID       string
	Name        string
	Description *string
}

func (s *Service) Create(ctx context.Context, in CreateProjectInput) (*domain.Project, error) {
	p := domain.Project{
		OrgID:       in.OrgID,
		Name:        in.Name,
		Description: in.Description,
		Status:      "active",
	}
	if err := s.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Service) Get(ctx context.Context, orgID, projectID string) (*domain.Project, error) {
	var p domain.Project
	if err := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", projectID, orgID).
		First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

type UpdateProjectInput struct {
	Name        *string
	Description *string
	Status      *string
}

func (s *Service) Update(ctx context.Context, orgID, projectID string, in UpdateProjectInput) (*domain.Project, error) {
	p, err := s.Get(ctx, orgID, projectID)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{"updated_at": time.Now()}
	if in.Name != nil {
		updates["name"] = *in.Name
	}
	if in.Description != nil {
		updates["description"] = *in.Description
	}
	if in.Status != nil {
		updates["status"] = *in.Status
	}
	if err := s.db.WithContext(ctx).Model(p).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.Get(ctx, orgID, projectID)
}

func (s *Service) Delete(ctx context.Context, orgID, projectID string) error {
	result := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", projectID, orgID).
		Delete(&domain.Project{})
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return result.Error
}

// ─── Assets ──────────────────────────────────────────────────────────────

func (s *Service) ListAssets(ctx context.Context, orgID, projectID string) ([]domain.ProjectAsset, error) {
	// Verify project belongs to org
	if _, err := s.Get(ctx, orgID, projectID); err != nil {
		return nil, err
	}
	var assets []domain.ProjectAsset
	err := s.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("sort_order, created_at").
		Find(&assets).Error
	return assets, err
}

type CreateAssetInput struct {
	ProjectID string
	Kind      string
	Name      string
	ImageURL  *string
	SortOrder int
}

func (s *Service) CreateAsset(ctx context.Context, orgID string, in CreateAssetInput) (*domain.ProjectAsset, error) {
	if _, err := s.Get(ctx, orgID, in.ProjectID); err != nil {
		return nil, err
	}
	a := domain.ProjectAsset{
		ProjectID: in.ProjectID,
		Kind:      in.Kind,
		Name:      in.Name,
		ImageURL:  in.ImageURL,
		SortOrder: in.SortOrder,
	}
	if err := s.db.WithContext(ctx).Create(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Service) DeleteAsset(ctx context.Context, orgID, projectID, assetID string) error {
	if _, err := s.Get(ctx, orgID, projectID); err != nil {
		return err
	}
	result := s.db.WithContext(ctx).
		Where("id = ? AND project_id = ?", assetID, projectID).
		Delete(&domain.ProjectAsset{})
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return result.Error
}
