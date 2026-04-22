# Spend Controls Module

## Purpose
Let high-volume B2B customers control how much money we drain from their org.
Four knobs:
1. **Hard budget cap** — gateway refuses new jobs when `period_spend_cents >= budget.hard_cap_cents`.
2. **Soft alert threshold** — fires `budget.alert` event (email + webhook) when crossed; does NOT block jobs.
3. **Auto-pause on low balance** — when `balance_cents < auto_pause_below_cents`, org is paused; unpausing is manual or auto on topup.
4. **Monthly usage limit** — same as hard cap but scoped to a calendar month window.

## Invariants
- All four checks happen **atomically** with reservation. A job that passes checks
  AND reserves cents IS counted; a job that fails any check never touches the ledger.
- `period_spend_cents` = SUM of `actual_cost_cents` where `finished_at` ∈ current window,
  plus reserved (in-flight) cents. Never cached; always recomputed at decision time
  under row-level lock on `orgs.id`.
- Soft-alert events are **idempotent per threshold per period** — only fire once
  per cross.
- Auto-pause is a single boolean `orgs.paused_at`; when set, ALL writes to
  `/v1/videos` 402 with `insufficient_quota.org_paused`.
- Unpausing while balance still below threshold is allowed (manual override);
  the system logs an audit row.

## Data model
- New columns on `orgs`:
  - `paused_at TIMESTAMPTZ`
  - `pause_reason TEXT` (auto_low_balance | manual | admin_hold)
- New table `spend_controls` (one row per org):
  - `org_id UUID PK`
  - `hard_cap_cents BIGINT NULL` (null = no cap)
  - `soft_alert_cents BIGINT NULL`
  - `auto_pause_below_cents BIGINT NULL`
  - `monthly_limit_cents BIGINT NULL`
  - `period_resets_on SMALLINT NOT NULL DEFAULT 1` (day of month, 1..28)
  - `updated_at TIMESTAMPTZ`
- New table `spend_alerts`:
  - `id BIGSERIAL PK`
  - `org_id UUID FK`
  - `kind TEXT` (soft_alert | auto_paused | monthly_limit_hit)
  - `period_start TIMESTAMPTZ` (so alerts don't refire within same period)
  - `amount_cents BIGINT`
  - `fired_at TIMESTAMPTZ DEFAULT now()`
  - Unique `(org_id, kind, period_start)`.
- New event types emitted:
  - `budget.alert`
  - `budget.auto_paused`
  - `budget.monthly_limit`

## Public surface
- `GET /v1/spend_controls` — current config + current burn rate
- `PUT /v1/spend_controls` — update caps
- `POST /v1/admin/orgs/:id/unpause` — manual unpause (admin only)
- `GET /v1/spend_alerts` — paginated alert history
- Middleware: `spend.Enforce(ctx, orgID, estCents)` called inside `videos.Create`
  transaction before reservation; returns typed errors that map to 402 with
  specific codes.

## Error codes (new)
- `insufficient_quota.budget_cap` — hard cap hit
- `insufficient_quota.monthly_limit` — monthly limit hit
- `insufficient_quota.org_paused` — auto-paused or manual hold
- `insufficient_quota.balance` — balance below reservation (existing, renamed from `insufficient_credits`)

## Dependencies
- Postgres (spend_controls, spend_alerts, orgs columns)
- Billing service (credits ledger, for balance + reservation queries)
- Webhook service (to emit budget.* events)
- Admin audit log (for manual unpause actions)

## Extension points
- Per-API-key spend cap (lower precedence than org cap) — not in v1 of this
  module; track via TODO.
- Team-level spend visibility (enterprise feature) — W8+.

## Out of scope
- Real-time daily spend dashboard graphs (can reuse usage chart; no new
  aggregation pipeline needed).
- Multi-currency (USD only in v1).

## Test plan
1. **Race: double-spend prevention** — two concurrent reservation attempts where
   balance only covers one; exactly one succeeds, the other gets 402.
2. **Hard cap honored mid-period** — reserve up to `hard_cap_cents - 1`, then
   submit a job whose estimate pushes over; rejected.
3. **Soft alert fires once** — cross threshold 5 times within a period; exactly
   one `spend_alerts` row + one webhook.
4. **Auto-pause triggers** — balance crosses below threshold; org paused; next
   `/videos` POST returns 402 `org_paused`.
5. **Unpause restores** — manual unpause; next POST succeeds (if balance ok).
6. **Monthly window rollover** — simulate period boundary; alert re-arms.
7. **Refund restores spend budget** — failed job's refund row reduces
   `period_spend_cents` correctly.

## Rollout plan
- Phase 1: ship migration + write path (spend_controls CRUD + enforce middleware),
  DEFAULTS DISABLED (all caps NULL). Zero behavior change for existing orgs.
- Phase 2: dashboard UI for configuration.
- Phase 3: flip default for new orgs to `soft_alert_cents = 80% of initial topup`.
- Backfill: none needed (all NULL columns).

## Risks / TODOs
- DONE: burn rate (7-day rolling average) surfaced in GET /spend_controls.
- DONE: webhook events emitted for budget.alert, budget.auto_paused, budget.monthly_limit.
- DONE: spend.Enforce wired into job.Service.Create for atomicbudget checks.
- DONE: monthly_limit_hit alert fires via AfterReserve.
- TODO: rate-limit the webhook fanout so a flapping balance can't DoS
  customer endpoints.
- RISK: row-level `SELECT ... FOR UPDATE` on orgs during reservation adds
  latency under high concurrency. Benchmark with k6 before GA.
- RISK: clock skew between API server and Postgres could cause period
  boundary double-fires. Mitigate: always use `now()` in SQL, never Go clock.
