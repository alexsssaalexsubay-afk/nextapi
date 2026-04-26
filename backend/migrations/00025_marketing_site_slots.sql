-- +goose Up
-- +goose StatementBegin
CREATE TABLE marketing_site_slots (
    slot_key VARCHAR(64) PRIMARY KEY,
    media_kind VARCHAR(16) NOT NULL,
    url_r2_key TEXT,
    url_external TEXT,
    poster_r2_key TEXT,
    poster_external TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketing_site_slots_media_kind_chk CHECK (media_kind IN ('image', 'video')),
    CONSTRAINT marketing_site_slots_url_xor_chk CHECK (
        (url_r2_key IS NOT NULL AND url_external IS NULL)
        OR (url_r2_key IS NULL AND url_external IS NOT NULL)
    ),
    CONSTRAINT marketing_site_slots_poster_xor_chk CHECK (
        (poster_r2_key IS NULL AND poster_external IS NULL)
        OR (poster_r2_key IS NOT NULL AND poster_external IS NULL)
        OR (poster_r2_key IS NULL AND poster_external IS NOT NULL)
    )
);

CREATE INDEX marketing_site_slots_updated_at_idx ON marketing_site_slots (updated_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS marketing_site_slots;
-- +goose StatementEnd
