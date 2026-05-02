# Provider Module

## Purpose
Provider Adapter pattern. v1 ships two live backends (Volcengine Ark direct and
managed Seedance relay) plus a deterministic mock; Kling/Zhipu are stubs so the
interface is proven but not shipped.

## Invariants
- `Provider` interface is the ONLY way handlers talk to upstream video AI.
- Every provider exposes: `Name`, `EstimateCost`, `GenerateVideo`, `GetJobStatus`, `IsHealthy`.
- `PROVIDER_MODE=mock` short-circuits to `MockProvider` (returns deterministic fake URL after ~10s).
- `PROVIDER_MODE=live` requires `VOLC_API_KEY`; missing → startup error. Talks to Volcengine Ark directly at `SEEDANCE_BASE_URL` (default: `https://ark.cn-beijing.volces.com/api/v3`).
- `PROVIDER_MODE=seedance_relay` requires `SEEDANCE_RELAY_API_KEY`; missing → startup error. Talks to the managed Seedance relay at `SEEDANCE_RELAY_BASE_URL`.
- Cost estimation is deterministic; no network call in `EstimateCost`. The relay reuses the Seedance estimation table because it relays the same upstream model family.

## Pricing (hardcoded, refactor later)
- fast  + image : $0.0033 / 1K tokens
- fast  + text  : $0.0056 / 1K tokens
- normal+ image : $0.0043 / 1K tokens
- normal+ text  : $0.0070 / 1K tokens
- Estimation: `55000 tokens/sec * duration_seconds * resolution_scale`
  - 1080p → 1.0, 720p → 0.55, 480p → 0.3

## Public surface
```
type Provider interface {
    Name() string
    EstimateCost(req GenerationRequest) (tokens int64, credits int64, err error)
    GenerateVideo(ctx, req) (providerJobID string, err error)
    GetJobStatus(ctx, providerJobID) (*JobStatus, error)
    IsHealthy(ctx) bool
}
```

## Backends at a glance

| Mode      | Env required                 | Upstream                          | Endpoint                                       | Notes                              |
|-----------|------------------------------|-----------------------------------|------------------------------------------------|------------------------------------|
| `mock`    | —                            | in-memory                         | —                                              | Deterministic; default for dev/CI  |
| `live`    | `VOLC_API_KEY`               | Volcengine Ark                    | `POST /contents/generations/tasks`             | Direct to Ark; needs 方舟 开通     |
| `seedance_relay` | `SEEDANCE_RELAY_API_KEY` | Managed Seedance relay | `POST /v1/video/generations` | Turnkey; no Ark account required   |

### Seedance (`live`)
- `SEEDANCE_MODEL_MAP="publicID:arkID,…"` must map every public catalogue ID to the Ark endpoint you have provisioned. Unknown IDs pass through verbatim so customers can target an Ark ID directly.
- See [OPERATOR-HANDBOOK](../OPERATOR-HANDBOOK.md) for the mapping cheat sheet.

### Managed Seedance relay (`seedance_relay`)
- Exposes video IDs today: `seedance-2.0-pro`, `seedance-2.0-fast`.
- Default public → upstream mapping (override with `SEEDANCE_RELAY_MODEL_MAP`):
  - `seedance-2.0` → `seedance-2.0-pro`
  - `seedance-2.0-fast` → `seedance-2.0-fast`
  - `seedance-1.5-pro` / `seedance-1.0-pro` → `seedance-2.0-pro`
  - `seedance-1.0-pro-fast` / `seedance-1.0-lite` → `seedance-2.0-fast`
  - any other ID passes through verbatim.
- Relay create requests are emitted as upstream `content[]` only; NextAPI does not mix flat media params with `content[]`.
- Public requests may use either NextAPI flat media fields or UpToken-style `input.content[]`. The gateway normalizes both into the same `GenerationRequest`, so billing, moderation, jobs, retries, and webhooks stay on one path.
- `input.ratio` is accepted as an alias for `input.aspect_ratio`; if both are present they must match. The relay always sends the upstream field as `ratio`.
- Prompt is optional when the request already includes visual media (`image_url`, `image_urls`, `video_urls`, `first_frame_url`).
- Prompt length is not capped locally by a legacy character limit such as 2000 or 4000 chars. Current UpToken/Seedance guidance is language-aware (EN <=1000 words, ZH <=500 chars), so the gateway forwards valid-shaped requests and surfaces upstream `error.message` when the provider rejects prompt content.
- Role mapping:
  - `input.image_url` / `input.image_urls[]` → `content[].image_url role=reference_image`
  - `input.first_frame_url` → `content[].image_url role=first_frame`
  - `input.last_frame_url` → `content[].image_url role=last_frame`
  - `input.video_urls[]` → `content[].video_url role=reference_video`
  - `input.audio_urls[]` → `content[].audio_url role=reference_audio`
- Status flow surfaced by `GetJobStatus`: `queued → running → succeeded | failed`. `content.video_url` and `usage.total_tokens` only populate on `succeeded`; `error.{code,message}` only on `failed`.
- Error handling: surface upstream `error.message` directly to customers whenever a task or submission fails. Treat `error.code` as logging / coarse grouping only; do not depend on a fixed upstream code list.

## Shared hardening
Both live backends share the same resilience envelope:
- Split HTTP clients: 15s create timeout vs 8s poll timeout so slow polls can't starve creation.
- Idempotent retry with jittered exponential backoff on transient errors (network, 408, 429, 5xx): 3 attempts for create, 5 for status.
- 4xx (except 408/429) fails fast — we do not replay doomed requests because each one can reserve spend upstream.
- Circuit breaker (6 failures / 60s window → open for 30s → single-probe half-open). Open state surfaces `ErrUpstreamUnavailable`, which the gateway translates to HTTP 503.
- `IsHealthy` probes upstream with a 3s budget and caches for 60s.

## Out of scope (v1)
- Multi-provider routing / failover within a single request.
- Kling / Zhipu real impl (stubs only).
