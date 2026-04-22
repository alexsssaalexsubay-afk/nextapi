-- +goose Up
-- +goose StatementBegin

-- B2B gateway migration. Replaces the "credits" unit with cents, adds
-- videos/spend_controls/throughput/moderation/idempotency/request_log tables,
-- and extends api_keys + webhooks with per-key controls.

-- ---- Orgs: pause fields ----
ALTER TABLE orgs
  ADD COLUMN paused_at    TIMESTAMPTZ,
  ADD COLUMN pause_reason TEXT;

-- ---- Spend controls ----
CREATE TABLE spend_controls (
  org_id                    UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  hard_cap_cents            BIGINT,
  soft_alert_cents          BIGINT,
  auto_pause_below_cents    BIGINT,
  monthly_limit_cents       BIGINT,
  period_resets_on          SMALLINT NOT NULL DEFAULT 1,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE spend_alerts (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  period_start  TIMESTAMPTZ NOT NULL,
  amount_cents  BIGINT NOT NULL,
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, period_start)
);

-- ---- Throughput config ----
CREATE TABLE throughput_config (
  org_id                UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  reserved_concurrency  INT NOT NULL DEFAULT 2,
  burst_concurrency     INT NOT NULL DEFAULT 8,
  priority_lane         TEXT NOT NULL DEFAULT 'standard',
  rpm_limit             INT NOT NULL DEFAULT 60,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Moderation profile ----
CREATE TABLE moderation_profile (
  org_id        UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  profile       TEXT NOT NULL DEFAULT 'balanced',
  custom_rules  JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE moderation_events (
  id           BIGSERIAL PRIMARY KEY,
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  video_id     UUID,
  api_key_id   UUID,
  profile_used TEXT NOT NULL,
  verdict      TEXT NOT NULL,
  reason       TEXT,
  internal_note TEXT,
  reviewer     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mod_events_org ON moderation_events(org_id, created_at DESC);

-- ---- API keys: extended for B2B ----
ALTER TABLE api_keys
  ADD COLUMN env                      TEXT NOT NULL DEFAULT 'live',
  ADD COLUMN disabled                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN allowed_models           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN monthly_spend_cap_cents  BIGINT,
  ADD COLUMN rate_limit_rpm           INT,
  ADD COLUMN ip_allowlist             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN moderation_profile       TEXT,
  ADD COLUMN kind                     TEXT NOT NULL DEFAULT 'business';

-- ---- Videos (new, replaces jobs for client-facing surface) ----
CREATE TABLE videos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  api_key_id           UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  model                TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'queued',
  input                JSONB NOT NULL,
  output               JSONB,
  metadata             JSONB NOT NULL DEFAULT '{}',
  upstream_job_id      TEXT,
  upstream_tokens      BIGINT,
  video_seconds        NUMERIC(10,3),
  estimated_cost_cents BIGINT NOT NULL,
  actual_cost_cents    BIGINT,
  reserved_cents       BIGINT NOT NULL,
  error_code           TEXT,
  error_message        TEXT,
  webhook_url          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at           TIMESTAMPTZ,
  finished_at          TIMESTAMPTZ,
  idempotency_key      TEXT,
  request_id           TEXT
);
CREATE INDEX idx_videos_org_created ON videos(org_id, created_at DESC);
CREATE INDEX idx_videos_status_active ON videos(status) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX idx_videos_idem
  ON videos(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---- Idempotency replay cache (body hash + cached response) ----
CREATE TABLE idempotency_keys (
  org_id      UUID NOT NULL,
  key         TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  response    JSONB NOT NULL,
  status_code INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);

-- ---- Webhooks v2 (replace old) ----
ALTER TABLE webhooks
  ADD COLUMN description TEXT NOT NULL DEFAULT '',
  ADD COLUMN disabled    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN rotated_at  TIMESTAMPTZ,
  ADD COLUMN prev_secret TEXT;

ALTER TABLE webhook_deliveries
  ADD COLUMN video_id UUID,
  ADD COLUMN signature TEXT,
  ADD COLUMN timestamp_unix BIGINT;

-- ---- Billing ledger: add cents columns alongside credits to migrate later ----
ALTER TABLE credits_ledger
  ADD COLUMN delta_cents BIGINT;

-- For the B2B repricing we will increment delta_cents from now on and leave
-- delta_credits for legacy backfill reference only.

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE credits_ledger DROP COLUMN IF EXISTS delta_cents;
ALTER TABLE webhook_deliveries DROP COLUMN IF EXISTS video_id,
                                DROP COLUMN IF EXISTS signature,
                                DROP COLUMN IF EXISTS timestamp_unix;
ALTER TABLE webhooks DROP COLUMN IF EXISTS description,
                     DROP COLUMN IF EXISTS disabled,
                     DROP COLUMN IF EXISTS rotated_at,
                     DROP COLUMN IF EXISTS prev_secret;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS videos;
ALTER TABLE api_keys DROP COLUMN IF EXISTS env,
                     DROP COLUMN IF EXISTS disabled,
                     DROP COLUMN IF EXISTS allowed_models,
                     DROP COLUMN IF EXISTS monthly_spend_cap_cents,
                     DROP COLUMN IF EXISTS rate_limit_rpm,
                     DROP COLUMN IF EXISTS ip_allowlist,
                     DROP COLUMN IF EXISTS moderation_profile,
                     DROP COLUMN IF EXISTS kind;
DROP TABLE IF EXISTS moderation_events;
DROP TABLE IF EXISTS moderation_profile;
DROP TABLE IF EXISTS throughput_config;
DROP TABLE IF EXISTS spend_alerts;
DROP TABLE IF EXISTS spend_controls;
ALTER TABLE orgs DROP COLUMN IF EXISTS paused_at,
                 DROP COLUMN IF EXISTS pause_reason;
-- +goose StatementEnd
