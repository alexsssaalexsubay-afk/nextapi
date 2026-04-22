# Deploy

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

## Cloudflare Pages (frontends)

Three Pages projects, all from the same monorepo:

| Project             | Build command                     | Output dir                | Domain                  |
|---------------------|-----------------------------------|---------------------------|-------------------------|
| `nextapi-site`      | `pnpm i && pnpm -F @nextapi/site build`      | `apps/site/.next`      | `nextapi.top`           |
| `nextapi-dashboard` | `pnpm i && pnpm -F @nextapi/dashboard build` | `apps/dashboard/.next` | `app.nextapi.top`       |
| `nextapi-admin`     | `pnpm i && pnpm -F @nextapi/admin build`     | `apps/admin/.next`     | `admin.nextapi.top`     |

Env on all three:
- `NEXT_PUBLIC_API_URL=https://api.nextapi.top`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...`
- `CLERK_SECRET_KEY=...` (dashboard + admin)

Node 20, pnpm 9.

## Rollback

`./ops/deploy/rollback.sh` on the VPS reverts to the previous image tag
recorded in `.last-prev-tag`.

## Scripts

- `deploy.sh` — pull new image, compose up, health gate, auto-rollback on failure.
- `rollback.sh` — revert to `.last-prev-tag`.
- `vps-bootstrap.sh` — one-time VPS setup.
