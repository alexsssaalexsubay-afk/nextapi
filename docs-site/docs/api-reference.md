---
title: API Reference
sidebar_label: API Reference
description: Public REST surface for video generation — models, /v1/videos, and legacy compatibility endpoints.
---

# API Reference

**Canonical spec:** the OpenAPI document in the NextAPI repository (`backend/api/openapi.yaml`) and the live description at `https://api.nextapi.top/v1`. This page is a **human summary**; when in doubt, trust the OpenAPI file.

**Base URL:** `https://api.nextapi.top/v1` (or `http://localhost:8080/v1` in local development)

**Auth:** `Authorization: Bearer sk_live_…` or `sk_test_…` for customer-facing routes listed below.

---

## Primary surface (recommended)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/models` | List public model catalogue (cursor pagination) |
| `GET` | `/models/{model_id}` | Get one model |
| `POST` | `/videos` | Create a **video** job (async, `202 Accepted`) |
| `GET` | `/videos` | List videos (filters: `status`, `model`, date range) |
| `GET` | `/videos/{id}` | Get status, input echo, `output`, costs, errors |
| `DELETE` | `/videos/{id}` | Cancel or delete (when not terminal) |
| `GET` | `/videos/{id}/wait` | Long-poll until terminal state (optional `timeout` query) |

On **`POST`** requests that support it, send a **`Idempotency-Key`** header (duplicates with the same key and body de-duplicate for 24h — see OpenAPI). Responses may include **`X-Request-Id`**.

### Model IDs (public)

Primary video catalogue IDs: **`seedance-2.0-pro`**, **`seedance-2.0-fast`**. Legacy strings such as `seedance-2.0` are still accepted and map to the same tiers (see `GET /models`).

### POST `/videos` — request body

Required top-level: **`model`**, **`input`**. `input` must include **`prompt`**.

```json
{
  "model": "seedance-2.0-pro",
  "input": {
    "prompt": "A person walks into a sunlit room",
    "duration_seconds": 5,
    "resolution": "1080p",
    "image_url": "https://example.com/optional-first-frame.png"
  },
  "webhook_url": "https://example.com/hooks/nextapi"
}
```

Optional `input` fields (when supported by the model) include: `mode` (`fast` | `normal`), `aspect_ratio`, `fps` (`24` | `30`), `generate_audio`, `watermark`, `seed`, `camera_fixed`, and a `references` array of `{ "type", "url", "role" }` objects. See the OpenAPI `VideoInput` schema for the full list and constraints (e.g. `duration_seconds` between **4 and 15** when set).

### POST `/videos` — success (`202`)

```json
{
  "id": "vid_01HXXX",
  "object": "video",
  "status": "queued",
  "model": "seedance-2.0-pro",
  "created_at": "2026-04-24T12:00:00Z",
  "estimated_cost_cents": 50
}
```

### GET `/videos/{id}`

Returns the same `video` object with `input`, `output` (when succeeded), `estimated_cost_cents`, `actual_cost_cents`, and `error_code` / `error_message` on failure. Successful generations expose `output.video_url` (signed; short TTL — download for archival).

**Polling:** a few seconds between polls is enough; you can also use `GET /videos/{id}/wait` or [configure webhooks](./webhooks) for your organisation.

### Example: curl

```bash
curl -sS -X POST "https://api.nextapi.top/v1/videos" \
  -H "Authorization: Bearer sk_live_yourkey" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "A person walks into a sunlit room",
      "duration_seconds": 5,
      "resolution": "1080p"
    }
  }'
```

```bash
curl -sS "https://api.nextapi.top/v1/videos/vid_01HXXX" \
  -H "Authorization: Bearer sk_live_yourkey"
```

---

## Legacy compatibility (still supported)

These routes share the same generation pipeline as `/v1/videos` but use a **flat** JSON body and return **job-shaped** JSON (not the `object: "video"` envelope).

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/video/generations` | `prompt` required; use **`duration_seconds`** (not `duration`); `model`, `image_url`, `resolution`, `aspect_ratio`, etc. |
| `GET` | `/jobs/{id}` | Poll by **job** id returned from the legacy create call |

**Legacy create response (`202`):** `id`, `status`, `estimated_credits` (credits, not USD cents).  
**Legacy GET** returns: `id`, `status`, `video_url`, `error_code`, `error_message`, `created_at`, `completed_at`, etc.

New integrations should prefer **`POST /v1/videos`** and **`GET /v1/videos/{id}`** so field names and costs line up with the rest of the API and documentation.

---

## Outbound webhooks and credits

- **Per-request:** optional `webhook_url` on `POST /v1/videos` (see OpenAPI).  
- **Per-organisation:** register endpoints with `POST /v1/webhooks` so completion events are delivered with HMAC signatures — see the [Webhooks](./webhooks) guide.

Account balance and usage use **cents in USD** on the `/v1/videos` object (`estimated_cost_cents` / `actual_cost_cents`). The dashboard and legacy fields may still refer to “credits” in some places; the OpenAPI `Video` schema is authoritative for the new surface.

---

## Rate limits

- The business API group applies a **per-key default** of **600 requests per minute** (see `X-RateLimit-*` on responses) for authenticated traffic.
- If the key has **`rate_limit_rpm`** set in **Dashboard → Keys → Edit**, an **additional** per-minute cap is enforced. You may see **`429`** with `error.code` **`key_rate_limited`** when the per-key cap bites.

Check **`X-RateLimit-*`** and **`X-RateLimit-Key-*`** response headers and adjust your key or pacing accordingly.

---

## Error shape

Error bodies generally look like:

```json
{ "error": { "code": "invalid_request", "message": "…" } }
```

Exact codes for moderation, idempotency conflicts, and upstream failures are documented in the OpenAPI `responses` section. See also [Error codes](./errors).
