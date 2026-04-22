# Provider Module

## Purpose
Provider Adapter pattern. v1 ships only Seedance; Kling/Zhipu are stubs so the
interface is proven but not shipped.

## Invariants
- `Provider` interface is the ONLY way handlers talk to upstream video AI.
- Every provider exposes: `Name`, `EstimateCost`, `GenerateVideo`, `GetJobStatus`, `IsHealthy`.
- `PROVIDER_MODE=mock` short-circuits to `MockProvider` (returns deterministic fake URL after ~10s).
- `PROVIDER_MODE=live` requires `VOLC_API_KEY`; missing → startup error.
- Cost estimation is deterministic; no network call in `EstimateCost`.

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

## Out of scope (v1)
- Multi-provider routing / failover.
- Kling / Zhipu real impl (stubs only).
