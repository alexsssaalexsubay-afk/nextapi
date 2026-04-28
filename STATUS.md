# STATUS — as of 2026-04-28

Legend: ✅ closed-loop (builds, tests pass, wired) · 🟡 compiles but not integration-tested · 🔴 stub / not started

## Latest verified checkpoint (2026-04-28 evening)

- AI Director runs now create a durable `director_jobs` record, step through `director_steps` (`storyboard`, optional `image_submit`, `workflow_build`, optional `video_submit`), and attach text/image provider usage rows to the exact Director job/step. Video fan-out also writes `video_generation` reserved metering rows for the submitted job IDs.
- Backend/server/worker were deployed to the VPS at commit `6c9627a`; production Postgres contains `director_jobs`, `director_steps`, `director_metering`, and `director_checkpoints`.
- Verified on VPS after deploy: backend and worker containers are up, `https://api.nextapi.top/health` returned `{"status":"ok"}`, sidecar `/health` returned `advanced_sidecar`, and sidecar smoke returned `{"status":"ok","provider_callback_calls":4,"shot_count":2,"source":"vendored_director_pipeline"}`.
- AI Director now carries `max_parallel` from Dashboard controls into workflow metadata and then into `batch_runs.max_parallel` when `/v1/workflows/:id/run` fans out multiple video nodes.
- Batch/Director multi-shot execution uses bounded step dispatch: accepted jobs are created/reserved first, only the first wave is enqueued, and worker/webhook completions dispatch the next queued job.
- Frontend `app.nextapi.top/health` and `admin.nextapi.top/health` still return HTTP 500 until Cloudflare Workers are redeployed. Local builds pass, but wrangler deployment is blocked because local wrangler auth is not logged in (`Failed to fetch auth token: 400 Bad Request`).

Validation:

- `cd backend && go test ./...` → ✅
- `cd backend && go test ./internal/director ./internal/workflow ./internal/batch ./internal/job` → ✅
- `pnpm --filter @nextapi/ui check-i18n` → ✅
- `pnpm --filter @nextapi/dashboard typecheck` → ✅
- `pnpm --filter @nextapi/dashboard build` → ✅
- `pnpm --filter @nextapi/admin build` → ✅

## Build health

| Target | Command | Status |
|--------|---------|--------|
| Go backend | `cd backend && go build ./...` | ✅ exit 0 |
| Go tests | `cd backend && go test ./...` | ✅ all packages pass |
| Dashboard (Next.js) | `cd apps/dashboard && pnpm next build` | ✅ exit 0 |
| Admin (Next.js) | `cd apps/admin && pnpm next build` | ✅ exit 0 (force-dynamic, no Clerk key needed at build) |
| Site (Next.js) | `cd apps/site && pnpm next build` | ✅ exit 0 |
| Docs site (Docusaurus) | `cd docs-site && pnpm build` | ✅ exit 0 (EN + zh) |
| Node deps | `pnpm install` | ✅ (peer dep warnings for Clerk + React 19, non-blocking) |

## Documentation / product-spec update (2026-04-28)

Docs now define the product acceptance contract for the next UX/Director/model-configuration pass:

- Button states and color semantics are explicit in `docs/modules/design-system.md` and `docs/modules/visual-design-system.md`.
- Director Mode has separate planning/execution state machines and explicit no-silent-fallback acceptance criteria in `docs/modules/director-mode.md`.
- Admin/model configuration docs define configurable provider fields, fallback guardrails, pricing/entitlement knobs, docs/help URLs, and i18n obligations.
- User docs index now names required download/use/help entry points for quickstart, API docs, Director guide, completed assets, degraded runs, and provider setup.

No new code validation was run for this docs-only update.

## Product UX / Admin configurability checkpoint (2026-04-28)

This pass moved several world-class UX requirements from notes into code:

- Dashboard and Admin now share collapsible left-navigation behavior with persisted local preference and localized accessibility labels.
- AI Director model selection is compact and hierarchical: recommended models first, provider groups below, with model logo, live/compat status, tier, and capability tags.
- AI Director primary CTA now shows an estimated video reserve before execution, using the same Seedance-style 1080p duration heuristic as the backend estimate path.
- Premium buttons now have consistent hover, active-scale, disabled, and disabled-cursor states in the shared UI stylesheet.
- Admin AI Providers now includes a model capability coverage panel for `text`, `image`, `video`, and `avatar`, so operators can see what is actually configured instead of guessing from raw key rows.

Validation:

- `pnpm --filter @nextapi/ui check-i18n` → ✅ `en` and `zh` key parity OK (`1907` leaf keys)
- `pnpm --filter @nextapi/dashboard typecheck` → ✅ exit 0
- `pnpm --filter @nextapi/admin typecheck` → ✅ exit 0
- `go test ./backend/internal/template ./backend/internal/workflow ./backend/internal/gateway ./backend/internal/director/...` → ✅ exit 0

Still not claimed as done: live deployed sidecar, real Seedance end-to-end from browser, actual media stitching after all shot videos complete, and production DB migration application.

