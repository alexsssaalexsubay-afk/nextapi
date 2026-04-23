---
sidebar_position: 10
title: Operations & Platform Management
description: Retry policies, job lifecycle, batch runs, request logs, dead-letter queue, and rate limiting for NextAPI operators.
---

# Operations & Platform Management

NextAPI is designed to be operated by a small team with high confidence. This guide covers every runtime control surface available to platform operators — from job lifecycle management to rate limiting and observability.

---

## Job Lifecycle

Every video generation request goes through a defined state machine:

```
queued → submitting → running → succeeded
                   ↘ retrying → submitting (loop)
                             ↘ failed / timed_out
          ↘ failed
          ↘ canceled
```

| Status | Meaning |
|--------|---------|
| `queued` | Job created, waiting for a worker to pick it up |
| `submitting` | Worker is calling the provider API |
| `running` | Provider accepted the job, worker is polling for completion |
| `retrying` | A retryable error occurred; waiting for next attempt |
| `succeeded` | Video generated, credits reconciled, webhook delivered |
| `failed` | Permanent failure — credits refunded |
| `timed_out` | Provider did not respond within the poll window |
| `canceled` | Operator-canceled via admin API |

### Timestamps per Transition

Each job row stores timestamps for important lifecycle events:

| Column | Set When |
|--------|----------|
| `created_at` | Job row inserted |
| `submitting_at` | Worker starts the provider call |
| `running_at` | Provider accepted the job |
| `retrying_at` | Retry attempt scheduled |
| `timed_out_at` | Timeout threshold exceeded |
| `canceled_at` | Operator issued cancel |
| `completed_at` | Terminal state reached (succeeded/failed/timed_out/canceled) |

---

## Retry Policy

NextAPI implements application-level retry on top of Asynq task queues.

### Retryable Conditions

The following errors trigger an automatic retry:

- Network errors (DNS, connection refused, connection reset)
- Request timeouts / context deadline exceeded
- HTTP `429` Too Many Requests from the provider
- HTTP `5xx` from the provider (500, 502, 503, 504)

### Non-Retryable Conditions

The following errors fail immediately (no retry):

- Invalid request payload (`400` from provider)
- Authentication/authorization failures (`401`, `403`)
- Content policy violations from the provider

### Backoff Schedule

```
attempt 1 → 2s ± 30% jitter
attempt 2 → 4s ± 30% jitter
attempt 3 → 8s ± 30% jitter
attempt 4 → 16s ± 30% jitter
attempt 5 → 32s ± 30% jitter (final attempt)
```

Maximum delay is capped at 60 seconds. After 5 failed attempts, the job moves to `failed` and is archived to the dead-letter queue.

### Retry Metadata on Jobs

Each job tracks:

| Field | Type | Description |
|-------|------|-------------|
| `retry_count` | int | Number of attempts made so far |
| `last_error_code` | text | Error code from the last attempt |
| `last_error_msg` | text | Human-readable message from the last attempt |

---

## Batch Runs

A **batch run** groups multiple video generation jobs submitted together. Use batch runs when generating 10+ shots from a CSV manifest or an automated workflow.

### Create a Batch Run

```http
POST /v1/batch/runs
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "name": "ep01-opening-sequence",
  "shots": [
    {
      "prompt": "Close-up of Lin Feng studying at her desk...",
      "model": "seedance-v2-pro",
      "duration": 5,
      "aspect_ratio": "16:9"
    },
    {
      "prompt": "Wide shot of the campus at dawn...",
      "model": "seedance-v2-pro",
      "duration": 5,
      "aspect_ratio": "16:9"
    }
  ],
  "manifest": { "episode": "EP01", "director": "ops-team" }
}
```

Response:

```json
{
  "batch_run_id": "br_abc123",
  "job_ids": ["job_001", "job_002"],
  "total": 2,
  "status": "running",
  "created_at": "2026-04-23T10:00:00Z"
}
```

### Check Batch Status

