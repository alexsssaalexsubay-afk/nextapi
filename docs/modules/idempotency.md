# Idempotency Module

## Purpose
Prevent duplicate video generation charges when customers retry POST
requests (network timeouts, load balancer retries, client bugs). The
gateway deduplicates based on `Idempotency-Key` header.

## Invariants
- Scope: per (org_id, key). Different orgs can reuse the same key string.
- Window: 24 hours from first use. After TTL, the key can be reused.
- Same key + same body SHA-256 → replay cached response (same status code
  + body). No side effects.
- Same key + different body SHA-256 → 409 `idempotency_conflict`.
- No header → request proceeds normally (no dedup).
- The cached response is stored as JSONB + status_code in
  `idempotency_keys` table.
- Cleanup: worker cron deletes rows older than 24h every hour.

## Data model
Already exists in migration 00005:
```sql
CREATE TABLE idempotency_keys (
  org_id      UUID NOT NULL,
  key         TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  response    JSONB NOT NULL,
  status_code INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
```

Also: `videos.idempotency_key` column for cross-reference.

## Flow
1. Middleware reads `Idempotency-Key` header.
2. If absent, skip (call next handler).
3. Read body, compute SHA-256.
4. SELECT from `idempotency_keys WHERE org_id = ? AND key = ?`.
5. If found + same hash → replay cached response, abort chain.
6. If found + different hash → 409 abort.
7. If not found → set context keys `idem.key` + `idem.body_sha`, call next.
8. Handler calls `idempotency.Commit()` after successful write to cache
   the response for future replay.

## Test plan
1. First request with key → 202 + response cached.
2. Second request with same key + same body → replay 202.
3. Second request with same key + different body → 409.
4. Request without key → normal flow, no cache row.
5. TTL cleanup removes rows older than 24h.

## Risks / TODOs
- TODO: Row-level lock during Commit to avoid race between two identical
  concurrent requests. Current impl relies on PK constraint; second
  insert silently fails. This is acceptable for v1.
- RISK: Large response bodies stored in JSONB. Mitigate: max response
  size check (video creation responses are small, ~500 bytes).
