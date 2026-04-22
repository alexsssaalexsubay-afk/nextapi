-- +goose Up
-- +goose StatementBegin

CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- Clerk user id
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE orgs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE org_members (
  org_id  UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    org_role NOT NULL,
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  prefix       TEXT NOT NULL,             -- e.g. "sk_live_abcd1234"
  hash         TEXT NOT NULL,             -- argon2id
  name         TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_org ON api_keys(org_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(prefix);

CREATE TYPE api_scope AS ENUM ('video:generate', 'video:read', 'billing:read');

CREATE TABLE api_key_scopes (
  key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  scope  api_scope NOT NULL,
  PRIMARY KEY (key_id, scope)
);

CREATE TYPE credit_reason AS ENUM (
  'signup_bonus', 'topup', 'consumption',
  'reservation', 'reconciliation', 'refund', 'adjustment'
);

CREATE TABLE credits_ledger (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  delta_credits BIGINT NOT NULL,
  reason        credit_reason NOT NULL,
  job_id        UUID,
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credits_ledger_org ON credits_ledger(org_id, created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS credits_ledger;
DROP TYPE  IF EXISTS credit_reason;
DROP TABLE IF EXISTS api_key_scopes;
DROP TYPE  IF EXISTS api_scope;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS org_members;
DROP TYPE  IF EXISTS org_role;
DROP TABLE IF EXISTS orgs;
DROP TABLE IF EXISTS users;

-- +goose StatementEnd
