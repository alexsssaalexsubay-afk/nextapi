-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS topup_orders (
  id            UUID PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'easypay',
  payment_type  TEXT NOT NULL,
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  credits       BIGINT NOT NULL CHECK (credits > 0),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  external_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_topup_orders_org_created
  ON topup_orders(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_topup_orders_pending
  ON topup_orders(status, created_at)
  WHERE status = 'pending';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_topup_orders_pending;
DROP INDEX IF EXISTS idx_topup_orders_org_created;
DROP TABLE IF EXISTS topup_orders;

-- +goose StatementEnd
