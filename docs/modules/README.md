# docs/modules/

> 零基础读者请改读 [`../BEGINNERS-GUIDE-ZH.md`](../BEGINNERS-GUIDE-ZH.md)；本目录面向 **设计与开发**。

Per CLAUDE.md rule: **Before changing > 3 files, write or update `docs/modules/<name>.md` first.**

Each module doc MUST declare:
1. **Purpose** — one-liner.
2. **Invariants** — what must always hold.
3. **Public surface** — exported types/functions/HTTP routes.
4. **Dependencies** — upstream packages / DB tables / env vars.
5. **Extension points** — how to add a new provider / scope / reason.
6. **Out of scope** — explicit non-goals (guard against feature creep).

Modules planned for W1:
- `scaffold.md` — D1 monorepo bootstrap (this phase).
- `auth.md` — D2 Clerk + API keys.
- `billing.md` — D2 credits ledger.
- `provider.md` — D3 Provider adapter + Seedance.
- `job.md` — D3 async job engine.

Additional slices (see files in this directory):
- `seedance-relay-webhook-assets.md` — managed Seedance relay callbacks (`POST /api/webhooks/seedance`), HMAC secret, optional asset library sync.
- `email-otp-easypay-billing.md` — dashboard email OTP, EasyPay checkout, notify URL behaviour.
