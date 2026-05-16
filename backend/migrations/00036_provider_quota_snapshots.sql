-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS provider_quota_snapshots (
  id BIGSERIAL PRIMARY KEY,
  provider_id UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'account',
  mode TEXT NOT NULL DEFAULT 'local_ledger',
  currency TEXT NOT NULL DEFAULT 'USD',
  total_cents BIGINT,
  used_cents BIGINT NOT NULL DEFAULT 0,
  remaining_cents BIGINT,
  low_balance_cents BIGINT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'recorded',
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  raw_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_quota_snapshots_provider_created
  ON provider_quota_snapshots (provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_quota_snapshots_provider_name_created
  ON provider_quota_snapshots (provider, created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_provider_quota_snapshots_provider_name_created;
DROP INDEX IF EXISTS idx_provider_quota_snapshots_provider_created;
DROP TABLE IF EXISTS provider_quota_snapshots;

-- +goose StatementEnd