## Closed-loop (code + tests + build-verified)

| Area | Evidence |
|------|----------|
| Monorepo layout | `pnpm-workspace.yaml`, `go.work`, apps/{dashboard,admin,site}, packages/ui |
| API key auth (generate + argon2id + verify) | `internal/auth/key_test.go` |
| Key management on both auth groups | `sk_*` business keys hit `/v1/me/keys`; `ak_*` admin keys hit `/v1/keys` (no path collision) |
| Clerk session → API key bridge (Group A) | `POST /v1/me/bootstrap` verifies Clerk JWT against JWKS, lazy-provisions User+Org+SignupBonus, revokes any prior `dashboard-session` key, mints a fresh `sk_live_*`. Dashboard `apiFetch` auto-bootstraps on first call and on 401 retry. Builds: backend ✅ / dashboard ✅ |
| Admin operator session + email OTP | `POST /v1/internal/admin/session` exchanges a verified Clerk JWT for a short-lived `ops_*` session (8 h hard TTL, 2 h idle timeout, DB-backed, revocable). Browser stores it in `sessionStorage` and sends `X-Op-Session` on every admin call. High-risk operations (`credits.adjust`, `org.pause`, `org.unpause`, `webhook.replay`) additionally require an email OTP via `POST /v1/internal/admin/otp/send` → `X-Op-OTP: <id>.<6-digit>`. ADMIN_TOKEN is no longer sent to the browser. Builds: backend ✅ / admin ✅ |
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
| Error sanitization (gateway handlers) | All `ShouldBindJSON` errors return generic "invalid request body" |
| Error sanitization (job processor) | `fail()` always stores generic "video generation failed", never raw err.Error() |
| `/metrics` endpoint auth | Gated by `gateway.AdminMiddleware()` (X-Admin-Token) |
| Admin rate limiting | All `/v1/internal/admin/*` routes: 120 req/min |
| Domain consistency | All code samples and links use `*.nextapi.top` |
| Marketing site | Landing, pricing, enterprise, docs, integrations, legal, security, status pages |
| PostHog tracking | `demo_run_clicked`, `hero_signup_clicked`, `nav_login_clicked` events |
| OG images | Static PNG OG images for all major pages |
| A11y | Hero video has `aria-label`, `preload="none"` |

## Scaffolded — compiles, builds, NOT integration-tested

| Area | Gap |
|------|----|
| Clerk webhook (`/v1/webhooks/clerk`) | Svix verification coded; not tested against real Clerk event |
| Seedance **live** provider (Ark API) | HTTP shapes from docs; not verified with production API key |
| R2 storage client | Compiles with aws-sdk-go-v2; never uploaded a real object |
| Rate limiter (Redis sliding window) | Middleware mounted; sliding window math untested |
| Prometheus /metrics | Counters registered; never scraped against live traffic |
| Admin API (`/v1/internal/admin/*`) | Three credential paths in priority order: `X-Op-Session` (browser, primary), `Authorization: Bearer <Clerk JWT>` (initial bootstrap + tooling), `X-Admin-Token` (cron/scripts only — never browsers). Real SSO/RBAC and per-action role granularity deferred. |
| Admin panel UI | All pages build, `adminFetch` wired to real API endpoints; no real API data tested |
| Dashboard pages | All pages build, real fetches wired, Clerk→API key bridge live (`POST /v1/me/bootstrap`); end-to-end requires `CLERK_ISSUER` + `CLERK_SECRET_KEY` set on backend |
| Dashboard playground | POST + poll wired; end-to-end only with live Clerk + Seedance |
| SDKs (python/node/go) | Full client + tests; not published to PyPI/npm/pkg.go.dev |
| User docs site | `docs-site/` (Docusaurus EN/ZH) builds locally; production deploy separate |
| Marketing/legal pages | Copy present; legal needs lawyer review |
| CI (`.github/workflows/ci.yml`) | Backend `go test` + frontend `pnpm build`; never executed in GitHub Actions |
| Deploy workflow | GHCR + SSH deploy; needs `DEPLOY_HOST`, `DEPLOY_SSH_KEY` secrets |
| Per-key `provisioned_concurrency` API surface | DB column + Redis enforced; not yet exposed in create/update key handlers |
| Queue tiering end-to-end | Worker configs set (critical:8, dedicated:5, priority:3, default:1, concurrency:100); not load-tested |
| Sales inquiry endpoint | `POST /v1/sales/inquiry` accepts form; does not actually send email (logs only) |
| NextAPI Director engine observability + queue handoff | Backend now exposes advanced sidecar vs provider-managed fallback evidence (`engine_used`, `engine_status`, `fallback_used`, sidecar configured/healthy), persists engine metadata into workflow JSON, and can immediately run the generated workflow so multi-shot jobs enter the existing batch/video queue. Dashboard displays fallback explicitly and shows workflow/batch/job/merge handoff state. Verified with `go test ./backend/internal/job -run 'TestBatchWorkflowRunClosesAfterAllJobsSucceed|TestHandlePoll_ProviderSucceeded_CreditsReconciled|TestHandlePoll_ProviderFailed_CreditsRefunded'`, `go test ./backend/internal/workflow ./backend/internal/director/... ./backend/internal/gateway/...`, `pnpm --filter @nextapi/ui check-i18n`, `pnpm --filter @nextapi/dashboard typecheck`, and `go build ./backend/cmd/server ./backend/cmd/worker`. Real deployed sidecar + live Seedance end-to-end still requires runtime validation. |

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
| Sales inquiry email delivery | 🔴 Currently logs only, needs Resend integration |

