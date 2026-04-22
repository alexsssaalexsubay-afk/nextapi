# STATUS — as of 2026-04-22

Legend: ✅ closed-loop (builds, tests pass, wired) · 🟡 compiles but not integration-tested · 🔴 stub / not started

## Build health

| Target | Command | Status |
|--------|---------|--------|
| Go backend | `cd backend && go build ./...` | ✅ exit 0 |
| Go tests | `cd backend && go test ./...` | ✅ all packages pass |
| Dashboard (Next.js) | `cd apps/dashboard && pnpm next build` | ✅ exit 0 |
| Admin (Next.js) | `cd apps/admin && pnpm next build` | ✅ exit 0 (force-dynamic, no Clerk key needed at build) |
| Site (Next.js) | `cd apps/site && pnpm next build` | ✅ exit 0 |
| Node deps | `pnpm install` | ✅ (peer dep warnings for Clerk + React 19, non-blocking) |

## Closed-loop (code + tests + build-verified)

| Area | Evidence |
|------|----------|
| Monorepo layout | `pnpm-workspace.yaml`, `go.work`, apps/{dashboard,admin,site} |
| API key auth (generate + argon2id + verify) | `internal/auth/key_test.go` |
| Seedance mock provider lifecycle | `internal/provider/seedance/mock_test.go` |
| Seedance cost estimation pricing | `internal/provider/seedance/pricing_test.go` |
| Job create + insufficient balance → 402 | `internal/job/service_test.go` |
| Job create reserves credits + enqueues | `service_test.go::TestCreate_ReservesCreditsAndEnqueues` |
| Enqueue failure auto-refunds reservation | `service_test.go::TestCreate_EnqueueFailure_RefundsReservation` |
| Spend controls (budget cap, monthly limit, auto-pause) | `internal/spend/service_test.go`, `spend/integration_test.go` |
| Spend: burn-rate calculation | `integration_test.go::TestBurnRate` |
| Spend: in-flight liability kill switch (Redis) | `spend.PreCheck` + `IncrInflight`/`DecrInflight` wired into job.Create and processor |
| Webhook HMAC signing + event matching | `internal/webhook/service_test.go` |
| Webhook delivery list + replay + secret rotation | `service_test.go::TestListDeliveries/TestReplay/TestRotateSecret` |
| Idempotency middleware (dup detect + conflict) | `internal/idempotency/middleware_test.go` |
| Throughput: Redis slot tracking + burst limit | `internal/throughput/service_test.go` |
| Throughput: queue tiering (critical/dedicated/default) | `service_test.go::TestQueueForOrg` |
| Moderation profiles (strict/balanced/relaxed/custom) | `internal/moderation/service_test.go` |
| DB connection pool hardened | `MaxOpenConns(500)`, `MaxIdleConns(100)` in `infra/db/db.go` |
| Credits ledger dual-write (delta_credits + delta_cents) | All reservation/refund/reconciliation paths |
| OpenAPI spec v1 | `backend/api/openapi.yaml` — covers videos, keys, webhooks, spend, throughput, moderation, billing |

## Scaffolded — compiles, builds, NOT integration-tested

| Area | Gap |
|------|----|
| Clerk webhook (`/v1/webhooks/clerk`) | Svix verification coded; not tested against real Clerk event |
| Seedance **live** provider (Ark API) | HTTP shapes from docs; not verified with production API key |
| R2 storage client | Compiles with aws-sdk-go-v2; never uploaded a real object |
| Rate limiter (Redis sliding window) | Middleware mounted; sliding window math untested |
| Prometheus /metrics | Counters registered; never scraped against live traffic |
| Admin API (`/v1/internal/admin/*`) | Gated by `X-Admin-Token`; real SSO/RBAC deferred |
| Admin panel UI | All 9 pages build, `apiFetch` wired, Clerk force-dynamic; no real API data tested |
| Dashboard pages | All pages build, real fetches wired; needs Clerk session → API key bridge |
| Dashboard playground | POST + poll wired; end-to-end only with live Clerk + Seedance |
| SDKs (python/node/go) | Full client + tests; not published to PyPI/npm/pkg.go.dev |
| Mintlify docs | Content drafted; needs Mintlify cloud project |
| Marketing/legal pages | Copy present; legal needs lawyer review |
| CI (`.github/workflows/ci.yml`) | Backend `go test` + frontend `pnpm build`; never executed in GitHub Actions |
| Deploy workflow | GHCR + SSH deploy; needs `DEPLOY_HOST`, `DEPLOY_SSH_KEY` secrets |
| Per-key `provisioned_concurrency` API surface | DB column + Redis enforced; not yet exposed in create/update key handlers |
| Queue tiering end-to-end | Worker configs set (critical:8, dedicated:5, priority:3, default:1, concurrency:100); not load-tested |

## Placeholder — stub or not started

| Area | Status |
|------|--------|
| Stripe real Checkout + webhook signature | 🔴 Stub returns fake URL |
| Alipay integration | 🔴 Stub |
| WeChat Pay integration | 🔴 Stub |
| Invoice PDF generation | 🔴 Not started |
| OpenTelemetry tracing | 🔴 No SDK plumbed |
| Status page (Instatus) | 🔴 Account not created |
| Clerk-session → API-key bridge | 🔴 Dashboard needs Next.js route handler for prod |
| Live Seedance billing reconciliation | 🔴 `succeed()` uses estimate; real token count not mapped |
| Video mirror Ark → R2 | 🔴 R2 upload is streaming-ready (`io.Reader`); mirror step not implemented |
| Load testing | 🔴 15,000 concurrency target not validated |

## Known technical debt

- `pq.StringArray` in `domain/webhook.go` ties us to Postgres — fine for single-region v1.
- `ratelimit.Middleware` uses pointer-based key identity; swap to `APIKey.ID` before prod.
- GORM model `Job.Request` is `jsonb` for Postgres; tests use SQLite `TEXT`.
- `FOR UPDATE` conditionally skipped for SQLite in spend.Enforce; race test skipped on SQLite.
- Every `// TODO(claude):` is intentional — do not remove without addressing.
- Clerk peer deps warn for React 19.0.0 compatibility; functional but should pin to 19.0.3+.

## Before first real deploy

1. `pnpm install && cd backend && go mod tidy`
2. `cd backend && go test ./...` (must pass)
3. Fill `.env`: Clerk, VOLC_ARK_API_KEY, R2, Stripe, ADMIN_TOKEN, ADMIN_EMAILS
4. Set Clerk webhook endpoint: `https://api.nextapi.top/v1/webhooks/clerk`
5. DNS: A records + CF Pages x3
6. VPS: `ops/deploy/vps-bootstrap.sh` then certbot
7. GitHub secrets: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`
