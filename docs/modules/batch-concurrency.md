# Batch Concurrency — Bounded Step Dispatch

## Current Contract

Batch Studio, template runs, Canvas multi-shot workflows, and AI Director all use the same batch/job pipeline.

The platform does **not** enqueue every video task at once anymore. A batch creates and reserves all accepted jobs first, then dispatches only a bounded wave to the worker queue. When a shot finishes through worker polling or upstream webhook completion, the dispatcher releases the next queued job in the same batch.

This is the first production-safe Step Machine layer:

```text
batch accepted
-> all jobs created as queued + reserved
-> dispatch up to max_parallel
-> worker/webhook marks a job terminal
-> dispatch next queued job
-> batch complete
-> merge can proceed
```

## Why This Design

- Keeps user submissions idempotent and auditable: every accepted shot has a job/video record before dispatch.
- Prevents a single large batch from occupying all worker/network capacity.
- Lets operators sell higher concurrency tiers without creating a second task system.
- Keeps billing safe: reservation happens before dispatch; refund/reconcile paths remain in the existing job pipeline.
- Makes AI Director practical: multi-shot stories can enter the queue without turning the HTTP request into a long-running video worker.

## Runtime Fields

`batch_runs.max_parallel` controls the number of jobs that may be submitting/running at the same time for one batch.

Current default when unset: `5`.

Current hard cap for Director workflow metadata: `20`.

AI Director now writes workflow metadata:

```json
{
  "source": "director",
  "max_parallel": 3
}
```

When `/v1/workflows/:id/run` detects multiple `seedance.video` nodes, it reads `metadata.max_parallel` and passes it into `batch.Create`.

## API Surface

### Batch Studio

`POST /v1/batch/runs`

```json
{
  "max_parallel": 5,
  "items": []
}
```

### Template Batch

`POST /v1/templates/:id/run-batch`

```json
{
  "max_parallel": 5,
  "inputs": []
}
```

### AI Director

`POST /v1/director/mode/run`

```json
{
  "run_workflow": true,
  "options": {
    "max_parallel": 3
  }
}
```

The Dashboard Director UI exposes this as a compact slider named `Parallel shots`.

## Verified Evidence

Latest verified slice:

- `go test ./internal/director ./internal/workflow ./internal/batch ./internal/job`
- `pnpm --filter @nextapi/ui check-i18n`
- `pnpm --filter @nextapi/dashboard typecheck`
- `pnpm --filter @nextapi/dashboard build`
- Server deploy at commit `2aa239d`
- `https://api.nextapi.top/health` returned `{"status":"ok"}`
- `director-sidecar` smoke returned `{"status":"ok","provider_callback_calls":4,"shot_count":2,"source":"vendored_director_pipeline"}`

## Not Yet Done

- Per-plan Admin concurrency tiers.
- 100-user load test.
- Web UI for retrying only failed shots inside a Director batch.
- Durable external orchestrator such as Temporal/Cloudflare Workflows.
- Automatic merge verification against real provider-produced media.
