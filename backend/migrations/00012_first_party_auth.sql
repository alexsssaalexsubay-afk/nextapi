-- +goose Up
-- +goose StatementBegin

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_e164
  ON users(phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   TEXT NOT NULL UNIQUE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_agent   TEXT NOT NULL DEFAULT '',
  ip_created   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
  ON auth_sessions(token_hash)
  WHERE revoked_at IS NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS auth_sessions;
DROP INDEX IF EXISTS idx_users_phone_e164;
ALTER TABLE users
  DROP COLUMN IF EXISTS phone_verified_at,
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS phone_e164;

-- +goose StatementEnd
