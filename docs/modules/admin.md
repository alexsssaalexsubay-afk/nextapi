# Admin Module

## Purpose
Operator-only surface to inspect + intervene without touching DB directly.

## AuthN/Z (v1 — simple)
- Backend `/v1/internal/admin/*` gated by header `X-Admin-Token: <ADMIN_TOKEN>`.
- Frontend `admin.nextapi.top` gated by Clerk + `ADMIN_EMAILS` env allowlist.
- W8+: replace shared token with Clerk session JWT + proper RBAC.

## Endpoints
- `GET  /v1/internal/admin/overview` — users_total, jobs_last_24h, credits_used
- `GET  /v1/internal/admin/users?q=` — search users
- `GET  /v1/internal/admin/jobs?status=` — filter jobs
- `POST /v1/internal/admin/jobs/:id/cancel` — force-fail a job
- `POST /v1/internal/admin/credits/adjust` — `{org_id, delta, note}` → ledger adjustment

## Frontend
- `apps/admin/` — red-accent DashboardShell, pages: Overview / Users / Jobs /
  Credits / System Health.
- Every credit adjustment shows up in `credits_ledger` with `reason=adjustment`.

## Invariants
- Admin actions never bypass the ledger — every change is auditable.
- Admin panel is English-only.
