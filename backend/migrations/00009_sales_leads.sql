-- +goose Up
-- +goose StatementBegin

-- Sales lead inbox.
--
-- Why a table instead of just emailing the inquiry: Resend / DNS / SES /
-- whatever-mailer is a brittle dependency. If it 5xxs or the API key
-- isn't set yet, the previous code lost the lead silently — the inbox
-- was the system of record. Now the row is written first and email is
-- only a notification; an unsent email leaves the row recoverable.
CREATE TABLE IF NOT EXISTS sales_leads (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  company     TEXT NOT NULL,
  email       TEXT NOT NULL,            -- raw email for outbound reply
  email_hash  TEXT NOT NULL,            -- sha256(email) for log correlation
  volume      TEXT,
  latency     TEXT,
  message     TEXT,
  source      TEXT NOT NULL DEFAULT 'site',  -- "site" | "manual" | "api"
  ip          TEXT,
  user_agent  TEXT,
  notified_at TIMESTAMPTZ,              -- non-null = at least one outbound email succeeded
  notify_error TEXT,                    -- last error from notifier, NULL on success
  contacted_at TIMESTAMPTZ,             -- operator marks once they reply
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_created       ON sales_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_leads_uncontacted   ON sales_leads (created_at DESC) WHERE contacted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_email         ON sales_leads (email);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS sales_leads;
-- +goose StatementEnd
