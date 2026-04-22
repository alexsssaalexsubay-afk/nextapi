# Procurement Readiness Module

## Purpose
Enable enterprise procurement teams to approve NextAPI as a vendor.
Covers invoice fields, legal pages, and downloadable audit artifacts.

## Invoice fields on orgs
New columns on `orgs` table:
- `company_name TEXT` — legal entity name for invoices
- `tax_id TEXT` — VAT / EIN / unified social credit code
- `billing_email TEXT` — where invoices are sent
- `country_region TEXT` — ISO 3166-1 alpha-2 code

Self-serve: customers update via dashboard billing settings.
Admin: operators can override via admin panel.

## Legal pages (apps/site)
All under `/legal/*`:
- **AUP** (Acceptable Use Policy) — what customers cannot do
- **ToS** (Terms of Service) — contract terms
- **Privacy** — data handling, GDPR/PIPL basics
- **SLA** — uptime commitment, credit rebates (already written)
- **Refund Policy** — credit refund terms

Content is English-first, Chinese via next-intl. Lawyer review required
before public launch.

## CSV exports
- `GET /v1/usage.csv` — usage data for date range
- `GET /v1/ledger.csv` — full credits ledger

Both are admin-key gated. Response is `text/csv` with Content-Disposition
attachment header.

## Data model
New migration `00006_procurement.sql`:
```sql
ALTER TABLE orgs
  ADD COLUMN company_name   TEXT,
  ADD COLUMN tax_id         TEXT,
  ADD COLUMN billing_email  TEXT,
  ADD COLUMN country_region TEXT;
```

## Public surface
- `PATCH /v1/billing/settings` (admin key) — update invoice fields
- `GET /v1/billing/settings` (admin key) — read invoice fields
- `PATCH /v1/internal/admin/orgs/:id` — admin override
- `GET /v1/usage.csv` + `GET /v1/ledger.csv` — CSV downloads

## Test plan
1. Update billing settings → read back → match.
2. CSV export returns valid CSV with correct headers.
3. Admin can override org billing fields.

## Risks / TODOs
- TODO: Invoice PDF generation (W7, out of scope).
- TODO: Tax calculation logic (depends on jurisdiction).
- RISK: tax_id validation varies by country; v1 stores as plain text.
