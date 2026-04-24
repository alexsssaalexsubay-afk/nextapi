#!/usr/bin/env bash
# Local multi-round k6 against a dev backend. Prerequisites: Docker, k6, go, goose.
# From repo root:
#   chmod +x ops/k6/run-rounds.sh
#   ./ops/k6/run-rounds.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 not found. Install: https://k6.io/docs/get-started/installation/"
  exit 1
fi
goose() {
  if command -v goose >/dev/null 2>&1; then
    ( cd "$ROOT/backend" && command goose "$@" )
  else
    ( cd "$ROOT/backend" && go run github.com/pressly/goose/v3/cmd/goose@latest "$@" )
  fi
}

export DATABASE_URL="${DATABASE_URL:-postgres://nextapi:nextapi@127.0.0.1:5432/nextapi?sslmode=disable}"
export PROVIDER_MODE="${PROVIDER_MODE:-mock}"
export APP_ENV="${APP_ENV:-dev}"
export REDIS_ADDR="${REDIS_ADDR:-127.0.0.1:6379}"
export SERVER_ADDR="${SERVER_ADDR:-:8080}"

echo "==> docker compose (postgres + redis)"
docker compose up -d postgres redis

echo "==> goose up"
( cd "$ROOT/backend" && goose -dir migrations postgres "$DATABASE_URL" up )

echo "==> k6 seed (org + API key + throughput)"
eval "$(cd backend && go run ./cmd/k6seed)"
export K6_API_KEY
if [[ -z "${K6_API_KEY:-}" ]]; then
  echo "k6seed did not print K6_API_KEY"
  exit 1
fi

export BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"

echo "==> start server + worker (background)"
( cd backend && go run ./cmd/server ) >"$ROOT/.k6-server.log" 2>&1 &
SPID=$!
( cd backend && go run ./cmd/worker ) >"$ROOT/.k6-worker.log" 2>&1 &
WPID=$!
cleanup() {
  kill "$SPID" "$WPID" 2>/dev/null || true
  wait "$SPID" 2>/dev/null || true
  wait "$WPID" 2>/dev/null || true
}
trap cleanup EXIT

for i in {1..40}; do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if [[ "$i" -eq 40 ]]; then
    echo "server did not become healthy; see $ROOT/.k6-server.log"
    exit 1
  fi
done

round() {
  local name=$1
  shift
  echo ""
  echo "========== $name =========="
  "$@"
}

round "1/4 smoke" k6 run "$ROOT/ops/k6/smoke.js"
round "2/4 health 100 VU" k6 run "$ROOT/ops/k6/health_concurrent.js"
round "3/4 baseline (50 VU, /v1/videos)" k6 run "$ROOT/ops/k6/baseline.js"
round "4/4 videos 100 VU" k6 run "$ROOT/ops/k6/videos_concurrent.js"

echo ""
echo "==> All k6 rounds finished. Server logs: .k6-server.log .k6-worker.log"
