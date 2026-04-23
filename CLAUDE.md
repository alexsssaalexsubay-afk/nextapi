# NextAPI — Architecture & Agent Instructions

## What this repo is
NextAPI is a video AI API gateway. We hold 1 of 20 global reseller licenses for
ByteDance Volcengine Seedance. Vision: "OpenRouter for Video AI".

## Architecture (one glance)

```
        ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
        │     nextapi.top      │   │   app.nextapi.top    │   │  admin.nextapi.top   │
        │  Cloudflare Pages    │   │ Cloudflare Workers   │   │ Cloudflare Workers   │
        │  Marketing (static)  │   │ Dashboard (OpenNext) │   │   Admin (OpenNext)   │
        │  apps/site           │   │ apps/dashboard +     │   │  apps/admin +        │
        │                      │   │ Clerk SSR            │   │  Clerk SSR           │
        └──────────────────────┘   └──────────┬───────────┘   └──────────┬───────────┘
                                              │                          │
                                              └────────────┬─────────────┘
                                                           │ HTTPS (Let's Encrypt)
                                                           ▼
                                          ┌────────────────────────────────────┐
                                          │         api.nextapi.top            │
                                          │       Aliyun HK VPS (47.76.*)      │
                                          │   Nginx 443 → Go 1.25 + Gin :8080  │
                                          │   systemd: nextapi-server          │
                                          │   systemd: nextapi-worker (Asynq)  │
                                          └─────────────────┬──────────────────┘
                                                            │
                                ┌───────────────────────────┴──────────────────────────┐
                                │  PostgreSQL 16     │  Redis 7          │  Cloudflare R2
                                │  (docker)          │  (docker)         │  (managed)
                                │  Users/Orgs/Keys   │  Rate limit       │  Video storage
                                │  Jobs/Videos       │  Asynq queues     │  cdn.nextapi.top
                                │  Billing/Ledger    │  Spend inflight   │
                                │  Webhooks          │  Cache            │
                                └────────────────────┴───────────────────┘
```

