-- +goose Up
-- +goose StatementBegin

-- ─── 1. Extend job_status enum ──────────────────────────────────────────────
-- PostgreSQL requires each ALTER TYPE ADD VALUE to be outside a transaction
-- when running goose, so we use individual statements.
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'submitting';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'retrying';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'timed_out';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'canceled';

-- +goose StatementEnd
-- +goose StatementBegin

-- ─── 2. Batch runs ──────────────────────────────────────────────────────────
-- A batch_run is a group of jobs submitted together (e.g. from Batch Studio).
-- Status summary columns are maintained via triggers / application logic.
CREATE TABLE IF NOT EXISTS batch_runs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    api_key_id      UUID        REFERENCES api_keys(id) ON DELETE SET NULL,
    name            TEXT,
    status          TEXT        NOT NULL DEFAULT 'running'
                                CHECK (status IN ('running','completed','partial_failure','failed')),
    total_shots     INT         NOT NULL DEFAULT 0,
    queued_count    INT         NOT NULL DEFAULT 0,
    running_count   INT         NOT NULL DEFAULT 0,
    succeeded_count INT         NOT NULL DEFAULT 0,
    failed_count    INT         NOT NULL DEFAULT 0,
    manifest        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_batch_runs_org ON batch_runs(org_id, created_at DESC);

-- ─── 3. Extend jobs with lifecycle + retry metadata ─────────────────────────
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS batch_run_id      UUID        REFERENCES batch_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS retry_count       INT         NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error_code   TEXT,
    ADD COLUMN IF NOT EXISTS last_error_msg    TEXT,
    ADD COLUMN IF NOT EXISTS submitting_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS running_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retrying_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS timed_out_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS canceled_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS exec_metadata     JSONB;

CREATE INDEX IF NOT EXISTS idx_jobs_batch ON jobs(batch_run_id) WHERE batch_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_status_org ON jobs(org_id, status, created_at DESC);

-- ─── 4. Request / job execution log ─────────────────────────────────────────
-- Written by the request-log middleware on every authenticated API call.
-- Sensitive fields (prompt text, image URLs) are NOT stored here; only
-- request_hash (sha256 of payload) is kept so re-runs can be detected.
CREATE TABLE IF NOT EXISTS request_logs (
    id                  BIGSERIAL   PRIMARY KEY,
    request_id          TEXT        NOT NULL,
    org_id              UUID        NOT NULL,
    api_key_id          UUID,
    job_id              UUID,
    batch_run_id        UUID,
    provider            TEXT,
    endpoint            TEXT        NOT NULL,
    method              TEXT        NOT NULL DEFAULT 'POST',
    request_hash        TEXT,
    response_status     INT,
    provider_latency_ms BIGINT,
    total_latency_ms    BIGINT,
    error_code          TEXT,
    error_message       TEXT,
    retry_count         INT         NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_logs_org ON request_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_job ON request_logs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_request_logs_request_id ON request_logs(request_id);

-- ─── 5. Dead-letter queue for terminal provider failures ─────────────────────
-- Jobs that exhausted all retry attempts land here for operator review.
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
    id          BIGSERIAL   PRIMARY KEY,
    job_id      UUID        NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    org_id      UUID        NOT NULL,
    reason      TEXT        NOT NULL,
    retry_count INT         NOT NULL DEFAULT 0,
    last_error  TEXT,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    replayed_at TIMESTAMPTZ,
    replayed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_dlq_org ON dead_letter_jobs(org_id, archived_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS dead_letter_jobs;
DROP TABLE IF EXISTS request_logs;
ALTER TABLE jobs
    DROP COLUMN IF EXISTS batch_run_id,
    DROP COLUMN IF EXISTS retry_count,
    DROP COLUMN IF EXISTS last_error_code,
    DROP COLUMN IF EXISTS last_error_msg,
    DROP COLUMN IF EXISTS submitting_at,
    DROP COLUMN IF EXISTS running_at,
    DROP COLUMN IF EXISTS retrying_at,
    DROP COLUMN IF EXISTS timed_out_at,
    DROP COLUMN IF EXISTS canceled_at,
    DROP COLUMN IF EXISTS exec_metadata;
DROP TABLE IF EXISTS batch_runs;
-- Note: enum values cannot be removed in PostgreSQL without recreating the type.
-- +goose StatementEnd
