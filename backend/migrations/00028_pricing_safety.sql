-- +goose Up
-- +goose StatementBegin

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_pricing_settings_default_markup_bps_max'
  ) THEN
    ALTER TABLE platform_pricing_settings
      ADD CONSTRAINT platform_pricing_settings_default_markup_bps_max
      CHECK (default_markup_bps <= 50000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'membership_tiers_markup_bps_max'
  ) THEN
    ALTER TABLE membership_tiers
      ADD CONSTRAINT membership_tiers_markup_bps_max
      CHECK (markup_bps <= 50000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_pricing_overrides_markup_bps_max'
  ) THEN
    ALTER TABLE org_pricing_overrides
      ADD CONSTRAINT org_pricing_overrides_markup_bps_max
      CHECK (markup_bps IS NULL OR markup_bps <= 50000);
  END IF;
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE org_pricing_overrides DROP CONSTRAINT IF EXISTS org_pricing_overrides_markup_bps_max;
ALTER TABLE membership_tiers DROP CONSTRAINT IF EXISTS membership_tiers_markup_bps_max;
ALTER TABLE platform_pricing_settings DROP CONSTRAINT IF EXISTS platform_pricing_settings_default_markup_bps_max;

-- +goose StatementEnd
