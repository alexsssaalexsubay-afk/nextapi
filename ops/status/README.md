# Status page

We use [Instatus](https://instatus.com) as SaaS. Configure:

## Components
- **API (api.nextapi.top)** — HTTP check every 30s → `GET /v1/health` expects 200.
- **Dashboard (app.nextapi.top)** — HTTP check → 200.
- **Docs (docs.nextapi.top)** — HTTP check → 200.
- **Seedance provider** — logic alert: `nextapi_provider_healthy{provider="seedance"} == 0` (Prometheus remote-write).
- **Database (Postgres)** — internal only, surfaced via aggregated "Infrastructure" component.

## Automation
Prometheus alertmanager → Instatus webhook on firing/resolved (see `ops/prometheus/alerts.yml`).

## Public URL
`https://status.nextapi.top` (CNAME to Instatus).
