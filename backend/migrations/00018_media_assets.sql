-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS media_assets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL,
    kind         text NOT NULL CHECK (kind IN ('image','video','audio')),
    storage_key  text NOT NULL,
    content_type text NOT NULL,
    filename     text,
    size_bytes   bigint NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_org_created
    ON media_assets (org_id, created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS media_assets;
-- +goose StatementEnd
