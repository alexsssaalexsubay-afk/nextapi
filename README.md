# NextAPI

Video AI API gateway. Official Volcengine Seedance partner (1 of 20 globally).

→ **Full scope & weekly status:** [`STATUS.md`](./STATUS.md)
→ **Architecture & agent rules:** [`CLAUDE.md`](./CLAUDE.md)
→ **Module designs:** [`docs/modules/`](./docs/modules)

## Quick start (local dev)

```bash
pnpm install
cd backend && go mod tidy && cd ..
cp .env.example .env      # fill Clerk + (optionally) VOLC_API_KEY
make dev                  # pg+redis via docker, backend :8080, site :3001, dashboard :3000, admin :3002
```

Health: `curl localhost:8080/health` → `{"status":"ok"}`

## Layout

- `backend/` — Go 1.25 gateway + worker (single binary, different cmd)
- `apps/site` — nextapi.top marketing (EN/ZH)
- `apps/dashboard` — app.nextapi.top customer console
- `apps/admin` — admin.nextapi.top operator panel
- `packages/` — shared UI kit, tsconfig, eslint config, api-client
- `sdks/{python,node,go}` — official SDKs
- `docs/modules/` — per-module design docs
- `docs/mintlify/` — docs.nextapi.top content
- `ops/` — nginx, prometheus, grafana, loki, k6, deploy scripts

## One-click deploys

- Backend: push to `main` → GitHub Actions builds image → SSH deploy to HK VPS.
- Marketing site: Cloudflare Pages static export for `nextapi.top`.
- Dashboard/admin: Cloudflare Workers via OpenNext for `app.nextapi.top` and `admin.nextapi.top`.

See [`ops/deploy/README.md`](./ops/deploy/README.md).
