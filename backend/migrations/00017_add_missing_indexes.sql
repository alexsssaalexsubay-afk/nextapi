-- +goose Up
-- +goose StatementBegin

CREATE INDEX IF NOT EXISTS idx_jobs_provider_job_id
    ON jobs(provider_job_id) WHERE provider_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_owner_user_id
    ON orgs(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_videos_upstream_job_id
    ON videos(upstream_job_id) WHERE upstream_job_id IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_jobs_provider_job_id;
DROP INDEX IF EXISTS idx_orgs_owner_user_id;
DROP INDEX IF EXISTS idx_videos_upstream_job_id;
-- +goose StatementEnd
