-- +goose Up
-- +goose StatementBegin

-- ─── 1. Unlimited mode for throughput config ──────────────────────────────
-- When unlimited=true, Acquire/AcquireBatch always succeeds (only tracks
-- in-flight count, never rejects). Used for internal accounts and VIP customers.
ALTER TABLE throughput_config
  ADD COLUMN IF NOT EXISTS unlimited BOOLEAN NOT NULL DEFAULT false;

-- Raise default burst from 8 to 200 for existing rows.
-- New rows get 200 via the lazy-default in Go code.
UPDATE throughput_config SET burst_concurrency = 200 WHERE burst_concurrency <= 8;

-- ─── 2. Batch runs: max_parallel ──────────────────────────────────────────
-- User-requested parallelism cap. NULL = no cap (use full burst).
ALTER TABLE batch_runs
  ADD COLUMN IF NOT EXISTS max_parallel INT;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE throughput_config DROP COLUMN IF EXISTS unlimited;
ALTER TABLE batch_runs DROP COLUMN IF EXISTS max_parallel;
-- +goose StatementEnd
