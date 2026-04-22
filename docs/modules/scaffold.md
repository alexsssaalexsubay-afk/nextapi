# Module: scaffold (W1 · D1)

## Purpose
Bootstrap the NextAPI monorepo per CLAUDE.md §Architecture. Stubs only, no business logic.
DoD: `make dev` starts pg+redis+backend(:8080)+dashboard(:3000)+site(:3001)+admin(:3002); `/health` → 200.

## Invariants
- **Single Go binary** for server/worker/seed (different `cmd/` entrypoints).
- **Monorepo** managed by pnpm workspaces (JS) + go.work (Go).
- **OpenAPI 3.1** at `backend/api/openapi.yaml` is the only HTTP contract source.
- **i18n**: every frontend user-facing string must be under `messages/{en,zh}.json`; English first.
- Secrets only via `.env` (local) / Doppler (prod). `.env*` gitignored.
- All SQL schema changes via goose migrations in `backend/migrations/`.

## Public surface (post-scaffold)
- HTTP: `GET /health` → `{status:"ok"}`.
- Make targets: `dev | test | lint | build | openapi | migrate | deploy | clean`.
- Apps: `apps/{site:3001, dashboard:3000, admin:3002}`.
- Packages: `packages/{ui, tsconfig, eslint-config}`.

## Dependencies
- Go 1.25, Node 20+, pnpm 9+, Docker, goose.
- Env: `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `VOLC_API_KEY` (D3).

## Extension points
- New frontend app → add to `pnpm-workspace.yaml` under `apps/*`.
- New Go cmd → add `backend/cmd/<name>/main.go`.
- New provider → `backend/internal/provider/<name>/` (D3).

## Out of scope
- Business logic (auth/billing/provider/job) — deferred to D2/D3.
- CI/CD pipelines — deferred to W8.
- Production docker-compose.prod.yml — deferred.
- Mintlify docs content — external repo.
