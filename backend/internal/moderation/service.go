package moderation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

var (
	ErrBlocked        = errors.New("content_moderation.blocked")
	ErrReviewRequired = errors.New("content_moderation.review_required")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

func (s *Service) GetProfile(ctx context.Context, orgID string) (*domain.ModerationProfileRow, error) {
	var row domain.ModerationProfileRow
	err := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &domain.ModerationProfileRow{
			OrgID:   orgID,
			Profile: "balanced",
		}, nil
	}
	return &row, err
}

type UpsertInput struct {
	Profile     string          `json:"profile"`
	CustomRules json.RawMessage `json:"custom_rules,omitempty"`
}

func (s *Service) UpsertProfile(ctx context.Context, orgID string, in UpsertInput) (*domain.ModerationProfileRow, error) {
	row := domain.ModerationProfileRow{
		OrgID:       orgID,
		Profile:     in.Profile,
		CustomRules: in.CustomRules,
		UpdatedAt:   time.Now(),
	}
	if len(row.CustomRules) == 0 {
		row.CustomRules = json.RawMessage(`{}`)
	}
	err := s.db.WithContext(ctx).Save(&row).Error
	return &row, err
}

type CheckInput struct {
	OrgID    string
	APIKeyID *string
	Prompt   string
	ImageURL *string
}

type Verdict struct {
	Decision string
	Reason   string
}

// Check evaluates content against the org's moderation profile.
// Returns "allow", "block", or "review".
func (s *Service) Check(ctx context.Context, in CheckInput) (*Verdict, error) {
	profileName := "balanced"

	// Priority: per-key override > org profile > default "balanced".
	var keyOverride string
	if in.APIKeyID != nil {
		var keyProfile *string
		s.db.WithContext(ctx).Raw(
			`SELECT moderation_profile FROM api_keys WHERE id = ?`, *in.APIKeyID).Scan(&keyProfile)
		if keyProfile != nil && *keyProfile != "" {
			keyOverride = *keyProfile
		}
	}

	if keyOverride != "" {
		profileName = keyOverride
	} else if p, _ := s.GetProfile(ctx, in.OrgID); p != nil {
		profileName = p.Profile
	}

	verdict := s.evaluate(profileName, in.Prompt)

	var reason *string
	if verdict.Reason != "" {
		reason = &verdict.Reason
	}
	event := domain.ModerationEvent{
		OrgID:       in.OrgID,
		APIKeyID:    in.APIKeyID,
		ProfileUsed: profileName,
		Verdict:     verdict.Decision,
		Reason:      reason,
		CreatedAt:   time.Now(),
	}
	s.db.WithContext(ctx).Create(&event)

	switch verdict.Decision {
	case "block":
		return verdict, ErrBlocked
	case "review":
		return verdict, ErrReviewRequired
	}
	return verdict, nil
}

var minorsKeywords = []string{"child", "minor", "underage", "kid", "infant", "toddler", "preteen"}
var nsfwKeywords = []string{"nsfw", "nude", "naked", "pornographic", "explicit", "sexual"}

func (s *Service) evaluate(profile, prompt string) *Verdict {
	lower := strings.ToLower(prompt)

	// Minors always blocked regardless of profile.
	for _, kw := range minorsKeywords {
		if containsStandaloneKeyword(lower, kw) {
			return &Verdict{Decision: "block", Reason: "minors_content"}
		}
	}

	switch profile {
	case "strict":
		for _, kw := range nsfwKeywords {
			if containsStandaloneKeyword(lower, kw) {
				return &Verdict{Decision: "block", Reason: "nsfw_content"}
			}
		}
		return &Verdict{Decision: "allow", Reason: ""}
	case "balanced":
		for _, kw := range nsfwKeywords {
			if containsStandaloneKeyword(lower, kw) {
				return &Verdict{Decision: "block", Reason: "nsfw_content"}
			}
		}
		return &Verdict{Decision: "allow", Reason: ""}
	case "relaxed":
		return &Verdict{Decision: "allow", Reason: ""}
	case "custom":
		return &Verdict{Decision: "allow", Reason: ""}
	default:
		return &Verdict{Decision: "allow", Reason: ""}
	}
}

func containsStandaloneKeyword(text, keyword string) bool {
	if keyword == "" {
		return false
	}
	start := 0
	for {
		index := strings.Index(text[start:], keyword)
		if index < 0 {
			return false
		}
		index += start
		beforeRune, _ := utf8.DecodeLastRuneInString(text[:index])
		beforeOK := index == 0 || !isWordRune(beforeRune)
		afterIndex := index + len(keyword)
		afterRune, _ := utf8.DecodeRuneInString(text[afterIndex:])
		afterOK := afterIndex == len(text) || !isWordRune(afterRune)
		if beforeOK && afterOK {
			return true
		}
		start = index + len(keyword)
	}
}

func isWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}

func (s *Service) ListEvents(ctx context.Context, orgID string, limit, offset int) ([]domain.ModerationEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []domain.ModerationEvent
	query := s.db.WithContext(ctx).Order("created_at DESC").Limit(limit).Offset(offset)
	if orgID != "" {
		query = query.Where("org_id = ?", orgID)
	}
	err := query.Find(&rows).Error
	return rows, err
}

func (s *Service) AddReviewNote(ctx context.Context, eventID int64, note, reviewer string) error {
	return s.db.WithContext(ctx).
		Model(&domain.ModerationEvent{}).
		Where("id = ?", eventID).
		Updates(map[string]any{
			"internal_note": note,
			"reviewer":      reviewer,
		}).Error
}
