# Brand Assets

## Purpose

Keep the NextAPI mark consistent across the marketing site, dashboard, admin,
and shared asset package.

## Current Slice

- `nextapi-logo.png` is the square app mark used by dashboard/admin shared UI.
- `logo-light.png` and `logo-dark.png` are marketing-site logo image assets.
- `favicon-32x32.png`, `icon-192.png`, and `apple-icon.png` are derived from the
  same master PNG.
- Dashboard and admin metadata should prefer PNG icons from public assets rather
  than an older standalone SVG mark.

## Verification

- Check generated PNG dimensions after replacement.
- Run dashboard typecheck/build after UI shell or metadata changes.
- Visually inspect the dashboard shell at favicon/app-icon size.
