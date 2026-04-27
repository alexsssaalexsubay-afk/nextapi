# BytePlus Model Catalog Intake

Source: local customer quote PDF `BytePlus_客户报价_20260427.pdf` received on 2026-04-27.

## Public Model Surface

Expose stable NextAPI model IDs, not raw vendor contract details:

- Video: `seedance-2.0-pro`, `seedance-2.0-fast`, `seedance-1.5-pro`, `seedance-1.0-pro`, `seedance-1.0-pro-fast`
- Image placeholders: `seedream-4.0`, `seedream-4.5`, `seedream-5.0-lite`
- Text placeholders: `seed-1.6`, `seed-1.8`
- Digital human placeholders: `omnihuman-1.0`, `omnihuman-1.5` are noted for future product planning, but not exposed until the provider/task contract exists.

## Product Rules

- Do not publish BytePlus customer quote prices on the marketing site.
- Public pages may show capability and model availability only.
- Actual customer-facing credit prices must come from admin-configurable pricing tables.
- Workflow and Canvas model selection should stay compact: current model in a dropdown, provider badge visible, details only inside the menu.

## Integration Notes

- Video generation remains routed through the existing Seedance/UpToken provider and task/billing system.
- Image/text models are catalogued in the dashboard for provider readiness but remain disabled until admin provider configuration is implemented.
- Durations are 4-15 seconds in UI controls; use a slider for customer workflows.
