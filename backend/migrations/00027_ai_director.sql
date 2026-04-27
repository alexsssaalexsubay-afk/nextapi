-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS ai_providers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('text', 'image', 'video')),
  provider          TEXT NOT NULL,
  base_url          TEXT NOT NULL DEFAULT '',
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  key_hint          TEXT NOT NULL DEFAULT '',
  model             TEXT NOT NULL DEFAULT '',
  enabled           BOOLEAN NOT NULL DEFAULT true,
  is_default        BOOLEAN NOT NULL DEFAULT false,
  config_json       JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_type_enabled
  ON ai_providers (type, enabled);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_providers_one_default_per_type
  ON ai_providers (type)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS ai_provider_logs (
  id               BIGSERIAL PRIMARY KEY,
  provider_id      UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
  user_id          TEXT NOT NULL DEFAULT '',
  org_id           UUID REFERENCES orgs(id) ON DELETE SET NULL,
  type             TEXT NOT NULL,
  request_summary  TEXT NOT NULL DEFAULT '',
  response_summary TEXT NOT NULL DEFAULT '',
  usage_json       JSONB NOT NULL DEFAULT '{}',
  error            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_logs_provider_created
  ON ai_provider_logs (provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_provider_logs_org_created
  ON ai_provider_logs (org_id, created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS ai_provider_logs;
DROP INDEX IF EXISTS idx_ai_providers_one_default_per_type;
DROP INDEX IF EXISTS idx_ai_providers_type_enabled;
DROP TABLE IF EXISTS ai_providers;

-- +goose StatementEnd
