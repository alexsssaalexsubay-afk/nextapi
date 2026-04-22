-- +goose Up
-- +goose StatementBegin

CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');

CREATE TABLE jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  api_key_id       UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  provider         TEXT NOT NULL,
  provider_job_id  TEXT,
  request          JSONB NOT NULL,
  status           job_status NOT NULL DEFAULT 'queued',
  video_url        TEXT,
  tokens_used      BIGINT,
  cost_credits     BIGINT,
  reserved_credits BIGINT NOT NULL DEFAULT 0,
  error_code       TEXT,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);
CREATE INDEX idx_jobs_org_created ON jobs(org_id, created_at DESC);
CREATE INDEX idx_jobs_status ON jobs(status) WHERE status IN ('queued','running');

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS jobs;
DROP TYPE  IF EXISTS job_status;
-- +goose StatementEnd
