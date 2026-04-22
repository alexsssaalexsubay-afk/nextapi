# Payment Module

## Purpose
Credit top-up via Stripe (overseas) / Alipay / WeChat (China).

## Invariants
- Payment SUCCESS webhook → `credits_ledger` row with `reason=topup`.
- Gateway never generates credits from a click — only from verified webhook.
- Every provider implements the same `Provider` interface (`payment/provider.go`).
- Signature verification is mandatory; unverified webhooks → 400.

## Current state (v1)
- **Stripe**: stub — returns placeholder checkout URL; webhook verification unimplemented.
- **Alipay**: stub.
- **WeChat**: stub.
Replace with real calls in W7.

## Public surface
- `POST /v1/billing/checkout` — body `{provider, credits, amount_cents}` → `{url, provider, external_id}`.
- `POST /v1/webhooks/payments/:provider` — inbound webhook fan-in.

## Out of scope (v1)
- Invoice PDFs (W7+).
- Refund flows.
- Tax calculation (relying on Stripe Tax + manual for CN).
