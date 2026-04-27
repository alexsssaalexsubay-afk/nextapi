-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS video_merge_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  batch_run_id    UUID REFERENCES batch_runs(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'waiting_for_shots',
  input_snapshot  JSONB NOT NULL DEFAULT '{}',
  output_snapshot JSONB,
  error_code      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_merge_jobs_org_created
  ON video_merge_jobs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_merge_jobs_workflow_run
  ON video_merge_jobs (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_video_merge_jobs_batch_run
  ON video_merge_jobs (batch_run_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS video_merge_jobs;

-- +goose StatementEnd
