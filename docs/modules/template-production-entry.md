# Template Production Entry MVP

## Purpose

Template Production Entry turns the existing Canvas, workflow adapter, and video task system into a customer-facing production entry. The customer starts from a business template, fills a short form, and receives a normal video task without opening Canvas.

This module is intentionally a thin layer:

```
template form -> workflow_json override -> WorkflowToExistingVideoPayload -> existing video job pipeline
```

## Scope

Included:
- a dashboard `/templates` entry with three production templates
- server-side template input application
- `POST /v1/templates/:id/run`
- starter system templates for short drama, ecommerce, and talking creator use cases
- task status polling through the existing `/v1/videos/:id` endpoint

Excluded:
- direct Seedance calls
- a second task system
- a second billing system
- template marketplace payment, ratings, or revenue share
- batch generation, automation, team permissions, or timeline editing

## Constraints

- All generation must reuse the existing job/video creation path.
- Canvas remains the advanced editor; templates are the primary money path.
- Template inputs only mutate workflow node data before the existing adapter compiles it.
- Ordinary nodes never execute AI; only `seedance.video` can trigger generation through the workflow adapter.
- Routes follow the repo convention under `/v1/*`, not `/api/*`.

## Template Inputs

The MVP supports three template slugs:

- `short-drama-production-v1`
- `ecommerce-product-production-v1`
- `talking-creator-production-v1`

Each template accepts a compact `inputs` object. The backend validates the required fields and maps them into existing node data:

- image fields update connected `image.input` nodes
- text fields build the `prompt.input` prompt
- `duration` and `aspect_ratio` update the connected `video.params` node

The resulting workflow JSON is never sent to Seedance directly. It is compiled through `WorkflowToExistingVideoPayload`, then submitted to the existing job service.

## API

`POST /v1/templates/:id/run`

Request:

```json
{
  "inputs": {
    "female_image": "https://cdn.nextapi.top/example/heroine.png",
    "male_image": "https://cdn.nextapi.top/example/hero.png",
    "scene": "rainy neon street",
    "plot": "the heroine discovers the betrayal",
    "duration": 5,
    "aspect_ratio": "9:16"
  }
}
```

Response reuses the workflow run shape:

```json
{
  "run_id": "wr_xxx",
  "task_id": "vid_xxx",
  "video_id": "vid_xxx",
  "status": "queued",
  "estimated_cost_cents": 500
}
```

## Frontend

`/templates` presents three cards and a short form per template. On submit, the page calls `POST /v1/templates/:id/run`, then polls `/v1/videos/:id` just like Canvas does.

## Verification

- `go test ./internal/workflow`
- `go test ./...`
- `pnpm --filter @nextapi/ui check-i18n`
- `pnpm --filter @nextapi/dashboard typecheck`
- `pnpm --filter @nextapi/dashboard build`

Manual checks:
- submit all three starter templates with public HTTPS image URLs
- confirm each returns a normal video task id
- confirm the task appears through existing video status endpoints
- confirm `/canvas` still saves and runs existing workflows unchanged

## Rollback

- hide the `/templates` dashboard entry
- remove `POST /v1/templates/:id/run` route wiring
- remove the starter template seed migration

The Seedance provider, job worker, billing, workflow run, and `/v1/videos` paths remain unchanged.
