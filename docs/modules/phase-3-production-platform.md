# Phase 3 Production Platform

## Goal

Turn NextAPI from an AI video generation tool into an AI video production platform:

```text
workflow + template + character references + batch runs + tasks + billing + asset library
```

Every production feature must build on the current video task system. The platform should let a customer choose a workflow, bind a reusable character, provide variables, and generate many videos with existing billing and task tracking.

## Hard Constraints

- Do not modify Seedance provider code.
- Do not call upstream Seedance directly from new modules.
- Do not create a second task system.
- Do not create a second billing system.
- Do not change existing `/v1/videos` payload fields.
- Do not change job status values.
- Do not make every node an AI execution unit.
- Do not start with a distributed workflow engine.

All AI execution continues through the existing video task creation path.

## Priority

1. Workflow Batch Generation
2. Character Consistency System
3. Template Marketplace
4. Automation / Scheduler
5. Team / ToB
6. Multi-shot Timeline

This order favors revenue and differentiation before heavier platform infrastructure.

## 1. Workflow Batch Generation

### Scope

Run one workflow many times with variable expansion.

Example:

```json
{
  "character": ["Girl A", "Girl B"],
  "scene": ["city", "forest"],
  "action": ["running", "turning back"]
}
```

Modes:
- `cartesian`: all combinations
- `zip`: row-aligned combinations

### API

- `POST /v1/workflows/:id/batches`
- `GET /v1/workflow-batches/:id`
- `GET /v1/workflow-batches/:id/runs`

### Schema

```sql
workflow_batches (
  id uuid primary key,
  workflow_id uuid not null,
  org_id uuid not null,
  mode text not null,
  variables jsonb not null,
  total_count int not null,
  success_count int not null default 0,
  failed_count int not null default 0,
  total_cost_cents bigint not null default 0,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

Add `batch_id` to `workflow_runs`.

### Rules

- Expand variables into independent workflow run snapshots.
- Each child run creates a normal existing job.
- Existing spend controls, billing reservations, moderation, and throughput remain authoritative.
- If balance or spend cap fails, stop creating more child jobs and mark the batch partially failed.
- Do not pre-charge the whole batch outside the existing reservation path.

## 2. Character Consistency System

### Scope

Reusable character references that can be bound to workflows and injected into existing video inputs.

### API

- `POST /v1/characters`
- `GET /v1/characters`
- `GET /v1/characters/:id`
- `PATCH /v1/characters/:id`
- `DELETE /v1/characters/:id`

### Schema

```sql
characters (
  id uuid primary key,
  org_id uuid not null,
  project_id uuid null,
  name text not null,
  description text,
  reference_images jsonb not null,
  default_image_url text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

### Workflow Integration

`image.input` may reference `character_id`.

The adapter resolves the character and injects references into:
- `first_frame_url` for the main character frame
- `image_urls` for additional reference images

No embedding or model training is part of the first character release.

## 3. Template Marketplace

### Scope

Monetize reusable workflows and templates.

The current template module remains the source of truth. Marketplace data is an extension, not a replacement.

### API

- `POST /v1/templates/:id/publish`
- `GET /v1/marketplace/templates`
- `POST /v1/marketplace/templates/:id/install`
- `POST /v1/templates/:id/run`

### Schema

```sql
template_marketplace (
  template_id uuid primary key,
  org_id uuid not null,
  visibility text not null,
  price_cents bigint not null default 0,
  revenue_cents bigint not null default 0,
  rating numeric,
  purchase_count int not null default 0,
  published_at timestamptz
);
```

Template runs should compile into workflow JSON or the existing `/v1/videos` payload, then use the normal task path.

## 4. Automation / Scheduler

### Scope

Scheduled or trigger-based workflow runs.

Examples:
- run a workflow every morning
- run when a new asset is uploaded
- run from an external webhook

### API

- `POST /v1/workflows/:id/schedules`
- `GET /v1/workflow-schedules`
- `PATCH /v1/workflow-schedules/:id`
- `DELETE /v1/workflow-schedules/:id`

### Schema

```sql
workflow_schedules (
  id uuid primary key,
  workflow_id uuid not null,
  org_id uuid not null,
  cron text,
  trigger_type text not null,
  status text not null,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

Automation should enqueue workflow runs; it must not invoke Seedance directly.

## 5. Team / ToB

Use the existing `orgs` and `org_members` model first.

Add new team tables only if org membership is insufficient for enterprise permissions.

Possible later additions:
- project-level roles
- member usage rollups
- approval policies for expensive batch runs
- shared character and template libraries

## 6. Multi-shot Timeline

Do this last.

Concept:

```text
scene 1 -> scene 2 -> scene 3 -> final assembly
```

Each scene points to a workflow run. Video stitching and transitions are separate post-processing operations and must not replace the existing video generation task model.

Possible schema:

```sql
video_projects (
  id uuid primary key,
  org_id uuid not null,
  name text not null,
  scenes jsonb not null,
  final_video_url text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

## Cost Control Strategy

- Estimate before run using the existing provider estimate path.
- For batch runs, estimate per child item and total estimated cost.
- Enforce current spend controls and balance checks through `job.Service.Create`.
- Stop batch expansion when a child job fails due to balance, spend cap, monthly limit, or throughput.
- Track aggregate cost from existing jobs/videos, not a separate ledger.
- Add per-batch max count and max estimated cost before opening the UI to high-volume customers.

## Analytics

Start with derived reporting over existing tables:
- videos per day
- success rate
- cost by org
- template usage
- batch success/failure rate
- top characters/templates

Do not add a separate analytics store until operational queries become expensive.

## Implementation Sequence

1. Canvas Workflow MVP
2. Workflow batch runner
3. Character library
4. Template marketplace publish/install
5. Scheduler
6. Enterprise permissions and usage reporting
7. Timeline and post-processing

Each stage must ship with executable validation and a rollback path.
