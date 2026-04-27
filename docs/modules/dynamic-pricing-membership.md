# Dynamic Pricing + Membership

## Goal

NextAPI must charge customers a platform-controlled price instead of passing
through upstream Seedance/relay cost at cost. Upstream cost remains an internal
accounting input; customer-facing API responses, reservations, and final
ledger deductions use the computed customer price.

## Pricing Hierarchy

Pricing is resolved per organization:

1. Organization override markup, when enabled.
2. Effective membership tier markup.
3. Global platform default markup.

All markups are stored in basis points. `3000` means a 30% markup over upstream
cost. Final customer charge is:

```text
ceil(upstream_cents * (10000 + markup_bps) / 10000)
```

The result is then clamped to the global minimum charge and rounded up to the
configured increment. Upstream cost and margin fields are internal/admin-only.

## Membership

Membership is organization-scoped because billing, API keys, videos, and
balances are organization-scoped in the current system.

Successful top-ups increment `lifetime_topup_cents`. The highest enabled tier
whose threshold is less than or equal to the lifetime total becomes the
organization's automatic tier. Admins may manually override the effective tier
for a specific organization; automatic upgrades continue to update the auto
tier but do not replace a manual override until the override is cleared.

## Admin Controls

The internal admin surface controls:

- Global default markup, minimum charge, rounding increment, and enablement.
- Membership tier thresholds and tier markups.
- Per-organization pricing override and manual membership override.
- Margin reporting by time range and organization.

High-risk mutations should use the existing admin OTP guard.

## Customer Visibility

Customers see only customer charges:

- `estimated_cost_cents` remains the estimated customer charge.
- `actual_cost_cents` remains the final customer charge.
- Upstream estimate/actual cost and margin are never returned by public `/v1`
  video endpoints.

## Rollout

The migration seeds a global setting with `0` markup so existing behavior is
preserved until an operator changes pricing in admin. A recommended initial
business configuration is a 30% default markup with lower markups for higher
lifetime top-up tiers.
