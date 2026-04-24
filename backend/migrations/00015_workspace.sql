-- +goose Up
-- +goose StatementBegin

-- ─── 1. Projects table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL REFERENCES orgs(id),
    name        TEXT        NOT NULL,
    description TEXT,
    status      TEXT        NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);

-- ─── 2. Project assets table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_assets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind        TEXT        NOT NULL CHECK (kind IN ('character','scene','prop','reference')),
    name        TEXT        NOT NULL,
    image_url   TEXT,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_assets_project ON project_assets(project_id);

-- ─── 3. Link batch_runs to projects ─────────────────────────────────────
ALTER TABLE batch_runs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE batch_runs DROP COLUMN IF EXISTS project_id;
DROP TABLE IF EXISTS project_assets;
DROP TABLE IF EXISTS projects;
-- +goose StatementEnd
