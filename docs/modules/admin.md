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

## Product Configuration Surface

Admin is the source of truth for operator-configurable product behavior. These settings should be visible before they affect users:

| Area | Configurable item | Required user/admin evidence |
|------|-------------------|------------------------------|
| AI providers | Provider family, base URL, encrypted API key, enabled flag, capabilities, default model, allowed models, priority, timeout, fallback allowed. | Provider health/status and model availability shown without leaking keys. |
| AI Director | Org entitlement, requested default engine, sidecar URL health, fallback policy, reference-image enablement, merge enablement, planning fee policy. | Dashboard/admin show actual engine and fallback status for every run. |
| Pricing | Global markup, membership tiers, per-org overrides, optional planning/reference-image fees. | Pre-submit estimate separates planning, images, video shots, merge, and reconciliation. |
| Usage limits | Monthly budget, in-flight liability cap, queue tier, provisioned concurrency, rate limit. | Blocked states explain limit name and recovery path. |
| Docs/help | Public docs URL, support URL, API quickstart URL, download/use guide URL. | Dashboard result cards and empty states link to the right guide. |
| i18n | English/Chinese copy parity for admin-visible and user-visible labels. | `check-i18n` passes or the skipped validation is documented. |

Admin-configurable does not mean user-invisible. If a setting changes provider, model, price, entitlement, fallback, quota, or output availability, the affected user surface must expose the practical effect.

## Invariants
- Admin actions never bypass the ledger — every change is auditable.
- The shared `ADMIN_TOKEN` is never sent to browser JavaScript.
- Admin panel copy is localized through `packages/ui`.
- Admin must not enable hidden runtime fallback that contradicts user-facing copy, run metadata, or billing evidence.
