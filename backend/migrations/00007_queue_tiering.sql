-- +goose Up
-- +goose StatementBegin

-- Per-key concurrency limit for "reserved instances" model.
ALTER TABLE api_keys
  ADD COLUMN provisioned_concurrency INT NOT NULL DEFAULT 5;

-- Ensure queue priority is in throughput_config.
ALTER TABLE throughput_config
  ADD COLUMN IF NOT EXISTS queue_tier TEXT NOT NULL DEFAULT 'default';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE api_keys DROP COLUMN IF EXISTS provisioned_concurrency;
ALTER TABLE throughput_config DROP COLUMN IF EXISTS queue_tier;
-- +goose StatementEnd
