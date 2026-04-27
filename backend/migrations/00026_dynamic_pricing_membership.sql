-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS platform_pricing_settings (
  id                       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled                  BOOLEAN NOT NULL DEFAULT true,
  default_markup_bps       INT NOT NULL DEFAULT 0 CHECK (default_markup_bps >= 0),
  min_charge_cents         BIGINT NOT NULL DEFAULT 1 CHECK (min_charge_cents >= 0),
  rounding_increment_cents BIGINT NOT NULL DEFAULT 1 CHECK (rounding_increment_cents > 0),
  updated_by               TEXT NOT NULL DEFAULT '',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_pricing_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS membership_tiers (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       TEXT NOT NULL,
  min_lifetime_topup_cents   BIGINT NOT NULL CHECK (min_lifetime_topup_cents >= 0),
  markup_bps                 INT NOT NULL CHECK (markup_bps >= 0),
  enabled                    BOOLEAN NOT NULL DEFAULT true,
  description                TEXT NOT NULL DEFAULT '',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_tiers_name
  ON membership_tiers (lower(name));
CREATE INDEX IF NOT EXISTS idx_membership_tiers_threshold
  ON membership_tiers (enabled, min_lifetime_topup_cents DESC);

CREATE TABLE IF NOT EXISTS org_pricing_overrides (
  org_id                    UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  override_enabled          BOOLEAN NOT NULL DEFAULT false,
  markup_bps                INT CHECK (markup_bps >= 0),
  manual_membership_tier_id UUID REFERENCES membership_tiers(id) ON DELETE SET NULL,
  updated_by                TEXT NOT NULL DEFAULT '',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_pricing_state (
  org_id                       UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  lifetime_topup_cents         BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_topup_cents >= 0),
  auto_membership_tier_id      UUID REFERENCES membership_tiers(id) ON DELETE SET NULL,
  effective_membership_tier_id UUID REFERENCES membership_tiers(id) ON DELETE SET NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS upstream_estimate_cents BIGINT,
  ADD COLUMN IF NOT EXISTS upstream_actual_cents   BIGINT,
  ADD COLUMN IF NOT EXISTS margin_cents            BIGINT,
  ADD COLUMN IF NOT EXISTS pricing_markup_bps      INT,
  ADD COLUMN IF NOT EXISTS pricing_source          TEXT;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS upstream_estimate_cents BIGINT,
  ADD COLUMN IF NOT EXISTS upstream_actual_cents   BIGINT,
  ADD COLUMN IF NOT EXISTS margin_cents            BIGINT,
  ADD COLUMN IF NOT EXISTS pricing_markup_bps      INT,
  ADD COLUMN IF NOT EXISTS pricing_source          TEXT;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE videos
  DROP COLUMN IF EXISTS pricing_source,
  DROP COLUMN IF EXISTS pricing_markup_bps,
  DROP COLUMN IF EXISTS margin_cents,
  DROP COLUMN IF EXISTS upstream_actual_cents,
  DROP COLUMN IF EXISTS upstream_estimate_cents;

ALTER TABLE jobs
  DROP COLUMN IF EXISTS pricing_source,
  DROP COLUMN IF EXISTS pricing_markup_bps,
  DROP COLUMN IF EXISTS margin_cents,
  DROP COLUMN IF EXISTS upstream_actual_cents,
  DROP COLUMN IF EXISTS upstream_estimate_cents;

DROP TABLE IF EXISTS org_pricing_state;
DROP TABLE IF EXISTS org_pricing_overrides;
DROP INDEX IF EXISTS idx_membership_tiers_threshold;
DROP INDEX IF EXISTS idx_membership_tiers_name;
DROP TABLE IF EXISTS membership_tiers;
DROP TABLE IF EXISTS platform_pricing_settings;

-- +goose StatementEnd
