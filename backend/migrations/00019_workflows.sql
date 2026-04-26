-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS workflows (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
    name          text NOT NULL,
    description   text,
    workflow_json jsonb NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_org_updated
    ON workflows (org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    job_id          uuid NOT NULL REFERENCES jobs(id),
    video_id        uuid REFERENCES videos(id) ON DELETE SET NULL,
    status          text NOT NULL DEFAULT 'queued',
    input_snapshot  jsonb NOT NULL,
    output_snapshot jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_created
    ON workflow_runs (workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_org_created
    ON workflow_runs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_job
    ON workflow_runs (job_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS workflow_runs;
DROP TABLE IF EXISTS workflows;
-- +goose StatementEnd
