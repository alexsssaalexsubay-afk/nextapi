package billing

import (
	"context"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
)

const SignupBonusAmount int64 = 500

func (s *Service) GrantSignupBonus(ctx context.Context, orgID string) error {
	return s.AddCredits(ctx, Entry{
		OrgID:  orgID,
		Delta:  SignupBonusAmount,
		Reason: domain.ReasonSignupBonus,
		Note:   "welcome to NextAPI",
	})
}
