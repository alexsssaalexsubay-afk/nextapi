# Auth Module

## Purpose
Clerk-based authentication + API key management for NextAPI gateway.

## Invariants
- Every API request to `/v1/*` must carry a valid API key (`Authorization: Bearer sk_live_xxx`).
- API key full value is shown ONCE at creation; only prefix stored after hashing.
- Hash algorithm: argon2id.
- Revoked keys immediately return 401.
- Clerk webhook `user.created` triggers user + default org + 500 signup credits.
- Clerk webhook `user.deleted` soft-deletes user (set `deleted_at`).

## Data model
- **users**: id (text, = clerk user id), email, created_at, deleted_at
- **orgs**: id (uuid), name, owner_user_id (FK users), created_at
- **org_members**: org_id + user_id (composite PK), role (owner|admin|member)
- **api_keys**: id (uuid), org_id (FK orgs), prefix (text, "sk_live_xxx"), hash (argon2), name, last_used_at, created_at, revoked_at
- **api_key_scopes**: key_id + scope (composite PK), scope enum (video:generate, video:read, billing:read)

## Public surface
- `POST /v1/webhooks/clerk` — Clerk webhook receiver
- `POST /v1/keys` — create key (returns full key once)
- `GET /v1/keys` — list keys (prefix + name only)
- `DELETE /v1/keys/:id` — revoke key
- `GET /v1/auth/me` — return org info for current key
- Middleware: `AuthRequired()` Gin middleware

## Dependencies
- Clerk SDK (webhook signature verification)
- argon2 (golang.org/x/crypto/argon2)
- Postgres (users, orgs, org_members, api_keys, api_key_scopes tables)

## Extension points
- Add new scopes to api_key_scopes enum
- Add OAuth / session-based auth alongside API keys (W2+)

## Out of scope
- Clerk session JWT for dashboard routes (D2 uses Clerk's Next.js middleware only)
- Multi-org per user (v1: 1 user = 1 org)
- API key rotation (v2)
