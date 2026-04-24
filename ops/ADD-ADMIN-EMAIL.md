# Add yourself to `ADMIN_EMAILS` (admin panel allowlist)

The **API backend** (not the admin Cloudflare app) must have `ADMIN_EMAILS` in the
same environment as `docker compose` or `systemd` uses — usually the host file
**`/opt/nextapi/.env`** (or wherever your production `.env` lives).

The line to add is in **`.env.example`**. Your production **`.env` is usually not
in git** — so either copy the `ADMIN_EMAILS=...` line from `.env.example` into the
server’s `.env` by hand, or `nano` and type it, then **restart the backend and
worker** so the process rereads the env.

## If you use Docker (see `docker-compose.prod.yml`)

```bash
# SSH to the API host, then:
cd /opt/nextapi
grep -n ADMIN_EMAILS .env || true
# Edit .env: ensure a line like (comma-separated, no spaces around =):
#   ADMIN_EMAILS=279154661@qq.com
nano .env
docker compose -f docker-compose.prod.yml up -d --force-recreate backend worker
```

## After changing env

1. In the browser, open **admin.nextapi.top** → DevTools → Application → Session
   storage → remove keys starting with `nextapi.admin` (or close the site tab
   and open a fresh one).
2. Sign in with Clerk again; **Credits** and other admin API calls should load.

If you still see `not_in_admin_allowlist`, the running server is not the one you
edited (wrong host, or env not passed into the container).