```http
GET /v1/batch/runs/br_abc123
```

```json
{
  "id": "br_abc123",
  "status": "running",
  "summary": {
    "total": 100,
    "queued": 40,
    "running": 22,
    "succeeded": 35,
    "failed": 3
  }
}
```

### Retry Only Failed Shots

```http
POST /v1/batch/runs/br_abc123/retry-failed
```

This re-enqueues all jobs in `failed` or `timed_out` status within the batch. New job IDs are created; original failed jobs are preserved for audit.

### Download Batch Manifest

```http
GET /v1/batch/runs/br_abc123/manifest
```

Returns the original manifest JSON as a file download. Useful for reconciliation and re-runs.

---

## Request Logs

Every authenticated API call is recorded in `request_logs`. This gives you a searchable history of all API activity.

### What is Logged

| Field | Description |
|-------|-------------|
| `request_id` | Unique ID per request (also in `X-Request-Id` response header) |
| `org_id` | Organisation that made the call |
| `api_key_id` | Which key was used |
| `job_id` | If the call created a job, the job UUID |
| `batch_run_id` | If part of a batch |
| `endpoint` | Route path (e.g. `/v1/video/generations`) |
| `method` | HTTP method |
| `request_hash` | SHA-256 of the request body — for dedup detection |
| `response_status` | HTTP status code returned |
| `total_latency_ms` | End-to-end request latency |
| `error_code` | If the request failed, the error code |

:::note Privacy
Raw request bodies are **never stored**. Only a SHA-256 hash is kept. Prompt text and image URLs are not persisted in request logs.
:::

### Query Request Logs (Admin)

```http
GET /v1/internal/admin/request-logs?org_id=<uuid>&from=2026-04-01T00:00:00Z&limit=100
```

Parameters:

| Param | Description |
|-------|-------------|
| `org_id` | Filter by organisation |
| `job_id` | Filter by job |
| `status` | Filter by response HTTP status code |
| `from` / `to` | ISO8601 time range |
| `limit` / `offset` | Pagination (max 500) |

---

## Dead-Letter Queue

Jobs that exhaust all retry attempts are archived to the **dead-letter queue** (DLQ). These represent cases where the provider returned persistent errors.

### View Dead-Letter Jobs

```http
GET /v1/internal/admin/dead-letter?org_id=<uuid>
```

```json
{
  "data": [
    {
      "id": 42,
      "job_id": "job_xyz",
      "org_id": "org_abc",
      "reason": "provider_server_error",
      "retry_count": 5,
      "last_error": "HTTP 503: provider unavailable",
      "archived_at": "2026-04-23T09:15:00Z"
    }
  ],
  "total": 1
}
```

### Replay a Dead-Letter Job

```http
POST /v1/internal/admin/dead-letter/42/replay
```

Creates a new job with the same payload. Credits are re-reserved from the org's balance.

---

## Admin Job Tools

### Search Jobs

```http
GET /v1/internal/admin/jobs/search
```

Parameters:

| Param | Description |
|-------|-------------|
| `org_id` | Filter by organisation |
| `status` | One or more: `queued`, `running`, `failed`, `succeeded`, `retrying` |
| `provider` | e.g. `seedance` |
| `batch_run_id` | Filter by batch |
| `error_code` | Filter by specific error |
| `from` / `to` | ISO8601 time range |
| `limit` / `offset` | Pagination (max 200) |

### Inspect a Job

```http
GET /v1/internal/admin/jobs/<job_id>/detail
```

Returns full job row including all lifecycle timestamps, retry metadata, and execution metadata.

### Retry a Failed Job

```http
POST /v1/internal/admin/jobs/<job_id>/retry
```

Creates a new job with the same original request payload. The original failed job is kept unchanged for audit purposes.

### Cancel a Job

```http
POST /v1/internal/admin/jobs/<job_id>/force-cancel
```

Moves the job to `canceled` and issues a credit refund. Works on any non-terminal job.

---

## Rate Limiting

