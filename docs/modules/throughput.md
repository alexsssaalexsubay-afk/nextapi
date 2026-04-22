# Throughput & Queue Isolation Module

## Purpose
Give B2B customers guaranteed concurrent capacity and prevent one org from
starving others. Sales teams position this as "guaranteed throughput" (never
"unlimited concurrency").

## Invariants
- Every org has a `throughput_config` row (created lazily with defaults:
  reserved=2, burst=8, lane=standard, rpm=60).
- `reserved_concurrency` is the number of concurrent video jobs the gateway
  will always accept for this org, regardless of global load.
- `burst_concurrency` is the soft ceiling above reserved; requests beyond
  burst receive 429 with `Retry-After`.
- In-flight tracking lives in Redis (set keyed `throughput:{org_id}`);
  SCARD gives current count.
- `priority_lane` maps to Asynq queue name: `default`, `priority`,
  `dedicated`. Worker subscribes to all three with weighted priorities
  (dedicated:6, priority:3, default:1).
- `rpm_limit` is per-org requests-per-minute cap enforced by the existing
  `ratelimit.Limiter` middleware (overrides the global default).

## Data model
Already exists in migration 00005:
```sql
CREATE TABLE throughput_config (
  org_id                UUID PRIMARY KEY REFERENCES orgs(id),
  reserved_concurrency  INT NOT NULL DEFAULT 2,
  burst_concurrency     INT NOT NULL DEFAULT 8,
  priority_lane         TEXT NOT NULL DEFAULT 'standard',
  rpm_limit             INT NOT NULL DEFAULT 60,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Redis key: `throughput:{org_id}` — SET of active job IDs. Members expire
via EXPIRE on the set (TTL = max job duration + buffer = 600s). On every
`Acquire` we also set per-member TTL via sorted set score = deadline unix.

## Public surface
- `GET /v1/throughput` (admin key) — config + `current_in_flight`
- `PUT /v1/internal/admin/orgs/:id/throughput` — operator sets values
- 429 response on burst exceeded includes `Retry-After` header

## Service API
```go
type Service struct { db *gorm.DB; redis *redis.Client }
func (s *Service) Get(ctx, orgID) (*Config, error)
func (s *Service) Upsert(ctx, orgID, input) (*Config, error)
func (s *Service) Acquire(ctx, orgID, jobID) error   // ErrBurstExceeded
func (s *Service) Release(ctx, orgID, jobID) error
func (s *Service) InFlight(ctx, orgID) (int, error)
```

## Error codes
- `rate_limited.burst_exceeded` — 429, burst ceiling hit
- `rate_limited.rpm_exceeded` — 429, RPM cap hit (existing middleware)

## Test plan
1. Acquire up to burst → all succeed; burst+1 → ErrBurstExceeded.
2. Release frees slot → next Acquire succeeds.
3. Concurrent Acquire race — Redis SCARD is atomic.
4. Priority lane mapping: job enqueued to correct Asynq queue.

## Risks / TODOs
- RISK: Redis crash loses in-flight state. Mitigation: TTL on set; worker
  startup reconciles by scanning active jobs in Postgres.
- TODO: Dashboard chart for in-flight over time (W8+ observability).
