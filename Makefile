.PHONY: dev test test-backend test-backend-unit test-backend-race test-toolkit test-frontend lint build openapi migrate deploy clean

SHELL := /bin/bash

dev:
	docker compose up -d postgres redis
	@echo "Starting backend + 3 frontends (Ctrl-C to stop)..."
	@( cd backend && go run ./cmd/server 2>&1 | sed 's/^/[backend] /' ) & \
	  ( pnpm -C apps/site dev 2>&1 | sed 's/^/[site] /' ) & \
	  ( pnpm -C apps/dashboard dev 2>&1 | sed 's/^/[dash] /' ) & \
	  ( pnpm -C apps/admin dev 2>&1 | sed 's/^/[admin] /' ) & \
	  wait

# ─── Main test target — runs everything ──────────────────────────────────────
test: test-backend test-toolkit
	@echo "✅ All tests passed"

# ─── Backend Go tests ─────────────────────────────────────────────────────────

# All backend tests (unit + integration + contract).
test-backend:
	@echo "==> Backend tests (SQLite in-memory, miniredis)"
	cd backend && go test ./... -timeout 120s -count=1

# Unit tests only (skip live/integration tests that hit real Redis or network).
test-backend-unit:
	@echo "==> Backend unit tests (no external deps)"
	cd backend && go test ./internal/domain/... ./internal/billing/... ./internal/job/... \
	  ./internal/webhook/... ./internal/auth/... ./internal/spend/... ./internal/batch/... \
	  ./internal/moderation/... ./internal/throughput/... \
	  -timeout 60s -count=1 -v

# Race detector — critical for concurrency / credits correctness.
test-backend-race:
	@echo "==> Backend tests with race detector"
	cd backend && go test ./internal/billing/... ./internal/job/... ./internal/batch/... \
	  -race -timeout 120s -count=1 -v

# Contract tests only.
test-contract:
	@echo "==> API contract tests"
	cd backend && go test ./tests/... -timeout 60s -count=1 -v

# Retry / backoff unit tests only.
test-retry:
	@echo "==> Retry classification + backoff tests"
	cd backend && go test ./internal/job/ -run TestClassifyError -run TestDelayFor -v -count=1

# Billing / credits correctness tests.
test-billing:
	@echo "==> Billing / credits ledger tests"
	cd backend && go test ./internal/billing/... -v -count=1

# Concurrency safety tests (with race detector).
test-concurrency:
	@echo "==> Concurrency tests (race detector enabled)"
	cd backend && go test ./internal/job/ -run TestConcurrent -run TestCreate_EnqueueFailure \
	  -race -timeout 60s -v -count=1

# ─── Python / Batch Studio tests ─────────────────────────────────────────────
test-toolkit:
	@echo "==> Batch Studio logic tests"
	cd toolkit/batch_studio && \
		([ -f .venv/bin/pytest ] && .venv/bin/pytest test_logic.py -v --tb=short) || \
		(python3 -m pytest test_logic.py -v --tb=short 2>/dev/null) || \
		(python -m pytest test_logic.py -v --tb=short)

# ─── Frontend tests ───────────────────────────────────────────────────────────
test-frontend:
	@echo "==> Frontend tests"
	pnpm -r test --run

lint:
	cd backend && golangci-lint run ./... || true
	pnpm -r lint --fix || true

build:
	docker build -t nextapi-backend:dev backend
	pnpm -r build

openapi:
	@echo "Regenerating packages/api-client from backend/api/openapi.yaml..."
	pnpm -C packages/api-client generate

migrate:
	cd backend && goose -dir migrations postgres "$$DATABASE_URL" up

deploy:
	@echo "Use GitHub Actions. See ops/deploy/README.md."

clean:
	docker compose down -v
	rm -rf **/node_modules **/.next **/dist backend/bin
