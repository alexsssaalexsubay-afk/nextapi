-- +goose Up
-- Invoice/procurement fields on organizations.

ALTER TABLE orgs ADD COLUMN company_name   TEXT;
ALTER TABLE orgs ADD COLUMN tax_id         TEXT;
ALTER TABLE orgs ADD COLUMN billing_email  TEXT;
ALTER TABLE orgs ADD COLUMN country_region TEXT;

COMMENT ON COLUMN orgs.company_name   IS 'Legal entity name for invoices';
COMMENT ON COLUMN orgs.tax_id         IS 'VAT / EIN / unified social credit code';
COMMENT ON COLUMN orgs.billing_email  IS 'Email address for invoices';
COMMENT ON COLUMN orgs.country_region IS 'ISO 3166-1 alpha-2 country/region code';

-- +goose Down
ALTER TABLE orgs DROP COLUMN IF EXISTS company_name;
ALTER TABLE orgs DROP COLUMN IF EXISTS tax_id;
ALTER TABLE orgs DROP COLUMN IF EXISTS billing_email;
ALTER TABLE orgs DROP COLUMN IF EXISTS country_region;
