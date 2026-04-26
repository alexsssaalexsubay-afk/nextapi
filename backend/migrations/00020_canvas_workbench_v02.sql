-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS workflow_versions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id   uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version       int NOT NULL,
    workflow_json jsonb NOT NULL,
    change_note   text,
    created_by    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_version
    ON workflow_versions (workflow_id, version DESC);

ALTER TABLE templates
    ADD COLUMN IF NOT EXISTS workflow_json jsonb,
    ADD COLUMN IF NOT EXISTS recommended_inputs_schema jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS preview_video_url text,
    ADD COLUMN IF NOT EXISTS estimated_cost_cents bigint,
    ADD COLUMN IF NOT EXISTS usage_count bigint NOT NULL DEFAULT 0;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE templates
    DROP COLUMN IF EXISTS usage_count,
    DROP COLUMN IF EXISTS estimated_cost_cents,
    DROP COLUMN IF EXISTS preview_video_url,
    DROP COLUMN IF EXISTS recommended_inputs_schema,
    DROP COLUMN IF EXISTS workflow_json;

DROP TABLE IF EXISTS workflow_versions;
-- +goose StatementEnd
