-- +goose Up
-- +goose StatementBegin

CREATE INDEX IF NOT EXISTS idx_media_assets_org_kind_created
  ON media_assets (org_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_director_jobs_org_status_updated
  ON director_jobs (org_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_director_steps_org_job_key_updated
  ON director_steps (org_id, director_job_id, step_key, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_director_steps_final_asset_unique
  ON director_steps (director_job_id)
  WHERE step_key = 'final_asset';

CREATE INDEX IF NOT EXISTS idx_director_metering_org_job
  ON director_metering (org_id, director_job_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_director_metering_org_job;
DROP INDEX IF EXISTS idx_director_steps_final_asset_unique;
DROP INDEX IF EXISTS idx_director_steps_org_job_key_updated;
DROP INDEX IF EXISTS idx_director_jobs_org_status_updated;
DROP INDEX IF EXISTS idx_media_assets_org_kind_created;

-- +goose StatementEnd
