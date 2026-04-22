# Webhook Module

## Purpose
Outbound notifications to customer URLs on job lifecycle and budget events.

## Invariants
- Every outbound delivery carries header `X-NextAPI-Signature: t=<unix>,sha256=<hex>`
  computed with `HMAC-SHA256(webhook.secret, "<unix>.<body>")`.
- Every delivery carries headers:
  - `X-NextAPI-Event: <event_type>` (e.g. `video.succeeded`)
  - `X-NextAPI-Timestamp: <unix>` (replay protection — customers should reject >5m old)
- Retries: 30s, 2m, 10m, 1h, 6h, 24h — then give up (6 attempts max).
- Idempotency: `webhook_deliveries.id` is monotonic; customer should dedupe
  using the `id` field in payload.
- Secret rotation: old secret preserved in `prev_secret` with `rotated_at` timestamp
  for a 24h grace window. Deliveries during this window should verify against both secrets.

## Events

### Job events
- `job.succeeded` — payload: `{id, status, video_url, cost_credits}`
- `job.failed` — payload: `{id, status, error_code, error_message}`

### Budget events
- `budget.alert` — soft alert threshold crossed
- `budget.auto_paused` — org auto-paused due to low balance
- `budget.monthly_limit` — monthly spend limit reached

### Event filtering
Webhook registrations accept an `event_types` array with exact match or wildcard patterns:
- `video.*` matches all video events
- `budget.alert` matches only budget alerts
- Default (if empty): `["job.succeeded", "job.failed"]`

## Data model
- **webhooks** — per-org registered endpoints
  - `id`, `org_id`, `url`, `secret`, `prev_secret`, `event_types`, `rotated_at`, `disabled_at`
- **webhook_deliveries** — one row per (webhook × event), status tracked until delivered or give up
  - `id`, `webhook_id`, `event_type`, `payload`, `status_code`, `error`, `attempt`, `signature`, `timestamp_unix`, `next_retry_at`, `delivered_at`

## Public API surface

### Customer-facing (ak_* key required)
- `POST /v1/webhooks` — create webhook (secret shown once in response)
- `GET /v1/webhooks` — list all webhooks for the org
- `GET /v1/webhooks/:id` — get single webhook details
- `DELETE /v1/webhooks/:id` — remove webhook
- `GET /v1/webhooks/:id/deliveries` — list delivery attempts for a webhook (paginated)
- `POST /v1/webhooks/:id/rotate` — rotate secret; old secret preserved for 24h grace

### Admin/operator (internal token)
- `POST /v1/internal/admin/webhooks/deliveries/:id/replay` — re-queue a failed delivery

## Signature verification (customer-side)

```python
import hmac, hashlib, time

def verify(secret, signature_header, body, max_age=300):
    parts = dict(p.split("=", 1) for p in signature_header.split(","))
    ts = int(parts["t"])
    if abs(time.time() - ts) > max_age:
        raise ValueError("timestamp too old")
    expected = hmac.new(
        secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(parts["sha256"], expected):
        raise ValueError("signature mismatch")
```

## Test coverage
- Signature format and determinism
- Event pattern matching (exact, wildcard, budget events)
- Backoff schedule validation
- ListDeliveries ordering and pagination
- Replay resets delivery for re-attempt
- RotateSecret preserves old secret
- Wrong org_id returns not found
