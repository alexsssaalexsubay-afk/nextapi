# NextAPI — Lean Workspace Guide

This file stays intentionally short to keep workspace rule injection light.
Use it as the canonical quick reference; deeper architecture belongs in repo docs.

## Canonical references
- Product + setup overview: `README.md`
- Current project state: `STATUS.md`
- Technical docs: `docs/`
- Docusaurus docs site source: `docs-site/`

## Repo shape
- `backend/`: Go API + worker
- `apps/site`: marketing site
- `apps/dashboard`: customer dashboard
- `apps/admin`: admin panel
- `packages/ui`: shared UI + i18n
- `services/`, `third_party/`: sidecars and vendored integrations

## Working rules
1. Prefer one small, reviewable vertical slice at a time.
2. Validate meaningful changes with fresh evidence before calling them done.
3. Keep file paths, env vars, routes, and terms aligned across docs and code.
4. Never leak secrets or raw backend/provider errors to end users.
5. Do not expand product scope while the current slice is still unverified.

## Stack conventions
- Frontend: TypeScript strict, React, Tailwind, shared `packages/ui`, `@/` imports.
- Backend: Go with explicit errors, `context.Context` first, parameterized DB access.
- i18n: `packages/ui/src/lib/i18n/messages/{en,zh}.ts`; keep keys aligned and English-first.

## Product guardrails
- Seedance-first v1; do not casually add unrelated providers.
- No microservice sprawl: prefer the existing monorepo surfaces.
- `STATUS.md` may only claim closed-loop when there is executable evidence.

## Validation reminders
- Frontend changes: run the smallest relevant `typecheck` / `build`.
- Backend changes: run the smallest relevant `go test`.
- Shared copy or i18n changes: run `pnpm --filter @nextapi/ui check-i18n`.
