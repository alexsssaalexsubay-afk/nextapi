# k6 Load Tests

Load testing suite for the nextapi backend.

## Prerequisites

- Install k6: https://k6.io/docs/get-started/installation/
- Backend reachable via `BASE_URL` (default `http://localhost:8080`)
- For baseline tests, a valid `API_KEY`

## Environment Variables

| Variable   | Default                 | Description                          |
|------------|-------------------------|--------------------------------------|
| `BASE_URL` | `http://localhost:8080` | Target backend base URL              |
| `API_KEY`  | *(required baseline)*   | API key for authenticated endpoints  |

## Scenarios

### Smoke — sanity check (1 VU, 30s)

```bash
k6 run ops/k6/smoke.js
```

### Baseline — sustained load (50 VUs, ~3m)

```bash
BASE_URL=http://localhost:8080 API_KEY=sk-xxx k6 run ops/k6/baseline.js
```

Thresholds: `p(95) < 500ms`, `error_rate < 1%`.

### Spike — infrastructure breathing test (1000 VUs, 10m)

```bash
k6 run ops/k6/spike.js
```

## Output

Add `--out json=out.json` or use k6 Cloud / Prometheus remote-write for
persistent results.
