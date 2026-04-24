# Deploy

> 零基础或完整环境变量清单：仓库 [`docs/SETUP-GUIDE.md`](../../docs/SETUP-GUIDE.md) 与 [`docs/OPERATOR-HANDBOOK.md`](../../docs/OPERATOR-HANDBOOK.md)。

## First-time (VPS)

1. SSH into Aliyun HK VPS `47.76.205.108` as root (via Aliyun console).
2. Run `ops/deploy/vps-bootstrap.sh` (creates `deploy` user, installs Docker, opens 80/443).
3. Put your SSH pubkey into `/home/deploy/.ssh/authorized_keys`.
4. As `deploy`:
   ```bash
   cd /opt/nextapi
   git clone https://github.com/sanidg/nextapi.git .
   cp .env.example .env   # fill in real secrets
   docker compose -f docker-compose.prod.yml pull
   # First cert
   docker compose -f docker-compose.prod.yml run --rm --entrypoint "certbot certonly --webroot -w /var/www/certbot -d api.nextapi.top --agree-tos -m ops@nextapi.top" certbot
   ./ops/deploy/deploy.sh
   ```
5. DNS: `A api.nextapi.top -> 47.76.205.108` (grey cloud, NOT proxied — for cert issuing).

## GitHub secrets

- `DEPLOY_HOST` = `47.76.205.108`
- `DEPLOY_SSH_KEY` = private key whose pub is in `authorized_keys`.

## Cloudflare frontends

### `nextapi.top` on Cloudflare Pages

| Project        | Build command                           | Output dir       | Domain        |
|----------------|-----------------------------------------|------------------|---------------|
| `nextapi-site` | `pnpm i && pnpm -F @nextapi/site build` | `apps/site/out`  | `nextapi.top` |

### `app.nextapi.top` and `admin.nextapi.top` on Cloudflare Workers

Both SSR apps deploy with the OpenNext adapter:

| Worker              | Deploy command                               | Domain              |
|---------------------|-----------------------------------------------|---------------------|
| `nextapi-dashboard` | `pnpm i && pnpm -F @nextapi/dashboard deploy` | `app.nextapi.top`   |
| `nextapi-admin`     | `pnpm i && pnpm -F @nextapi/admin deploy`     | `admin.nextapi.top` |

Env on frontend deploys:
- `NEXT_PUBLIC_API_URL=https://api.nextapi.top`
- `NEXT_PUBLIC_DASHBOARD_URL=https://app.nextapi.top` (site)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...` (dashboard + admin)
- `CLERK_SECRET_KEY=...` (dashboard + admin)
- `NEXT_PUBLIC_POSTHOG_KEY=...` (site, optional)

**Build-time vs Worker runtime (dashboard / admin).** `NEXT_PUBLIC_*` is **inlined at `next build`**. Names you add only under the Worker’s **Settings → Variables and secrets** are for the **running** Worker. The **CI build** that runs `opennextjs-cloudflare build` / `pnpm -F @nextapi/… build` often **does not** receive those values, so the build can fail with “`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is not set” even when the key exists on the Worker. Fix: add the same `pk_…` value to the project’s **build** environment (Workers Builds: **Settings → Builds** and set **Build variables** / environment for the build — exact labels vary). The publishable key is safe to store as a non-secret “variable” for builds; `CLERK_SECRET_KEY` stays a secret and remains runtime-only as appropriate.

Node 20, pnpm 9.

## Rollback

`./ops/deploy/rollback.sh` on the VPS reverts to the previous image tag
recorded in `.last-prev-tag`.

## Scripts

- `deploy.sh` — pull new image, compose up, health gate, auto-rollback on failure.
- `rollback.sh` — revert to `.last-prev-tag`.
- `vps-bootstrap.sh` — one-time VPS setup.
- `production.env.template` — copy to `/opt/nextapi/.env` on the VPS (see comments inside).
- `REMOTE-SSH-CURSOR.md` — use Cursor **Remote-SSH** so the agent runs commands on the server.
