package character

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/abuse"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

var (
	ErrNotFound         = errors.New("character_not_found")
	ErrInvalidCharacter = errors.New("invalid_character")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type CreateInput struct {
	OrgID           string
	Name            string
	ReferenceImages []string
}

type UpdateInput struct {
	Name            *string
	ReferenceImages []string
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*domain.Character, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidCharacter)
	}
	refs, err := marshalReferenceImages(in.ReferenceImages)
	if err != nil {
		return nil, err
	}
	row := domain.Character{
		OrgID:           in.OrgID,
		Name:            name,
		ReferenceImages: refs,
		Metadata:        json.RawMessage(`{}`),
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) List(ctx context.Context, orgID string) ([]domain.Character, error) {
	var rows []domain.Character
	err := s.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Order("created_at DESC").
		Find(&rows).Error
	return rows, err
}

func (s *Service) Get(ctx context.Context, orgID, id string) (*domain.Character, error) {
	var row domain.Character
	if err := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", id, orgID).
		First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &row, nil
}

func (s *Service) Update(ctx context.Context, orgID, id string, in UpdateInput) (*domain.Character, error) {
	updates := map[string]any{}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: name is required", ErrInvalidCharacter)
		}
		updates["name"] = name
	}
	if in.ReferenceImages != nil {
		refs, err := marshalReferenceImages(in.ReferenceImages)
		if err != nil {
			return nil, err
		}
		updates["reference_images"] = refs
	}
	if len(updates) == 0 {
		return s.Get(ctx, orgID, id)
	}
	res := s.db.WithContext(ctx).Model(&domain.Character{}).
		Where("id = ? AND org_id = ?", id, orgID).
		Updates(updates)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, orgID, id)
}

func (s *Service) Delete(ctx context.Context, orgID, id string) error {
	res := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", id, orgID).
		Delete(&domain.Character{})
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return res.Error
}

func marshalReferenceImages(images []string) (json.RawMessage, error) {
	out := make([]string, 0, len(images))
	for _, image := range images {
		url := strings.TrimSpace(image)
		if url == "" {
			continue
		}
		if !strings.HasPrefix(url, "https://") {
			return nil, fmt.Errorf("%w: reference image must be public https", ErrInvalidCharacter)
		}
		if err := abuse.ValidatePublicURL(url); err != nil {
			return nil, fmt.Errorf("%w: reference image must be public https", ErrInvalidCharacter)
		}
		out = append(out, url)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("%w: at least one reference image is required", ErrInvalidCharacter)
	}
	raw, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return raw, nil
}