Deployment topology (live as of 2026-04):
- Marketing site → **Cloudflare Pages** (`pnpm --filter @nextapi/site build` → `npx wrangler pages deploy out`)
- Dashboard + Admin → **Cloudflare Workers** via OpenNext (`npx opennextjs-cloudflare build` → `npx wrangler deploy`)
- API + worker → **Aliyun HK VPS** (Ubuntu, systemd units, Nginx + certbot, Docker for Postgres/Redis)
- DNS: Cloudflare (orange-cloud for site/app/admin; **api is grey-cloud + Let's Encrypt** so OpenNext Workers can fetch directly)

Other invariants:
- Single Go binary serves api.nextapi.top; workers share the same binary with `cmd/worker`.
- Provider Adapter pattern: only Seedance implemented in v1; Kling/Zhipu are interface stubs.
- Async job model: POST creates job → worker calls provider → webhook notifies customer OR customer polls.
- Mintlify handles docs.nextapi.top externally (not in this repo).
- Single region for MVP: Aliyun HK. Multi-region in roadmap (not Q1).

## Monorepo layout

```
nextapi-v3/
├── backend/                    # Go backend
│   ├── cmd/server/main.go      # Gin server + route wiring
│   ├── cmd/worker/main.go      # Asynq worker
│   ├── internal/
│   │   ├── auth/               # API key generation, argon2id verify, Clerk bridge
│   │   ├── billing/            # Credits ledger, reservation, reconciliation
│   │   ├── domain/             # GORM models (Job, Video, Org, APIKey, etc.)
│   │   ├── gateway/            # HTTP handlers (videos, keys, admin, webhooks, billing)
│   │   ├── idempotency/        # Idempotency-Key middleware
│   │   ├── infra/              # Config, DB, Redis, HTTP utils, metrics
│   │   ├── job/                # Job service + processor (create, poll, succeed, fail)
│   │   ├── moderation/         # Content moderation profiles
│   │   ├── provider/           # Provider interface + Seedance implementation
│   │   ├── providerfactory/    # Provider factory
│   │   ├── ratelimit/          # Redis sliding window rate limiter
│   │   ├── spend/              # Spend controls, budget caps, auto-pause, kill switch
│   │   ├── throughput/         # Provisioned concurrency, queue tiering
│   │   └── webhook/            # Webhook HMAC signing, delivery, replay
│   ├── api/openapi.yaml        # OpenAPI 3.1 spec
│   └── migrations/             # goose SQL migrations
├── apps/
│   ├── site/                   # Marketing site (Next.js, static export → CF Pages)
│   ├── dashboard/              # Customer dashboard (Next.js SSR, Clerk)
│   └── admin/                  # Admin panel (Next.js SSR, Clerk)
├── packages/
│   └── ui/                     # Shared UI: shadcn components, i18n, globals.css
├── docs/
│   ├── SETUP-GUIDE.md          # Step-by-step deployment guide
│   └── modules/                # Per-module technical docs
├── sdks/                       # Generated SDKs (python, node, go)
├── ops/                        # Deployment scripts
├── CLAUDE.md                   # This file
└── STATUS.md                   # Build health + feature status
```

## Tech conventions
- Go 1.25 · Gin · GORM (simple) + sqlc (complex queries) · Asynq
- Next.js 16 App Router · TypeScript strict · Tailwind v4 · shadcn/ui
- i18n: client-side context-based from `packages/ui/src/lib/i18n/` — English (`en.ts`) + Chinese (`zh.ts`)
- Auth: Clerk (dashboard + admin), API Keys (backend)
- OpenAPI 3.1 = single source of truth for HTTP contract (backend/api/openapi.yaml)
- All schema changes via goose migrations in backend/migrations/
- Secrets via .env (local) or doppler (prod). Never commit.
- Logs: structured JSON via zap. Metrics: Prometheus. Traces: OTel.
- Error handling: errors with codes; all user-facing error messages generic (never leak err.Error())

## API route layout

```
/v1/
├── /health                     GET     Public health check
├── /webhooks/clerk             POST    Clerk user sync
├── /webhooks/payments/:prov    POST    Payment provider webhooks
├── /sales/inquiry              POST    Enterprise lead capture (rate limited)
│
├── Business surface (sk_* keys, auth.Business middleware)
│   ├── /auth/me                GET     Current key info
│   ├── /models                 GET     Available models
│   ├── /models/:id             GET     Model detail
│   ├── /video/generations      POST    Legacy video create
│   ├── /jobs/:id               GET     Legacy job status
│   ├── /videos                 POST    Create video (B2B pipeline)
│   ├── /videos                 GET     List videos
│   ├── /videos/:id             GET     Get video
│   ├── /videos/:id             DELETE  Delete video
│   ├── /videos/:id/wait        GET     Long-poll video
│   ├── /me/keys                GET/POST/PATCH/DELETE  Self-service key management (dashboard)
│   └── /billing/settings       GET/PATCH  Billing settings
│
├── Admin surface (ak_* keys, auth.Admin middleware)
│   ├── /keys                   GET/POST/PATCH/DELETE  Key management
│   ├── /credits                GET     Balance
│   ├── /billing/*              GET/POST Ledger, usage, recharge, checkout
│   ├── /spend_controls         GET/PUT Spend controls
│   ├── /webhooks               CRUD    Webhook endpoints
│   └── /throughput, /moderation GET/PUT Throughput & moderation
│
└── Internal operator (X-Admin-Token auth, rate limited)
    └── /internal/admin/
        ├── /overview           GET     Platform stats
        ├── /users              GET     User list
        ├── /orgs               GET/POST/PATCH  Org management
        ├── /jobs               GET/POST  Job list + cancel
        ├── /credits/adjust     POST    Manual credit adjustment
        └── /moderation/*       GET/PATCH  Moderation events
```

## Commands (all via Makefile)
- make dev      → docker compose up pg+redis; go run server; pnpm dev (all 3 apps)
- make test     → go test ./... + pnpm test --run
- make lint     → golangci-lint + eslint --fix
- make build    → docker build backend; pnpm build
- make openapi  → regenerate packages/api-client/ + sdks/*
- make migrate  → goose up (or down N)
- make deploy   → push image + SSH deploy

## Working style (agent rules)
1. Before changing > 3 files, write or update docs/modules/<name>.md first.
2. Write tests alongside code. 60% coverage minimum on internal/.
3. One PR = one concern. Don't bundle.
4. Prefer composition. Avoid interface{} / any without justification.
5. All user-facing copy: English primary, Chinese via i18n context.
6. When uncertain, leave `// TODO(claude): <question>` not a guess.
7. Never invent microservices. One Go binary + workers. Forever.
8. Never leak raw error messages to users. Always use generic messages.
9. Use `@/` import alias consistently in all frontend apps.

## Hard NOs
- NO video ad templates (6 styles / 6 industries) — scrapped design.
- NO workflow orchestration (batch/AB/hero_clone) — out of scope.
- NO LLM script generation — gateway doesn't do content intelligence.
- NO additional providers until Seedance flow is rock-solid.
- NO microservices. Monolith + workers sharing binary.
- NO raw error message exposure. Always sanitize before returning to clients.

## v1 customer journey (memorize)
1. User signs up on app.nextapi.top → receives 500 free credits.
2. Creates API key in dashboard (shown once, prefix-only after).
3. Reads docs.nextapi.top → copies curl example.
4. POST /v1/video/generations { prompt, model:"seedance-v2-pro", image_url? }
   → returns { id:"job_xxx", status:"queued", estimated_credits:N }
5. Polls GET /v1/jobs/:id OR registers webhook URL.
6. Job completes → status:"succeeded", video_url:"<r2 presigned URL>".
7. Credits deducted based on real token usage from Seedance.
8. Customer tops up via dashboard (Stripe / Alipay / WeChat).

Anything not part of this journey is out of scope for v1.

## B2B features implemented
- Spend Controls: budget caps, monthly limits, auto-pause, kill switch (in-flight liability tracking via Redis)
- Throughput: provisioned concurrency per org, Redis slot tracking, queue tiering (critical/dedicated/default)
- Moderation: configurable profiles (strict/balanced/relaxed/custom) per org/key
- Idempotency: `Idempotency-Key` header with dedup middleware
- Webhooks: HMAC-SHA256 signed, delivery tracking, replay, secret rotation
- Billing: dual-write credits ledger (delta_credits + delta_cents), reservation/refund/reconciliation
- Admin: platform overview, user/org management, manual credit adjustment, moderation review
