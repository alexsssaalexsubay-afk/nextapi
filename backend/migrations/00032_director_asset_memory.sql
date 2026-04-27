-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS director_jobs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  workflow_id            UUID REFERENCES workflows(id) ON DELETE SET NULL,
  workflow_run_id        UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  batch_run_id           UUID REFERENCES batch_runs(id) ON DELETE SET NULL,
  title                  TEXT NOT NULL DEFAULT '',
  story                  TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT 'draft',
  engine_used            TEXT NOT NULL DEFAULT '',
  fallback_used          BOOLEAN NOT NULL DEFAULT false,
  selected_character_ids JSONB NOT NULL DEFAULT '[]',
  budget_snapshot        JSONB NOT NULL DEFAULT '{}',
  plan_snapshot          JSONB NOT NULL DEFAULT '{}',
  created_by             TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_jobs_org_updated
  ON director_jobs (org_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_director_jobs_workflow_run
  ON director_jobs (workflow_run_id);

CREATE TABLE IF NOT EXISTS director_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  director_job_id UUID NOT NULL REFERENCES director_jobs(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  step_key        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  provider_id     UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  input_snapshot  JSONB NOT NULL DEFAULT '{}',
  output_snapshot JSONB NOT NULL DEFAULT '{}',
  error_code      TEXT NOT NULL DEFAULT '',
  attempts        INT NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_steps_job_status
  ON director_steps (director_job_id, status, step_key);

CREATE INDEX IF NOT EXISTS idx_director_steps_org_created
  ON director_steps (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS director_metering (
  id              BIGSERIAL PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  director_job_id UUID REFERENCES director_jobs(id) ON DELETE SET NULL,
  step_id         UUID REFERENCES director_steps(id) ON DELETE SET NULL,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  provider_id     UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
  meter_type      TEXT NOT NULL,
  units           NUMERIC(20, 6) NOT NULL DEFAULT 0,
  estimated_cents BIGINT NOT NULL DEFAULT 0,
  actual_cents    BIGINT NOT NULL DEFAULT 0,
  credits_delta   BIGINT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'estimated',
  usage_json      JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_metering_org_created
  ON director_metering (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_director_metering_job
  ON director_metering (director_job_id, step_id);

CREATE TABLE IF NOT EXISTS director_checkpoints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  director_job_id UUID NOT NULL REFERENCES director_jobs(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  checkpoint_key  TEXT NOT NULL,
  state_snapshot  JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_checkpoints_job_created
  ON director_checkpoints (director_job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS brand_kits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  tone        TEXT NOT NULL DEFAULT '',
  colors      JSONB NOT NULL DEFAULT '[]',
  fonts       JSONB NOT NULL DEFAULT '[]',
  logos       JSONB NOT NULL DEFAULT '[]',
  rules_json  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_kits_org_updated
  ON brand_kits (org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS scene_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  asset_id    UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  tags        JSONB NOT NULL DEFAULT '[]',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scene_assets_org_updated
  ON scene_assets (org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS style_presets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  prompt      TEXT NOT NULL DEFAULT '',
  negative    TEXT NOT NULL DEFAULT '',
  params_json JSONB NOT NULL DEFAULT '{}',
  visibility  TEXT NOT NULL DEFAULT 'org',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_style_presets_org_category
  ON style_presets (org_id, category, updated_at DESC);

CREATE TABLE IF NOT EXISTS prompt_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL DEFAULT '',
  memory_type     TEXT NOT NULL,
  source_type     TEXT NOT NULL DEFAULT '',
  source_id       UUID,
  content         TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_memories_org_type_updated
  ON prompt_memories (org_id, memory_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS asset_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  asset_id    UUID REFERENCES media_assets(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'media_asset',
  source_id   UUID,
  model       TEXT NOT NULL DEFAULT '',
  dimension   INT NOT NULL DEFAULT 0,
  vector_ref  TEXT NOT NULL DEFAULT '',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_embeddings_org_source
  ON asset_embeddings (org_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS generation_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL DEFAULT '',
  director_job_id UUID REFERENCES director_jobs(id) ON DELETE SET NULL,
  workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  rating          INT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  outcome         TEXT NOT NULL DEFAULT '',
  comment         TEXT NOT NULL DEFAULT '',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_feedback_org_created
  ON generation_feedback (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_prompt_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        TEXT NOT NULL,
  version      INT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  prompt_body  TEXT NOT NULL,
  eval_summary JSONB NOT NULL DEFAULT '{}',
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_scope_status
  ON agent_prompt_versions (scope, status, version DESC);

CREATE TABLE IF NOT EXISTS model_performance_stats (
  id                BIGSERIAL PRIMARY KEY,
  provider_id       UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
  model             TEXT NOT NULL,
  capability        TEXT NOT NULL,
  resolution        TEXT NOT NULL DEFAULT '',
  window_start      TIMESTAMPTZ NOT NULL,
  window_end        TIMESTAMPTZ NOT NULL,
  total_requests    BIGINT NOT NULL DEFAULT 0,
  success_count     BIGINT NOT NULL DEFAULT 0,
  failure_count     BIGINT NOT NULL DEFAULT 0,
  avg_latency_ms    BIGINT NOT NULL DEFAULT 0,
  avg_cost_cents    BIGINT NOT NULL DEFAULT 0,
  quality_score     NUMERIC(6, 3),
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_performance_model_window
  ON model_performance_stats (model, capability, window_start DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS model_performance_stats;
DROP TABLE IF EXISTS agent_prompt_versions;
DROP TABLE IF EXISTS generation_feedback;
DROP TABLE IF EXISTS asset_embeddings;
DROP TABLE IF EXISTS prompt_memories;
DROP TABLE IF EXISTS style_presets;
DROP TABLE IF EXISTS scene_assets;
DROP TABLE IF EXISTS brand_kits;
DROP TABLE IF EXISTS director_checkpoints;
DROP TABLE IF EXISTS director_metering;
DROP TABLE IF EXISTS director_steps;
DROP TABLE IF EXISTS director_jobs;

-- +goose StatementEnd
