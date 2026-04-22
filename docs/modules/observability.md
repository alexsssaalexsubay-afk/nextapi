# Observability Module

## Purpose
Know when it breaks, know why, know how fast.

## Metrics (Prometheus)
- `nextapi_http_requests_total{route,method,status}` — counter
- `nextapi_http_request_duration_seconds{route}` — histogram
- `nextapi_jobs_by_status{status}` — gauge
- `nextapi_provider_healthy{provider}` — gauge (1/0)

Backend exposes `GET /metrics`. Scraped by `ops/prometheus/prometheus.yml`.

## Logs
- Structured JSON via zap.
- Collected by promtail → Loki (see `ops/loki`, `ops/promtail`).
- Query via Grafana Explore.

## Traces
- OpenTelemetry: **TODO** (W4+). Plumb OTel SDK into Gin + GORM when latency
  pain appears.

## Dashboards
- `ops/grafana/dashboards/nextapi.json` — Request Rate / P95 / Error Rate /
  Jobs by Status.

## Alerts
- `ops/prometheus/alerts.yml`:
  - HighErrorRate (>5% for 5m)
  - HighLatency (p95 > 2s for 5m)
  - ProviderDown (3m)
  - QueueBacklog (pending > 1000 for 10m)

## Load testing
- `ops/k6/{smoke,baseline,spike}.js`.
- Baseline target: p95 < 500ms @ 50 VUs, error_rate < 1%.
