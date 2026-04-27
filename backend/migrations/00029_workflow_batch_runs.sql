-- +goose Up
-- +goose StatementBegin

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS batch_run_id UUID REFERENCES batch_runs(id) ON DELETE SET NULL;

ALTER TABLE workflow_runs
  ALTER COLUMN job_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_batch_run
  ON workflow_runs (batch_run_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_workflow_runs_batch_run;

ALTER TABLE workflow_runs
  DROP COLUMN IF EXISTS batch_run_id;

-- Existing multi-shot rows must be removed before this down migration can
-- safely restore the historical single-job invariant.
ALTER TABLE workflow_runs
  ALTER COLUMN job_id SET NOT NULL;

-- +goose StatementEnd
