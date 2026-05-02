# Seedance Relay Webhook and Assets

## Purpose

Document the production hooks around the managed Seedance relay without adding a
second generation pipeline. Webhooks and assets feed the existing job, video,
billing, and media library tables.

## Scope

Included:
- `POST /api/webhooks/seedance` as the public callback name for managed Seedance task callbacks.
- HMAC-SHA256 signature verification via `SEEDANCE_RELAY_WEBHOOK_SECRET`.
- Idempotent status updates by upstream task ID / local `jobs.provider_job_id`.
- Seedance asset upload/get/wait helpers.
- Media library persistence for Seedance asset ID, asset URL, asset status,
  processing status, and rejection reason.
- Dashboard library responses expose a generation URL that prefers active `asset://` URLs.

Excluded:
- Replacing polling. Polling remains the fallback and still handles jobs missed by webhook delivery.
- A separate asset library service or task system.
- Customer-facing upstream API keys.

## HTTP surface

- **Route:** `POST /api/webhooks/seedance` (same origin as the Go API, e.g. `https://api.nextapi.top/api/webhooks/seedance`).
- **Auth:** HMAC-SHA256 over the raw JSON body (and, when a Unix timestamp header is present, an alternate payload `timestamp + "." + body`) using `SEEDANCE_RELAY_WEBHOOK_SECRET`. Older single-name secret env vars listed in `.env.example` remain supported for rolling upgrades.
- **Replay protection:** timestamp header must be within ±10 minutes of server time when provided.

## Behavior

Webhook success updates the existing job/video rows and stores `video_url`.
Webhook failure stores upstream `error.code` and `error.message` and refunds the
reserved credits only if the job is not already terminal.

The asset path is best-effort and opt-in. When `SEEDANCE_RELAY_ASSETS_ENABLED=true`,
library image uploads are also registered with the managed Seedance relay. The
media asset row stores the upstream asset ID, `asset://` URL, current status,
`processing_status`, and `rejection_reason`. UpToken status values are treated
as `ready | pending | active | failed`: `active` is the stable portrait path for
real-person references, `ready` means the upstream can use the URL directly, and
`failed` must keep the upstream rejection reason visible to the dashboard. The
generation URL in API responses uses the upstream URL only when the asset is
usable; otherwise callers should treat the R2 HTTPS URL as preview-only for
person references.

Library list responses also refresh non-terminal upstream asset status by
`virtual_id`. This matters for person-reference photos: an upload may still be
`processing` when the dashboard first returns, but once UpToken marks it
`active`, the next library list response persists the active status and switches
`generation_url` to the upstream asset URL. If UpToken marks the asset `failed`,
the same refresh path persists `rejection_reason` so users see the actionable
upstream moderation/review message instead of a generic pending state.

## Verification

- `go test ./...`
- `pnpm --filter @nextapi/dashboard typecheck`
- `pnpm --filter @nextapi/ui check-i18n`
