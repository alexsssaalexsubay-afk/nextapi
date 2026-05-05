# Billing Module

## Purpose
Credits ledger for NextAPI. Balance is always computed from ledger, never cached.

## Invariants
- Balance = `SUM(delta_credits) WHERE org_id = X`. No separate balance column.
- Every credit change = one new row (append-only ledger).
- Signup bonus = +500 cents ($5.00), reason=signup_bonus.
- Job reservation = negative delta, reason=reservation.
- Job completion = reason=reconciliation (delta = actual - reserved).
- Job failure = reason=refund (delta = +reserved amount).
- Manual admin adjustment = reason=adjustment with note.

## Data model
- **credits_ledger**:
  - id (bigserial pk)
  - org_id (FK orgs)
  - delta_credits (bigint, signed)
  - reason (enum: signup_bonus|topup|consumption|reservation|reconciliation|refund|adjustment)
  - job_id (uuid, nullable)
  - note (text)
  - created_at

## Public surface
- `billing.AddCredits(ctx, orgID, delta, reason, jobID, note) error`
- `billing.GetBalance(ctx, orgID) (int64, error)`
- `GET /v1/billing/balance` — current balance
- `GET /v1/billing/ledger` — paginated history

## Dependencies
- Postgres (credits_ledger)
- orgs table (FK)

## Extension points
- New reasons (W7 Stripe/Alipay/WeChat: reason=topup)
- Per-org credit limits (Enterprise tier)

## Out of scope (v1)
- Real payment gateways (Stripe/Alipay/WeChat) — W7
- Invoice PDF generation — W7
- Balance caching / Redis denormalization — explicitly forbidden
