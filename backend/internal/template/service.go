package template

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

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
	OrgID                  *string
	Name                   string
	Slug                   string
	Description            *string
	CoverImageURL          *string
	Category               string
	DefaultModel           string
	DefaultResolution      string
	DefaultDuration        int
	DefaultAspectRatio     string
	DefaultMaxParallel     int
	InputSchema            []byte
	WorkflowJSON           []byte
	RecommendedInputSchema []byte
	DefaultPromptTemplate  *string
	Visibility             string
	PricingMultiplier      float64
	PreviewVideoURL        *string
	EstimatedCostCents     *int64
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*domain.Template, error) {
	t := domain.Template{
		OrgID:                  in.OrgID,
		Name:                   in.Name,
		Slug:                   in.Slug,
		Description:            in.Description,
		CoverImageURL:          in.CoverImageURL,
		Category:               in.Category,
		DefaultModel:           in.DefaultModel,
		DefaultResolution:      in.DefaultResolution,
		DefaultDuration:        in.DefaultDuration,
		DefaultAspectRatio:     in.DefaultAspectRatio,
		DefaultMaxParallel:     in.DefaultMaxParallel,
		InputSchema:            defaultRaw(in.InputSchema, []byte(`[]`)),
		WorkflowJSON:           in.WorkflowJSON,
		RecommendedInputSchema: defaultRaw(in.RecommendedInputSchema, []byte(`[]`)),
		DefaultPromptTemplate:  in.DefaultPromptTemplate,
		Visibility:             in.Visibility,
		PricingMultiplier:      in.PricingMultiplier,
		PreviewVideoURL:        in.PreviewVideoURL,
		EstimatedCostCents:     in.EstimatedCostCents,
	}
	if err := s.db.WithContext(ctx).Create(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Service) Duplicate(ctx context.Context, orgID, templateID string) (*domain.Template, error) {
	original, err := s.Get(ctx, orgID, templateID)
	if err != nil {
		return nil, err
	}
	orgIDCopy := orgID
	copy := domain.Template{
		OrgID:                  &orgIDCopy,
		Name:                   original.Name + " Copy",
		Slug:                   duplicateSlug(original.Slug),
		Description:            original.Description,
		CoverImageURL:          original.CoverImageURL,
		Category:               original.Category,
		DefaultModel:           original.DefaultModel,
		DefaultResolution:      original.DefaultResolution,
		DefaultDuration:        original.DefaultDuration,
		DefaultAspectRatio:     original.DefaultAspectRatio,
		DefaultMaxParallel:     original.DefaultMaxParallel,
		InputSchema:            original.InputSchema,
		WorkflowJSON:           original.WorkflowJSON,
		RecommendedInputSchema: original.RecommendedInputSchema,
		DefaultPromptTemplate:  original.DefaultPromptTemplate,
		Visibility:             "private",
		PricingMultiplier:      original.PricingMultiplier,
		PreviewVideoURL:        original.PreviewVideoURL,
		EstimatedCostCents:     original.EstimatedCostCents,
	}
	if err := s.db.WithContext(ctx).Create(&copy).Error; err != nil {
		return nil, err
	}
	return &copy, nil
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

func defaultRaw(raw []byte, fallback []byte) []byte {
	if len(raw) == 0 {
		return fallback
	}
	return raw
}

func duplicateSlug(slug string) string {
	base := strings.TrimSpace(slug)
	if base == "" {
		base = "template"
	}
	return base + "-copy-" + strconv.FormatInt(time.Now().UnixNano(), 36)
}