## Admin security model (2026-04-23)

We are intentionally **not** on Clerk Pro, so the built-in TOTP / passkey MFA
features are unavailable. The admin panel instead uses a layered scheme that
costs nothing extra and is honest about what it provides:

| Layer | Mechanism | Coverage |
|-------|-----------|----------|
| Identity | Clerk JWT (free tier) verified via JWKS, must match `ADMIN_EMAILS` | Every initial admin call |
| Session | `ops_*` token from `operator_sessions` table (8 h TTL, 2 h idle, revocable) | All subsequent admin calls via `X-Op-Session` |
| Step-up auth | 6-digit email OTP (Resend), 10 min TTL, single-use, hash-stored | `credits.adjust`, `org.pause`, `org.unpause`, `webhook.replay` |
| Allowlist enforcement | `ADMIN_EMAILS` check on JWT path AND OTP path | Server-side only — UI is decorative |
| Auditing | Every state-changing call writes to `audit_log` with verified actor email | All `/v1/internal/admin/*` mutations |

**This is explicitly NOT a full MFA solution.** Honest gaps:

- Password / first factor still relies on the operator's Clerk account; if that
  is compromised AND the attacker has access to the same email inbox, OTP fails
  to protect. Compensating controls: short session TTL, server-side allowlist,
  per-action audit log, owner email notification on credit changes.
- OTP delivery relies on Resend; if `RESEND_API_KEY` is unset the OTP is
  generated and persisted but never reaches the operator. The OTP gate is
  therefore strict: no Resend = high-risk operations are blocked. Set the key
  in production or fall back to the shared `X-Admin-Token` for one-off ops.
- No backup codes — the recovery path is "the platform owner removes you from
  `ADMIN_EMAILS` then re-adds with a new email" or rotates `ADMIN_TOKEN`.
- Single-region OTP store; no geo-redundancy if the primary DB is down.

**When to revisit:** if the customer base or risk profile grows, upgrade to
Clerk Pro for native MFA + WebAuthn, or replace this with WorkOS / a self-hosted
TOTP module. The data model (`operator_sessions`, `admin_otp`) is forward-
compatible with either path.

## Known technical debt

- `pq.StringArray` in `domain/webhook.go` ties us to Postgres — fine for single-region v1.
- `ratelimit.Middleware` uses pointer-based key identity; swap to `APIKey.ID` before prod.
- GORM model `Job.Request` is `jsonb` for Postgres; tests use SQLite `TEXT`.
- `FOR UPDATE` conditionally skipped for SQLite in spend.Enforce; race test skipped on SQLite.
- Every `// TODO(claude):` is intentional — do not remove without addressing.
- Clerk peer deps warn for React 19.0.0 compatibility; functional but should pin to 19.0.3+.

## Live deployment (verified 2026-04-23)

| Surface | URL | Where it runs | Status |
|---------|-----|---------------|--------|
| Marketing site | https://nextapi.top | Cloudflare Pages | HTTP/2 200 |
| Customer dashboard | https://app.nextapi.top | Cloudflare Workers (OpenNext) | HTTP/2 200, Clerk-gated |
| Admin panel | https://admin.nextapi.top | Cloudflare Workers (OpenNext) | HTTP/2 200, Clerk-gated |
| API + worker | https://api.nextapi.top | Aliyun HK VPS 47.76.205.108 | `/v1/health` → ok, 401 on unauthenticated `/v1/auth/me` |

DNS topology:
- `api` is **DNS only (grey-cloud)** + Let's Encrypt cert (issued 2026-04-23, expires 2026-07-22, auto-renew via certbot.timer)
- `app`, `admin`, `nextapi.top` are **proxied (orange-cloud)** through Cloudflare to Workers/Pages

VPS hygiene:
- Old `nextapi-dashboard` / `nextapi-admin` systemd units `disable`d (frontend now on Workers)
- Nginx `sites-available/nextapi` only serves `api.nextapi.top` (force HTTPS via certbot redirect block)

Dashboard/Jobs data integration (no longer mock):
- Home page StatCards: `Available credits` and `Active keys` come from `/v1/auth/me` (handler returns `balance`, `api_keys_active`)
- Home page "Recent jobs" + `/jobs` page rows come from `/v1/videos?limit=...`
- Jobs filter counts (all/running/queued/succeeded/failed) computed from real data
- `/webhooks` page still shows sample data and now displays a clear "PREVIEW" banner; backend webhook delivery-log API is the next milestone

## Before first real deploy

See `docs/SETUP-GUIDE.md` for the complete step-by-step operator guide.
