# k6 Load Tests

Load testing suite for the nextapi backend.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/)
- For **local** authenticated tests: Docker (postgres + redis), Go 1.25+, and migrations applied
- `BASE_URL` (default `http://127.0.0.1:8080`)

## Environment Variables

| Variable     | Default                   | Description                                      |
|--------------|---------------------------|--------------------------------------------------|
| `BASE_URL`   | `http://127.0.0.1:8080`   | Target API base URL                              |
| `K6_API_KEY` | —                         | Business API key (from `go run ./cmd/k6seed`)   |
| `API_KEY`    | —                         | Alias of `K6_API_KEY` for `baseline.js`        |

## One command — four rounds (local, `PROVIDER_MODE=mock`)

Starts postgres/redis, migrates, seeds a test org + key (high burst/RPM), runs **server + worker** in the background, then:

1. `smoke.js` — `/health`
2. `health_concurrent.js` — 100 VU on `/health`
3. `baseline.js` — 50 VU on `POST /v1/videos`
4. `videos_concurrent.js` — 100 VU on `POST /v1/videos`

```bash
chmod +x ops/k6/run-rounds.sh
./ops/k6/run-rounds.sh
```

Logs: `.k6-server.log`, `.k6-worker.log` in the repo root.

### Seed only (get `K6_API_KEY`)

```bash
docker compose up -d postgres redis
export DATABASE_URL=postgres://nextapi:nextapi@127.0.0.1:5432/nextapi?sslmode=disable
( cd backend && go run github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres "$DATABASE_URL" up )
eval "$(cd backend && go run ./cmd/k6seed)"
echo "$K6_API_KEY"
```

## Individual scripts

### Smoke — sanity (1 VU, 30s)

```bash
k6 run ops/k6/smoke.js
```

### Baseline — 50 VU, `POST /v1/videos` (~3m)

```bash
BASE_URL=http://127.0.0.1:8080 K6_API_KEY=sk_… k6 run ops/k6/baseline.js
```

Thresholds: `p(95) < 500ms` on the create request, `error_rate < 1%` (HTTP 202).

### Health 100 VU — edge + Gin (no API key)

```bash
k6 run ops/k6/health_concurrent.js
```

### Videos 100 VU — full path (auth + job enqueue + mock provider)

```bash
K6_API_KEY=sk_… k6 run ops/k6/videos_concurrent.js
```

### Spike — 1000 VU on `/health` only (long; ingress stress)

```bash
k6 run ops/k6/spike.js
```

## Output

Add `--out json=out.json` or use k6 Cloud / Prometheus remote-write for
persistent results.
