# Production Platform v0.3

## Purpose

Production Platform v0.3 turns the existing API, Canvas, workflow adapter, template entry, and batch service into a money-path MVP:

```
template -> short form -> optional variables -> workflow_json -> existing video task pipeline
```

The product goal is not another AI video generator. The product goal is a reusable video production line for short drama, ecommerce, and talking-creator teams.

## What Already Exists

- Seedance API integration and provider calls
- `/v1/videos` task creation, billing, moderation, throughput, status, and results
- Canvas workflow JSON and `WorkflowToExistingVideoPayload`
- Template storage via the existing `templates` table
- Template entry via `POST /v1/templates/:id/run`
- Batch infrastructure via `batch_runs` and `/v1/batch/runs`

## v0.3 Scope

Included:
- workflow/template batch generation using existing `batch.Service`
- cartesian and zip variable expansion for template inputs
- minimal character library for reusable reference images
- commercial template polish and pricing copy

Excluded:
- direct Seedance calls
- new task or billing systems
- marketplace revenue share
- scheduler automation
- team permissions
- timeline and video stitching

## Architecture

```
Templates page
  -> single run: POST /v1/templates/:id/run
  -> batch run: POST /v1/templates/:id/run-batch

run-batch
  -> expand variables
  -> ApplyTemplateInputs per variant
  -> WorkflowToExistingVideoPayload per variant
  -> batch.Service.Create
  -> job.Service.Create
  -> existing worker/provider/billing/status
```

## Batch Strategy

`run-batch` should not create another workflow batch table. It should use the existing `batch_runs` and `jobs.batch_run_id` relationship:

- compile each variant into a `provider.GenerationRequest`
- call `batch.Service.Create`
- store original template inputs and variants in `manifest`
- poll status through existing `/v1/batch/runs/:id` and `/v1/batch/runs/:id/jobs`

## Character Strategy

Characters are reusable image references only:

- no embedding generation in v0.3
- no provider-level changes
- template forms may read a character and inject its first reference image URL into an existing image field

## Guardrails

- All generation must still flow through existing job/video creation.
- Cost and quota enforcement must stay in existing billing/spend logic.
- Batch discounts and packaging are UI/product copy first; settlement remains current credits/cents accounting.
- Public image URLs are still validated by the existing workflow adapter.

## Verification

- `go test ./...`
- `pnpm --filter @nextapi/ui check-i18n`
- `pnpm --filter @nextapi/dashboard typecheck`
- `pnpm --filter @nextapi/dashboard build`

Manual:
- run one template
- run a batch from the same template
- poll batch summary and jobs
- verify generated jobs appear in the existing Jobs/Video system
- verify Canvas still runs unchanged
