-- +goose Up
-- +goose StatementBegin

ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS uptoken_processing_status text,
    ADD COLUMN IF NOT EXISTS uptoken_rejection_reason text;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE media_assets
    DROP COLUMN IF EXISTS uptoken_rejection_reason,
    DROP COLUMN IF EXISTS uptoken_processing_status;

-- +goose StatementEnd
