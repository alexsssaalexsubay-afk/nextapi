# Job Module

## Purpose
Async job engine. Client POSTs → 202 + job_id → worker calls provider → poll or webhook.

## Lifecycle
```
queued → running → succeeded
                 ↘ failed
```

## Invariants
- `POST /v1/video/generations` is NEVER synchronous.
- Credits reserved (negative delta) BEFORE enqueue. Insufficient balance → 402.
- Completion: `reconciliation` (delta = actualCost - reservedCost).
- Failure: `refund` (delta = +reservedCost).
- Job row is the single source of truth for client polling.

## Data model (00003_jobs.sql)
- **jobs**: id uuid, org_id, api_key_id, provider, provider_job_id,
  request jsonb, status, video_url, tokens_used, cost_credits,
  error_code, error_message, created_at, completed_at.

## Queue
- Asynq on Redis. Tasks:
  - `video:generate` — calls provider, stores provider_job_id.
  - `video:poll`     — periodic (10s) GetJobStatus until terminal.

## Public surface
- `POST /v1/video/generations` — create job (202)
- `GET  /v1/jobs/:id` — status (org-scoped)
