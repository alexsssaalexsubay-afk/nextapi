-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS ai_director_entitlements (
  org_id      UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  tier        TEXT NOT NULL DEFAULT 'vip',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  expires_at  TIMESTAMPTZ,
  note        TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_director_entitlements_enabled
  ON ai_director_entitlements (enabled, expires_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS ai_director_entitlements;

-- +goose StatementEnd
