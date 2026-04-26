-- +goose Up
-- +goose StatementBegin

ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS uptoken_virtual_id text,
    ADD COLUMN IF NOT EXISTS uptoken_asset_url text,
    ADD COLUMN IF NOT EXISTS uptoken_status text;

CREATE INDEX IF NOT EXISTS idx_media_assets_uptoken_virtual_id
    ON media_assets (uptoken_virtual_id)
    WHERE uptoken_virtual_id IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_media_assets_uptoken_virtual_id;

ALTER TABLE media_assets
    DROP COLUMN IF EXISTS uptoken_status,
    DROP COLUMN IF EXISTS uptoken_asset_url,
    DROP COLUMN IF EXISTS uptoken_virtual_id;

-- +goose StatementEnd
