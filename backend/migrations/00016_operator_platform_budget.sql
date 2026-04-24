-- +goose Up
-- +goose StatementBegin

-- Single row: operator-defined upstream / platform credit ceiling (same unit as
-- delta_credits on credits_ledger). Remaining = budget - all-time usage debits.
CREATE TABLE IF NOT EXISTS operator_platform_budget (
    id              INT         PRIMARY KEY CHECK (id = 1),
    budget_credits  BIGINT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO operator_platform_budget (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS operator_platform_budget;
-- +goose StatementEnd
