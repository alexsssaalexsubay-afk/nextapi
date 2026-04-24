# NextAPI

Video AI API gateway — one HTTPS endpoint and API key for all supported video models.

→ **Full scope & weekly status:** [`STATUS.md`](./STATUS.md)  
→ **Architecture & agent rules:** [`CLAUDE.md`](./CLAUDE.md)  
→ **Human-readable doc index (incl. 零基础中文):** [`docs/README.md`](./docs/README.md)

## 完全不懂代码？

先读 [`docs/BEGINNERS-GUIDE-ZH.md`](./docs/BEGINNERS-GUIDE-ZH.md)（中文白话）→ [`docs/REPO-TOUR-ZH.md`](./docs/REPO-TOUR-ZH.md)（仓库里每个文件夹干啥）→ [`docs/FLOW-ZH.md`](./docs/FLOW-ZH.md)（生成请求怎么走）→ [`docs/FAQ-ZH.md`](./docs/FAQ-ZH.md) → [`docs/GLOSSARY-ZH.md`](./docs/GLOSSARY-ZH.md)（名词表）。对外文档站点源码在 **`docs-site/`**（Docusaurus），构建发布到 `docs.nextapi.top`。

## Quick start (local dev)

```bash
pnpm install
cd backend && go mod tidy && cd ..
cp .env.example .env      # fill Clerk + pick a provider (UPTOKEN_API_KEY for uptoken relay, or VOLC_API_KEY for Ark direct)
make dev                  # pg+redis via docker, backend :8080, site :3001, dashboard :3000, admin :3002
```

Health: `curl localhost:8080/health` → `{"status":"ok"}`

## Layout

- `backend/` — Go 1.25 gateway + worker (single binary, different cmd)
- `apps/site` — nextapi.top marketing (EN/ZH)
- `apps/dashboard` — app.nextapi.top customer console
- `apps/admin` — admin.nextapi.top operator panel
- `packages/` — shared UI kit, tsconfig, eslint config, api-client
- `sdks/{python,node,go}` — official SDKs（导读 [`sdks/README.md`](./sdks/README.md)）
- `toolkit/` — 本地 Python 批量工具（中文 [`toolkit/README.zh.md`](./toolkit/README.zh.md)）
- `docs/` — 零基础中文 + **REPO-TOUR-ZH / FLOW-ZH / FAQ** + 运维手册 + `modules/` 设计
- `docs-site/` — Docusaurus user docs (EN/ZH) for docs.nextapi.top
- `docs/mintlify/` — legacy Mintlify JSON (optional); prefer `docs-site/`
- `ops/` — nginx, prometheus, grafana, loki, k6, deploy scripts

## One-click deploys

- Backend: push to `main` → GitHub Actions builds image → SSH deploy to HK VPS.
- Marketing site: Cloudflare Pages static export for `nextapi.top`.
- Dashboard/admin: Cloudflare Workers via OpenNext for `app.nextapi.top` and `admin.nextapi.top`.

See [`ops/deploy/README.md`](./ops/deploy/README.md).
