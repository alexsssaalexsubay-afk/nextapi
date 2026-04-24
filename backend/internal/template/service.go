package template

import (
	"context"
	"errors"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

var (
	ErrNotFound  = errors.New("template_not_found")
	ErrForbidden = errors.New("template_access_denied")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// List returns templates visible to the given org: system templates + org's own.
func (s *Service) List(ctx context.Context, orgID string, category string) ([]domain.Template, error) {
	q := s.db.WithContext(ctx).
		Where("visibility = 'system' OR (org_id = ? AND visibility IN ('private','system'))", orgID).
		Order("category, name")
	if category != "" {
		q = q.Where("category = ?", category)
	}
	var templates []domain.Template
	if err := q.Find(&templates).Error; err != nil {
		return nil, err
	}
	return templates, nil
}

// Get returns a single template if the org has access.
func (s *Service) Get(ctx context.Context, orgID, templateID string) (*domain.Template, error) {
	var t domain.Template
	if err := s.db.WithContext(ctx).
		Where("id = ? AND (visibility = 'system' OR org_id = ?)", templateID, orgID).
		First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

type CreateInput struct {
	OrgID                 *string
	Name                  string
	Slug                  string
	Description           *string
	CoverImageURL         *string
	Category              string
	DefaultModel          string
	DefaultResolution     string
	DefaultDuration       int
	DefaultAspectRatio    string
	DefaultMaxParallel    int
	DefaultPromptTemplate *string
	Visibility            string
	PricingMultiplier     float64
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*domain.Template, error) {
	t := domain.Template{
		OrgID:                 in.OrgID,
		Name:                  in.Name,
		Slug:                  in.Slug,
		Description:           in.Description,
		CoverImageURL:         in.CoverImageURL,
		Category:              in.Category,
		DefaultModel:          in.DefaultModel,
		DefaultResolution:     in.DefaultResolution,
		DefaultDuration:       in.DefaultDuration,
		DefaultAspectRatio:    in.DefaultAspectRatio,
		DefaultMaxParallel:    in.DefaultMaxParallel,
		DefaultPromptTemplate: in.DefaultPromptTemplate,
		Visibility:            in.Visibility,
		PricingMultiplier:     in.PricingMultiplier,
	}
	if err := s.db.WithContext(ctx).Create(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Service) Delete(ctx context.Context, orgID, templateID string) error {
	result := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", templateID, orgID).
		Delete(&domain.Template{})
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return result.Error
}
