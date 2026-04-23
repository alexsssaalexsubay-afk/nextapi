# NextAPI

Video AI API gateway. Official Volcengine Seedance partner (1 of 20 globally).

→ **Full scope & weekly status:** [`STATUS.md`](./STATUS.md)  
→ **Architecture & agent rules:** [`CLAUDE.md`](./CLAUDE.md)  
→ **Human-readable doc index (incl. 零基础中文):** [`docs/README.md`](./docs/README.md)

## 完全不懂代码？

先读 [`docs/BEGINNERS-GUIDE-ZH.md`](./docs/BEGINNERS-GUIDE-ZH.md)（中文白话）和 [`docs/GLOSSARY-ZH.md`](./docs/GLOSSARY-ZH.md)（名词表）。对外文档站点源码在 **`docs-site/`**（Docusaurus），构建发布到 `docs.nextapi.top`。

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
- `docs/` — operator guides + **BEGINNERS-GUIDE-ZH** + glossary + `modules/` designs
- `docs-site/` — Docusaurus user docs (EN/ZH) for docs.nextapi.top
- `docs/mintlify/` — legacy Mintlify JSON (optional); prefer `docs-site/`
- `ops/` — nginx, prometheus, grafana, loki, k6, deploy scripts

## One-click deploys

- Backend: push to `main` → GitHub Actions builds image → SSH deploy to HK VPS.
- Marketing site: Cloudflare Pages static export for `nextapi.top`.
- Dashboard/admin: Cloudflare Workers via OpenNext for `app.nextapi.top` and `admin.nextapi.top`.

See [`ops/deploy/README.md`](./ops/deploy/README.md).
