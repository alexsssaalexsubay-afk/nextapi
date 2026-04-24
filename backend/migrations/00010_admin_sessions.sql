-- +goose Up
-- +goose StatementBegin
-- Admin operator sessions: short-lived, DB-backed, revocable.
--
-- When an admin authenticates via Clerk JWT the backend creates one of
-- these rows and returns an "ops_…" token. All subsequent admin UI calls
-- carry X-Op-Session instead of re-verifying Clerk JWKS on every request.
-- Sessions expire after 8 h hard TTL and are considered invalid after
-- 2 h of idle time (last_used_at check happens at lookup time).
--
CREATE TABLE IF NOT EXISTS operator_sessions (
    id           TEXT        PRIMARY KEY,           -- "ops_" + 32 random hex chars
    actor_email  TEXT        NOT NULL,
    ip_created   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_op_sessions_actor
    ON operator_sessions(actor_email);

CREATE INDEX IF NOT EXISTS idx_op_sessions_active
    ON operator_sessions(expires_at)
    WHERE revoked_at IS NULL;

-- Admin OTP: single-use 6-digit codes for high-risk operations.
-- Sent via Resend to the operator's email, expire in 10 minutes, and
-- are burned (used_at set) on first successful use.
--
CREATE TABLE IF NOT EXISTS admin_otp (
    id           TEXT        PRIMARY KEY,           -- random UUID
    actor_email  TEXT        NOT NULL,
    code_hash    TEXT        NOT NULL,              -- hex(SHA-256(6-digit-code))
    action       TEXT        NOT NULL,              -- "credits.adjust", "org.pause", ...
    target_id    TEXT,
    hint         TEXT,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_otp_actor
    ON admin_otp(actor_email, created_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_admin_otp_actor;
DROP TABLE IF EXISTS admin_otp;
DROP INDEX IF EXISTS idx_op_sessions_active;
DROP INDEX IF EXISTS idx_op_sessions_actor;
DROP TABLE IF EXISTS operator_sessions;
-- +goose StatementEnd
