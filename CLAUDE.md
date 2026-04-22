# NextAPI — Architecture & Agent Instructions

## What this repo is
NextAPI is a video AI API gateway. We hold 1 of 20 global reseller licenses for
ByteDance Volcengine Seedance. Vision: "OpenRouter for Video AI".

## Architecture (one glance)
- Single Go binary serves api.nextapi.top; workers share same binary with different command.
- 3 Next.js 15 App Router frontends: marketing site, customer dashboard, admin panel.
- Mintlify handles docs.nextapi.top externally.
- Provider Adapter pattern: only Seedance implemented in v1; Kling/Zhipu are interface stubs.
- Async job model: POST creates job → worker calls provider → webhook notifies customer OR customer polls.
- Single region for MVP: Aliyun HK. Multi-region in roadmap (not Q1).

## Tech conventions
- Go 1.25 · Gin · GORM (simple) + sqlc (complex queries) · Asynq
- Next.js 15 App Router · TypeScript strict · Tailwind v4 · shadcn · next-intl · Clerk
- OpenAPI 3.1 = single source of truth for HTTP contract (backend/api/openapi.yaml)
- All schema changes via goose migrations in backend/migrations/
- Secrets via .env (local) or doppler (prod). Never commit.
- Logs: structured JSON via zap. Metrics: Prometheus. Traces: OTel.
- Error handling: errors with codes; all user-facing error messages in English.

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
5. All user-facing copy: English primary, Chinese via next-intl key.
6. When uncertain, leave `// TODO(claude): <question>` not a guess.
7. Never invent microservices. One Go binary + workers. Forever.

## Hard NOs
- NO video ad templates (6 styles / 6 industries) — scrapped design.
- NO workflow orchestration (batch/AB/hero_clone) — out of scope.
- NO LLM script generation — gateway doesn't do content intelligence.
- NO additional providers until Seedance flow is rock-solid.
- NO microservices. Monolith + workers sharing binary.

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
