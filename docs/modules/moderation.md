# Moderation Profiles Module

## Purpose
Configurable content safety for B2B customers. Publicly marketed as
"configurable trust & safety" — never "no filter". Four presets plus a
custom toggle mode gated by signed AUP addendum.

## Presets

| Preset   | NSFW | Minors | Public figures | Keywords | Notes |
|----------|------|--------|----------------|----------|-------|
| strict   | block | block | block | org list | Default for new orgs |
| balanced | block | block | allow  | org list | Most common |
| relaxed  | allow | block | allow  | org list | Requires signed AUP addendum |
| custom   | toggle | always block | toggle | org list + custom | Requires signed AUP addendum |

Minors-related content is **always blocked** regardless of preset. This is
not a toggle; it is hardcoded.

## Data model
Already exists in migration 00005:
```sql
CREATE TABLE moderation_profile (
  org_id        UUID PRIMARY KEY,
  profile       TEXT NOT NULL DEFAULT 'balanced',
  custom_rules  JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE moderation_events (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL,
  video_id      UUID,
  api_key_id    UUID,
  profile_used  TEXT NOT NULL,
  verdict       TEXT NOT NULL,  -- allow | block | review
  reason        TEXT,
  internal_note TEXT,           -- admin-only, never exposed to customer
  reviewer      TEXT,           -- admin email who reviewed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Per-API-key override: `api_keys.moderation_profile` (TEXT, nullable).
When set, overrides the org-level profile for that key.

## Service API
```go
type Service struct { db *gorm.DB }
func (s *Service) GetProfile(ctx, orgID) (*Profile, error)
func (s *Service) UpsertProfile(ctx, orgID, input) (*Profile, error)
func (s *Service) Check(ctx, CheckInput) (*Verdict, error)
func (s *Service) ListEvents(ctx, orgID, limit, offset) ([]Event, error)
func (s *Service) AddReviewNote(ctx, eventID, note, reviewer) error
```

`Check` flow:
1. Load org profile (or per-key override).
2. Always check minors-related keywords → block.
3. Apply preset rules.
4. Log `moderation_events` row regardless of verdict.
5. Return verdict.

## Public surface
- `GET /v1/moderation_profile` — current profile (admin key)
- `PUT /v1/moderation_profile` — update (admin key)
- `GET /v1/internal/admin/moderation/events` — paginated log (operator)
- `PATCH /v1/internal/admin/moderation/events/:id` — add internal note

## Error codes
- `content_moderation.blocked` — 422, content rejected
- `content_moderation.review_required` — 422, queued for human review

## Test plan
1. Strict preset blocks NSFW keyword → 422.
2. Balanced preset allows non-NSFW prompt → allow.
3. Relaxed preset allows NSFW prompt → allow.
4. Per-key override: org=balanced, key=strict → strict wins.
5. Minors content blocked regardless of preset.
6. Event logged for every check (allow and block).

## Risks / TODOs
- TODO: ML-based content classification (v2). Current impl is keyword-based.
- RISK: keyword lists are static; need admin UI to manage org-level lists.
- TODO: "review" verdict queue needs admin workflow to approve/reject.
