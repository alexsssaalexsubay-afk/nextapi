# Provider Module

## Purpose
Provider Adapter pattern. v1 ships two live backends (Volcengine Ark direct and
UpToken relay) plus a deterministic mock; Kling/Zhipu are stubs so the
interface is proven but not shipped.

## Invariants
- `Provider` interface is the ONLY way handlers talk to upstream video AI.
- Every provider exposes: `Name`, `EstimateCost`, `GenerateVideo`, `GetJobStatus`, `IsHealthy`.
- `PROVIDER_MODE=mock` short-circuits to `MockProvider` (returns deterministic fake URL after ~10s).
- `PROVIDER_MODE=live` requires `VOLC_API_KEY`; missing → startup error. Talks to Volcengine Ark directly at `SEEDANCE_BASE_URL` (default: `https://ark.cn-beijing.volces.com/api/v3`).
- `PROVIDER_MODE=uptoken` requires `UPTOKEN_API_KEY`; missing → startup error. Talks to the UpToken gateway at `UPTOKEN_BASE_URL` (default: `https://uptoken.cc/v1`).
- Cost estimation is deterministic; no network call in `EstimateCost`. UpToken reuses the Seedance estimation table because it relays the same upstream model family.

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
| `uptoken` | `UPTOKEN_API_KEY`            | UpToken relay (uptoken.cc)        | `POST /v1/video/generations`                   | Turnkey; no Ark account required   |

### Seedance (`live`)
- `SEEDANCE_MODEL_MAP="publicID:arkID,…"` must map every public catalogue ID to the Ark endpoint you have provisioned. Unknown IDs pass through verbatim so customers can target an Ark ID directly.
- See [OPERATOR-HANDBOOK](../OPERATOR-HANDBOOK.md) for the mapping cheat sheet.

### UpToken (`uptoken`)
- Upstream doc: [uptoken.cc/docs](https://uptoken.cc/docs).
- Exposes three IDs today: `seedance-2.0-pro`, `seedance-2.0-fast`, `seedream-5.0-lite`.
- Default public → upstream mapping (override with `UPTOKEN_MODEL_MAP`):
  - `seedance-2.0` → `seedance-2.0-pro`
  - `seedance-2.0-fast` → `seedance-2.0-fast`
  - `seedance-1.5-pro` / `seedance-1.0-pro` → `seedance-2.0-pro`
  - `seedance-1.0-pro-fast` / `seedance-1.0-lite` → `seedance-2.0-fast`
  - any other ID passes through verbatim.
- Status flow surfaced by `GetJobStatus`: `queued → running → succeeded | failed`. `content.video_url` and `usage.total_tokens` only populate on `succeeded`; `error.{code,message}` only on `failed`.
- Error code families (surfaced as `JobStatus.ErrorCode`): `error-1xx` auth, `error-2xx` parameter, `error-3xx` content moderation, `error-4xx` media URL, `error-5xx`/`error-6xx` rate limit / capacity, `error-7xx` generation failure. See [docs/UPSTREAM-UPTOKEN-ZH.md](../UPSTREAM-UPTOKEN-ZH.md) for the full table and retry policy.

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
- Asset Library upload (`POST /v1/assets`) — UpToken-specific; not exposed through the NextAPI gateway yet. Customers currently pass public HTTPS URLs for reference media.
