# Canvas Workflow

## Purpose

Canvas Workflow adds a visual, node-based input layer for video generation in the dashboard. It is not a second provider integration, task runner, billing path, or general DAG engine. The first version is a thin adapter that turns a saved workflow JSON into the existing `/v1/videos` request shape.

The product goal is a ComfyUI-like web workflow for Seedance2.0 character and scene consistency while preserving the current NextAPI gateway contract.

## Non-goals

- Do not modify Seedance provider code.
- Do not change the `/v1/videos` request fields.
- Do not change job status values or polling behavior.
- Do not create a second video task table.
- Do not create a second billing or reservation flow.
- Do not let ordinary nodes trigger AI calls.
- Do not build loops, conditionals, multi-branch execution, or a distributed workflow engine in v1.

This module intentionally differs from the previously rejected template/workflow product surface: it is a dashboard canvas input method plus a server-side adapter over the existing video task system.

## Architecture

```text
Dashboard Canvas
  -> workflow JSON
  -> workflow adapter
  -> existing /v1/videos payload
  -> job.Service.Create
  -> jobs + videos + billing + worker
  -> existing Seedance provider
```

Only `seedance.video` nodes execute. `image.input`, `prompt.input`, `video.params`, and `output.preview` nodes only collect or display data.

## MVP Node Types

### image.input

Stores one visual reference.

Fields:
- `asset_id`
- `image_url`
- `image_type`: `character`, `scene`, or `reference`

### prompt.input

Stores the prompt text.

Fields:
- `prompt`

### video.params

Stores video settings.

Fields:
- `duration`
- `aspect_ratio`
- `resolution`
- `camera_motion`
- `consistency_mode`
- `negative_prompt`
- `seed`

Only fields supported by the current `/v1/videos` payload are forwarded. Unsupported product fields remain in workflow JSON until a deliberate adapter rule is added.

### seedance.video

The only executable node.

Inputs:
- one `prompt.input`
- at least one `image.input`
- optional `video.params`

Outputs:
- `task_id`
- `video_id`
- `video_url`
- `status`

### output.preview

Displays the existing video task result.

Fields:
- `video_url`
- `download_url`

## Adapter Mapping

The adapter compiles workflow data to the current video create payload:

```json
{
  "model": "seedance-2.0-pro",
  "input": {
    "prompt": "...",
    "duration_seconds": 5,
    "resolution": "1080p",
    "aspect_ratio": "9:16",
    "seed": 123,
    "first_frame_url": "https://...",
    "image_urls": ["https://..."]
  }
}
```

Mapping rules:
- `prompt.input.data.prompt` -> `input.prompt`
- `video.params.data.duration` -> `input.duration_seconds`
- `video.params.data.resolution` -> `input.resolution`
- `video.params.data.aspect_ratio` -> `input.aspect_ratio`
- `video.params.data.seed` -> `input.seed`
- first connected `image.input` with `image_type=character` -> `input.first_frame_url`
- remaining connected image nodes -> `input.image_urls`

`camera_motion`, `consistency_mode`, and `negative_prompt` are stored but not forwarded in the MVP because the current task payload does not expose them as first-class fields.

## API

Routes live under `/v1` to match the existing gateway.

- `POST /v1/workflows`
- `GET /v1/workflows/:id`
- `PATCH /v1/workflows/:id`
- `POST /v1/workflows/:id/duplicate`
- `POST /v1/workflows/:id/run`

`POST /v1/workflows/:id/run` reads the workflow, compiles the payload, calls `job.Service.Create`, creates the normal `videos` mirror row, records a `workflow_runs` row, and returns the existing task identity for polling.

## Persistence

`workflows` stores the editable canvas JSON. `workflow_runs` stores immutable execution snapshots and links to the existing `jobs` and `videos` rows.

Both tables are org-scoped, because the current API keys, billing, projects, jobs, videos, and asset library are org-scoped.

## Validation

Before running:
- exactly one `seedance.video` node is allowed
- a connected `prompt.input` node is required
- at least one connected `image.input` node is required for the MVP
- `duration_seconds` must fit the existing video validation window
- `aspect_ratio` and `resolution` must match current supported values

## Frontend

The MVP dashboard page is `/canvas`.

Layout:
- left: node palette
- center: React Flow canvas
- right: selected node inspector
- bottom/right: run status and output preview

The page uses the existing dashboard `apiFetch`, existing asset library endpoint, and existing video polling endpoint.

## Verification

Minimum checks:
- workflow adapter unit tests
- workflow run handler creates a normal job and video row
- `/jobs/new` still creates video tasks
- Canvas run returns a task id
- `GET /v1/videos/:id` returns the Canvas-created task
- dashboard typecheck/build passes

## Rollback

Rollback is low risk:
- hide the `/canvas` navigation entry
- disable `/v1/workflows/*` route wiring
- leave workflow tables in place or roll back migration

The Seedance provider, worker, billing, `/v1/videos`, and task status endpoints are not changed.