NextAPI enforces rate limits at multiple layers using a Redis sliding-window counter.

### Layers

| Layer | Default Limit | Window | Override |
|-------|--------------|--------|---------|
| Per-API-key | 600 req | 1 minute | `rate_limit_rpm` on the key row |
| Business surface | 600 req | 1 minute | — |
| Admin surface | 120 req | 1 minute | — |
| Sales inquiry | 10 req | 1 hour | — |

### Rate Limit Response

When a request is blocked, you receive:

```http
HTTP 429 Too Many Requests
Retry-After: <seconds>
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix timestamp>
```

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Please wait before retrying.",
    "request_id": "req_abc123"
  }
}
```

### Per-Key Rate Limit Override

To set a custom RPM limit on an API key:

```http
PATCH /v1/keys/<key_id>
Authorization: Bearer <ak_admin_key>

{ "rate_limit_rpm": 1200 }
```

Set to `0` or `null` to remove the per-key limit and fall back to the global default.

---

## Observability

### Prometheus Metrics

All metrics are exposed at `GET /metrics` (auth required — see deployment guide).

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `nextapi_http_requests_total` | counter | route, method, status | HTTP request count |
| `nextapi_http_request_duration_seconds` | histogram | route | Request latency |
| `nextapi_jobs_total` | counter | provider, status | Jobs reaching terminal state |
| `nextapi_jobs_failed_total` | counter | provider, error_code | Failed jobs by root cause |
| `nextapi_retry_total` | counter | provider, error_code | Retry attempts by trigger |
| `nextapi_provider_latency_ms` | histogram | provider | Provider submit latency (ms) |
| `nextapi_end_to_end_job_latency_ms` | histogram | provider, status | Full job wall-clock time (ms) |
| `nextapi_webhook_delivery_total` | counter | event_type, result | Webhook delivery outcomes |
| `nextapi_rate_limit_block_total` | counter | key_type, endpoint | Rate limit blocks |
| `nextapi_batch_runs_total` | counter | status | Batch run completions |
| `nextapi_dead_letter_total` | counter | provider, error_code | DLQ archives |
| `nextapi_jobs_by_status` | gauge | status | Current job count per status |
| `nextapi_provider_healthy` | gauge | provider | Provider health (1=up, 0=down) |

### Suggested Grafana Panels

1. **Job Throughput** — `rate(nextapi_jobs_total[5m])` by `status`
2. **Failure Rate** — `rate(nextapi_jobs_failed_total[5m])` by `error_code`
3. **Retry Rate** — `rate(nextapi_retry_total[5m])`
4. **Provider Latency p95** — `histogram_quantile(0.95, rate(nextapi_provider_latency_ms_bucket[5m]))`
5. **End-to-End Latency p95** — `histogram_quantile(0.95, rate(nextapi_end_to_end_job_latency_ms_bucket[5m]))`
6. **Rate Limit Blocks** — `rate(nextapi_rate_limit_block_total[5m])`
7. **Dead-Letter Queue** — `increase(nextapi_dead_letter_total[1h])`

### Health Endpoint

```http
GET /health
GET /v1/health
```

Returns `200 { "status": "ok" }` when the server is up. Postgres and Redis connectivity checks are in the provider health gauge.

---

## Audit Trail

Every state-changing admin action is recorded in `audit_log` and accessible via:

```http
GET /v1/internal/admin/audit
```

Audited actions include:

| Action | Trigger |
|--------|---------|
| `admin.credit.adjust` | Manual credit adjustment |
| `admin.key.create` | API key creation |
| `admin.key.revoke` | API key revocation |
| `admin.webhook.create/delete` | Webhook endpoint changes |
| `admin.job.retry` | Manual job retry |
| `admin.job.cancel` | Manual job cancellation |
| `admin.dlq.replay` | Dead-letter job replay |
| `admin.org.pause/unpause` | Org spend control changes |

Audit logs are immutable — they cannot be deleted or modified via the API.
