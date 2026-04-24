# Admin Module

## Purpose
Operator-only surface to inspect + intervene without touching DB directly.

## AuthN/Z (v1 — operator session)
- Browser admin access starts with Clerk login, then `POST /v1/internal/admin/session`
  exchanges the Clerk JWT for a short-lived `ops_*` operator session.
- Backend `/v1/internal/admin/*` accepts `X-Op-Session` for the admin UI,
  Clerk JWT for initial session creation / direct tooling, and `X-Admin-Token`
  only for scripts, cron jobs, and emergency ops.
- High-risk actions require email OTP via `POST /v1/internal/admin/otp/send`
  and `X-Op-OTP: <otp_id>.<code>`.
- Frontend `admin.nextapi.top` is gated by Clerk + `ADMIN_EMAILS` env allowlist.
- W8+: add proper RBAC and per-action roles.

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
- The shared `ADMIN_TOKEN` is never sent to browser JavaScript.
- Admin panel copy is localized through `packages/ui`.
