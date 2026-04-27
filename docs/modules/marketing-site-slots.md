# Marketing site slots (nextapi.top)

Public read: `GET /v1/public/marketing/slots` — returns presigned HTTPS URLs for configured slots (rate limited).

Operator write: `X-Op-Session` on `/v1/internal/admin/marketing/slots/*` — list, set external HTTPS URL, multipart upload to R2, delete slot.

## Slot keys (v1)

| Key | Purpose | `media_kind` |
| --- | --- | --- |
| `landing_hero_main` | Homepage hero | `video` or `image` |
| `gallery_strip_1` … `gallery_strip_5` | Landing gallery cards | `image` |

Keys must match `^[a-z][a-z0-9_]{1,48}$`.

## R2 safety (public API)

`GET /v1/public/marketing/slots` presigns **only** object keys whose normalized path starts with `marketing/site-slots/`. Keys outside that prefix are omitted from the response so customer job objects cannot be exposed by misconfiguration. Operator uploads already write under this prefix.

## Site build

Marketing pages call `NEXT_PUBLIC_API_URL` (default `https://api.nextapi.top`) for public slots. Ensure the marketing build has the correct API base if you use a staging API.

## Admin UI

`apps/admin` → **Marketing site** in the sidebar: manage presets above, optional custom slot key, HTTPS URL or file upload (video may include optional poster image upload).
