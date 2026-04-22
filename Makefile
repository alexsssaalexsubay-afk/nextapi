.PHONY: dev test lint build openapi migrate deploy clean

SHELL := /bin/bash

dev:
	docker compose up -d postgres redis
	@echo "Starting backend + 3 frontends (Ctrl-C to stop)..."
	@( cd backend && go run ./cmd/server 2>&1 | sed 's/^/[backend] /' ) & \
	  ( pnpm -C apps/site dev 2>&1 | sed 's/^/[site] /' ) & \
	  ( pnpm -C apps/dashboard dev 2>&1 | sed 's/^/[dash] /' ) & \
	  ( pnpm -C apps/admin dev 2>&1 | sed 's/^/[admin] /' ) & \
	  wait

test:
	cd backend && go test ./...
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
