-- +goose Up
-- +goose StatementBegin

-- Hardening pass: dedup tables for webhook idempotency, an admin audit
-- trail, indexes for the reconciliation worker, and a soft cap on the
-- number of active API keys per org.

-- ---------------------------------------------------------------
-- Clerk webhook dedup (Svix retries identical events on 5xx; without
-- this we would re-provision users and double-grant signup bonuses).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clerk_webhook_seen (
  svix_id      TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TTL: keep ~14d of history (Svix retry window is shorter; this is buffer).
CREATE INDEX IF NOT EXISTS idx_clerk_webhook_seen_age
  ON clerk_webhook_seen (processed_at);

-- ---------------------------------------------------------------
-- Generic dedup table for payment provider webhooks (Stripe event.id,
-- Wise event_id etc). Same shape, different upstream namespace.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_webhook_seen (
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_seen_age
  ON payment_webhook_seen (processed_at);

-- ---------------------------------------------------------------
-- Admin audit log. Every state-changing internal-admin action MUST
-- write a row here. Used for compliance investigations and "who paused
-- this customer at 3am" forensics.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  actor_email  TEXT,
  actor_ip     TEXT,
  actor_kind   TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'system' | 'support'
  action       TEXT NOT NULL,                  -- e.g. 'org.pause', 'credits.adjust'
  target_type  TEXT,                           -- 'org' | 'user' | 'job' | 'webhook' | etc
  target_id    TEXT,
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON audit_log (actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target     ON audit_log (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_at  ON audit_log (action, created_at DESC);

-- ---------------------------------------------------------------
-- Reconciliation index: the recon worker scans for jobs that are still
-- in queued/running but have not been touched in > 1h (provider crash,
-- worker SIGKILL'd, etc) and refunds the reservation.
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_status_started
  ON jobs (status, started_at)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS idx_videos_status_started
  ON videos (status, started_at)
  WHERE status IN ('queued','running');

-- ---------------------------------------------------------------
-- Idempotency cleanup index — the cron deletes rows older than 24h.
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created
  ON idempotency_keys (created_at);

-- ---------------------------------------------------------------
-- Webhook deliveries: index for the worker that picks "due" rows.
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
  ON webhook_deliveries (next_retry_at)
  WHERE delivered_at IS NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_webhook_deliveries_due;
DROP INDEX IF EXISTS idx_idempotency_keys_created;
DROP INDEX IF EXISTS idx_videos_status_started;
DROP INDEX IF EXISTS idx_jobs_status_started;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS payment_webhook_seen;
DROP TABLE IF EXISTS clerk_webhook_seen;
-- +goose StatementEnd
