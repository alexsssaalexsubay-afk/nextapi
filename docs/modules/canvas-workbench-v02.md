# Canvas Professional Workbench v0.2

## Purpose

Canvas Professional Workbench v0.2 upgrades the Canvas MVP from "can run one workflow" to a safer, reusable production workbench. It adds workflow versioning, minimal template reuse, run visualization, and API export while preserving the existing Seedance, task, and billing systems.

## Scope

Included:
- `workflow_versions`
- save workflow versions on manual save
- restore workflow versions
- save a workflow as a template
- create a workflow copy from a template
- duplicate templates
- export the compiled `/v1/videos` payload as curl, JavaScript, and Python examples
- show Canvas node run state by mapping existing video task status

Excluded:
- marketplace, pricing, revenue share, ratings
- asset tags, favorites, recent usage
- batch runs
- automation and scheduler
- team permissions beyond existing org scoping
- timeline and multi-shot editing

## Constraints

- Do not call Seedance directly.
- Do not create a second task system.
- Do not create a second billing system.
- Do not change `/v1/videos` request fields.
- Do not change task status enums.
- Do not make ordinary nodes execute AI.

Templates and workflows here are production workbench artifacts over the existing video task system, not a revival of the old rejected workflow orchestration design.

## Existing Reuse

The repository already has:
- `templates` table from `backend/migrations/00014_templates.sql`
- `backend/internal/template`
- `backend/internal/gateway/templates.go`
- Canvas workflows from `backend/internal/workflow`

v0.2 extends those modules rather than creating duplicate systems.

## Data Model

Add workflow versions:

```sql
workflow_versions (
  id uuid primary key,
  workflow_id uuid not null,
  version int not null,
  workflow_json jsonb not null,
  change_note text,
  created_by text,
  created_at timestamptz not null
)
```

Extend existing `templates`:

```sql
ALTER TABLE templates
  ADD COLUMN workflow_json jsonb,
  ADD COLUMN recommended_inputs_schema jsonb not null default '[]',
  ADD COLUMN preview_video_url text,
  ADD COLUMN estimated_cost_cents bigint,
  ADD COLUMN usage_count bigint not null default 0;
```

The existing `input_schema` remains available for legacy batch/template flows. `recommended_inputs_schema` is specific to Canvas template UX.

## API

Workflow versioning:
- `GET /v1/workflows/:id/versions`
- `POST /v1/workflows/:id/versions`
- `POST /v1/workflows/:id/versions/:version_id/restore`

Templates:
- `POST /v1/workflows/:id/save-as-template`
- `POST /v1/templates/:id/use`
- `POST /v1/templates/:id/duplicate`

Export:
- `POST /v1/workflows/:id/export-api`

## Behavior

### Versioning

Every workflow create/update creates a version snapshot. Restoring a version updates the workflow JSON and then creates a new version with a restore note.

`workflow_runs.input_snapshot` remains the immutable execution snapshot, so historic runs are not affected by later workflow edits.

### Templates

Saving as template copies the current workflow JSON into the existing `templates` table. Using a template creates a new workflow for the current org and never mutates the original template.

System templates are read-only to customers. Private org templates can be duplicated or used by that org.

### API Export

Export compiles workflow JSON through the same adapter used by workflow runs. It returns examples for the existing `/v1/videos` endpoint only.

### Run Visualization

The frontend maps existing task status to node status:
- `queued` / `submitting` -> waiting
- `running` / `retrying` -> running
- `succeeded` -> success
- `failed` / `timed_out` / `canceled` -> failed

No new task status system is introduced.

## Verification

- `go test ./internal/workflow`
- `go test ./...`
- `pnpm --filter @nextapi/ui check-i18n`
- `pnpm --filter @nextapi/dashboard typecheck`
- `pnpm --filter @nextapi/dashboard build`

Manual checks:
- save a workflow and confirm a version exists
- restore a version
- save a workflow as a template
- use template to create a new workflow copy
- export API examples
- run workflow and observe node state changing

## Rollback

- hide Canvas v0.2 actions in the dashboard
- disable the new workflow/template routes
- leave the new columns/tables unused or roll back migration

Seedance provider, job worker, billing, and `/v1/videos` remain unchanged.
