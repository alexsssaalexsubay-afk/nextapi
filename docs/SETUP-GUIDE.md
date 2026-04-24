# NextAPI 部署上线操作指南

> **零基础读者**：部署涉及 DNS、服务器、环境变量，请先读 [`BEGINNERS-GUIDE-ZH.md`](./BEGINNERS-GUIDE-ZH.md) 搞清「五个网址」和名词，再按本文逐步操作或交给技术人员。  
> 文档总目录：[`docs/README.md`](./README.md)。

> 本文档列出把 NextAPI 从代码变成可运营产品需要**你手动操作**的所有步骤。
> 代码层面的工作已经全部完成。以下是需要你在各个平台上配置的事情。

> **当前状态（2026-04-23）**：所有服务已经上线运行。本文档既是部署指南，也是
> 复盘/灾备 runbook。

---

## 当前部署拓扑（认准这个，别再踩坑）

```
┌───────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  nextapi.top          │  │  app.nextapi.top     │  │  admin.nextapi.top   │
│  Cloudflare Pages     │  │  Cloudflare Workers  │  │  Cloudflare Workers  │
│  apps/site (静态)     │  │  apps/dashboard      │  │  apps/admin          │
│                       │  │  OpenNext + Clerk    │  │  OpenNext + Clerk    │
└───────────────────────┘  └──────────┬───────────┘  └──────────┬───────────┘
                                      └────────────┬────────────┘
                                                   │ HTTPS
                                                   ▼
                                  ┌─────────────────────────────────┐
                                  │  api.nextapi.top                │
                                  │  Aliyun HK VPS  47.76.205.108   │
                                  │  Nginx :443 (Let's Encrypt)     │
                                  │  → Go Gin :8080                 │
                                  │  systemd: nextapi-server,       │
                                  │           nextapi-worker        │
                                  │  docker: postgres, redis        │
                                  └─────────────────────────────────┘
```

要点：
- **Marketing 静态站** 用 Cloudflare Pages（零成本，海外+国内都快）。
- **Dashboard / Admin** 用 Cloudflare Workers + OpenNext（SSR + Clerk 都跑在边缘，不再占用 VPS）。
- **API** 跑在 VPS 上，DNS 走 **grey-cloud（DNS only，不过 Cloudflare 代理）**，证书用 Let's Encrypt。
  - 之所以 grey-cloud：Cloudflare Workers 通过 fetch 调 API 时，如果 api 也走 CF orange-cloud，会触发循环路径与 Worker→Worker 限流。
- **VPS Nginx 只对外暴露 api.nextapi.top**，dashboard/admin 的 systemd 单元已停用并 disable。

---

## 一、域名 DNS 配置（Cloudflare）

| 类型 | 名称 | 值 | 代理状态 | 用途 |
|------|------|-----|----------|------|
| A | `api` | `47.76.205.108` | **DNS only（灰云）** | Go 后端 API |
| A | `app` | Cloudflare Workers 自动绑定 | 橙云 | Dashboard |
| A | `admin` | Cloudflare Workers 自动绑定 | 橙云 | Admin |
| CNAME | `@` (根域 nextapi.top) | Pages 给的 `xxx.pages.dev` | 橙云 | 营销官网 |
| CNAME | `cdn` | R2 自定义域配置后给的值 | 橙云 | 视频 CDN |

> **重点**：`api` 这条记录必须是 **DNS only**（灰云）。Workers 绑定 `app/admin` 是
> 在 Cloudflare Workers Dashboard 里的 "Custom Domains" 完成的，不是你手动建 A 记录。

---

## 二、认证配置

Dashboard 主链路使用 NextAPI 自研账号会话，早期采用邀请制：

```bash
cd backend
go run ./cmd/accountctl \
  --email customer@example.com \
  --password 'replace-with-a-strong-password' \
  --org 'Customer Name' \
  --credits 50000
```

客户随后访问 `https://app.nextapi.top/sign-in` 登录。登录成功后后端会创建
`auth_sessions` 记录，并签发短期 `dashboard-session` key 给浏览器调用业务 API。

> Clerk 可在 Admin 或历史兼容链路中短期保留，但 Dashboard 主链路不再依赖 Clerk。

## 二点五、Clerk 认证配置（历史兼容 / Admin 过渡）

1. 登录 https://dashboard.clerk.com
2. 创建 Application（或用已有的）
3. 获取以下密钥（开发环境用 `pk_test_*` / `sk_test_*`，生产换 `pk_live_*`）：

| 变量名 | 从哪里获取 |
|--------|-----------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys |
| `CLERK_WEBHOOK_SECRET` | 见步骤 4 |

4. 配置 Clerk Webhook：
   - Clerk Dashboard → Webhooks → "Add Endpoint"
   - URL：`https://api.nextapi.top/v1/webhooks/clerk`
   - 事件：`user.created`、`user.updated`、`user.deleted`
   - 创建后复制 Signing Secret → `CLERK_WEBHOOK_SECRET`

### Clerk → API key 自动桥接（dashboard / admin 一键登录）

**原理**：用户用 Clerk 登录 dashboard / admin 后，前端用当前 session 拿到 Clerk 签发的 JWT，
POST 到后端 `POST /v1/me/bootstrap`（dashboard）或 `POST /v1/internal/admin/session`（admin）。
后端拉 Clerk 的 JWKS 验签，然后：

- **Dashboard**：lazy-provision User+Org+SignupBonus → revoke 旧的 `dashboard-session` key →
  现场 mint 一把新的 `sk_live_*` 返回给前端，前端只放在 `sessionStorage`，关浏览器即丢失。
- **Admin**：从 JWT 拿 email（拿不到就走 Clerk Backend API 查），命中 `ADMIN_EMAILS` 才签发
  短时 `ops_*` operator session。高危操作再走邮件 OTP；共享 `ADMIN_TOKEN` 只给脚本/cron 使用，不下发到浏览器。

**前置条件（缺一就 503）**：

| 后端 env | 用途 |
|----------|------|
| `CLERK_ISSUER` | JWKS 验签的 issuer，写成 `https://你的Clerk frontend API` |
| `CLERK_SECRET_KEY` | 仅在 JWT 不带 email 时用 Backend API 反查 |
| `ADMIN_EMAILS` | admin operator session 白名单 |
| `ADMIN_TOKEN` | 仅脚本 / cron / 紧急运维使用，不能下发给浏览器 |
| `RESEND_API_KEY` | admin 高危操作邮件 OTP；未配置时 OTP 会明确失败 |

**用户体验**：登录 → 进 dashboard 任意页面 → 第一次 fetch 自动 bootstrap → 业务可用。
不再需要用户手动复制 API key 到 localStorage。

### Clerk 登录页域名（你问到的 `big-vulture-6.accounts.dev`）

- 这是 Clerk 在**开发模式**下自动给你的 `*.accounts.dev` 域名，免费。
- 想改成 `accounts.nextapi.top` 这种自有域名，必须升级 Clerk Pro（$25/月起）+ 添加自定义域名。
- **现阶段建议**：保持开发模式 + `*.accounts.dev`，等正式开始收费再升级。
- 升级后只要在 Clerk Dashboard → Domains 里加自定义域，按提示配 DNS（CNAME 到 Clerk 给的值），改前端 `wrangler.toml` 里的 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 为生产 key 即可，不用改业务代码。

---

## 三、Cloudflare Pages 部署（营销官网 nextapi.top）

```bash
# 本地构建 + 部署
pnpm --filter @nextapi/site build
cd apps/site
npx wrangler pages deploy out --project-name=nextapi-site
```

首次部署后：
1. 进入 Cloudflare Dashboard → Pages → `nextapi-site` → Custom Domains
2. 添加 `nextapi.top`（按提示自动加 CNAME）

GitHub Actions 自动部署已配置在 `.github/workflows/`，推送 main 即触发。

---

## 四、Cloudflare Workers 部署（Dashboard + Admin）

### 4.1 一次性认证

```bash
npx wrangler login   # 浏览器授权 Cloudflare
```

### 4.2 部署 Dashboard

```bash
cd apps/dashboard
pnpm build                                 # Next.js production build
npx opennextjs-cloudflare build            # 转成 Workers 可执行
npx wrangler deploy                        # 上线到 nextapi-dashboard worker
```

`apps/dashboard/wrangler.toml` 已绑定自定义域 `app.nextapi.top`，部署后会自动生效。

### 4.3 部署 Admin

```bash
cd apps/admin
pnpm build
npx opennextjs-cloudflare build
npx wrangler deploy
```

绑定域名：`admin.nextapi.top`。

### 4.4 配置 Workers 密钥（敏感信息）

公开变量已经写在 `wrangler.toml [vars]` 里（如 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`、`NEXT_PUBLIC_API_URL`）。
密钥变量必须用 `wrangler secret put`：

```bash
# Dashboard
cd apps/dashboard
echo -n "sk_live_xxxxx" | npx wrangler secret put CLERK_SECRET_KEY

# Admin
cd ../admin
echo -n "sk_live_xxxxx" | npx wrangler secret put CLERK_SECRET_KEY
```

> 切换 Clerk live 环境时，**两个 worker 都要重新 `secret put`**。

---

## 五、VPS 配置（阿里云 HK，仅跑 API + Worker）

### 5.1 一次性安装

```bash
ssh root@47.76.205.108
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin nginx certbot python3-certbot-nginx
```

### 5.2 启动 Postgres + Redis

```bash
cd /opt/nextapi
docker compose up -d postgres redis
```

### 5.3 环境变量 `/opt/nextapi/.env`

```bash
# ===== 数据库 =====
DATABASE_URL=postgres://nextapi:你设置的密码@localhost:5432/nextapi?sslmode=disable

# ===== Redis =====
REDIS_ADDR=localhost:6379

# ===== 服务器 =====
SERVER_ADDR=:8080

# ===== Clerk 认证（关键：少了 CLERK_ISSUER 浏览器登录后会卡死）=====
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxx
# CLERK_ISSUER 是 Clerk Frontend API URL，开发模式形如
# https://big-vulture-6.clerk.accounts.dev；生产换成 https://clerk.你的域名.com
# 后端用它的 /.well-known/jwks.json 验签前端 Clerk session JWT。
# 没设这个值时 POST /v1/me/bootstrap 会 503，dashboard 就拿不到业务 key。
CLERK_ISSUER=https://big-vulture-6.clerk.accounts.dev

# ===== 上游视频提供方 =====
# PROVIDER_MODE 三选一：
#   mock    —— 进程内假 Provider（默认，本地/CI）
#   live    —— 方舟 Ark 直连（需要 VOLC_API_KEY）
#   seedance_relay —— Seedance 托管中继（需要 SEEDANCE_RELAY_API_KEY，推荐）
PROVIDER_MODE=seedance_relay

# ---- 方案 A：Seedance 托管中继（推荐：开箱即用） ----
# 由运维交接上游中继 key；这是我们的服务端 key，不给客户分发。
SEEDANCE_RELAY_API_KEY=<relay-key>
SEEDANCE_RELAY_BASE_URL=<relay-base-url>
SEEDANCE_RELAY_MODEL=seedance-2.0-pro
# 可选：公开目录里每个 model → Seedance 托管中继 真实 ID（逗号分隔 公开ID:上游ID）
# 默认已内置 seedance-2.0→seedance-2.0-pro、seedance-2.0-fast 透传
# SEEDANCE_RELAY_MODEL_MAP=seedance-2.0:seedance-2.0-pro,seedance-2.0-fast:seedance-2.0-fast

# ---- 方案 B：方舟 Ark 直连 ----
VOLC_API_KEY=你的方舟API密钥
# 客户未传 model 时的默认 Ark 接入点 ID（须与控制台一致）
SEEDANCE_MODEL=doubao-seedance-1-5-pro-251215
# 必配：公开目录里每个 model → 控制台真实 doubao-seedance-*（逗号分隔 公开ID:ArkID）
# SEEDANCE_MODEL_MAP=seedance-2.0:...,seedance-2.0-fast:...

# ===== R2 对象存储（视频文件）=====
R2_ENDPOINT=https://你的账户ID.r2.cloudflarestorage.com
R2_ACCESS_KEY=你的R2访问密钥
R2_SECRET_KEY=你的R2密钥
R2_BUCKET=nextapi-videos
R2_PUBLIC_URL=https://cdn.nextapi.top

# ===== 管理员 =====
# ADMIN_TOKEN 是后端共享 operator token，只给脚本 / cron / 紧急运维使用。
# Admin 前端通过 POST /v1/internal/admin/session 换取短时 ops_* 会话；
# 高危操作通过邮件 OTP 确认，生产必须配置 RESEND_API_KEY。
ADMIN_TOKEN=$(openssl rand -hex 32)
ADMIN_EMAILS=你的邮箱@example.com,另一个运维@example.com

# ===== Stripe（可选）=====
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# ===== PostHog =====
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxx
```

### 5.4 systemd 单元

已经在 VPS 上配好两个单元：

| 单元 | 命令 | 用途 |
|------|------|------|
| `nextapi-server.service` | `/opt/nextapi/server` | Gin HTTP server |
| `nextapi-worker.service` | `/opt/nextapi/worker` | Asynq job worker |

> Dashboard / Admin 的 `nextapi-dashboard` / `nextapi-admin` 单元已 `systemctl disable`，
> 因为前端已迁到 Cloudflare Workers。

启动 / 重启：

```bash
systemctl restart nextapi-server nextapi-worker
journalctl -u nextapi-server -f
```

### 5.5 Nginx 反代 + Let's Encrypt

`/etc/nginx/sites-available/nextapi`：

```nginx
# API 后端 — 唯一对外服务
server {
    listen 80;
    server_name api.nextapi.top;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.nextapi.top;

    ssl_certificate     /etc/letsencrypt/live/api.nextapi.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.nextapi.top/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 50m;
    }
}

# 默认 server 丢弃未知 Host，避免 SNI 滥用
server {
    listen 80 default_server;
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate     /etc/letsencrypt/live/api.nextapi.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.nextapi.top/privkey.pem;
    return 444;
}
```

证书申请（首次）：

```bash
certbot --nginx -d api.nextapi.top --non-interactive \
    --agree-tos --email admin@nextapi.top --redirect
```

certbot 会自动配置定时续期（systemd timer `certbot.timer`）。

---

## 六、第三方服务

### 6.1 上游视频 API（二选一）

#### 方案 A：Seedance 托管中继（推荐）

Seedance 托管中继负责承接我们和上游视频生成服务之间的鉴权、额度与接口适配；NextAPI 对客户只暴露 `POST /v1/videos`。

1. 通过运维交接拿到上游中继 key。
2. 只把上游中继 key 写入服务器 `.env`，不要给客户，也不要放进前端。
3. 确认上游额度 > 0，否则上游 HTTP 402 会透传给客户。
4. 后端 `.env` 写入：
   ```bash
   PROVIDER_MODE=seedance_relay
   SEEDANCE_RELAY_API_KEY=<relay-key>
   SEEDANCE_RELAY_MODEL=seedance-2.0-pro
   ```
5. 如果你在对外目录里承诺了其他 model ID，可用 `SEEDANCE_RELAY_MODEL_MAP` 自定义映射（默认已内置 `seedance-2.0` / `seedance-2.0-fast` / `seedance-1.x` 家族）
6. 冒烟：对每个对外 `model` 各发一条最小 `POST /v1/videos`，轮询 `GET /v1/videos/:id` 到 `succeeded`

完整错误码 / 字段对照见 [docs/UPSTREAM-SEEDANCE-RELAY-ZH.md](UPSTREAM-SEEDANCE-RELAY-ZH.md)。

#### 方案 B：火山引擎 Seedance（直连 Ark）

1. https://console.volcengine.com → 开通「方舟大模型平台」（Ark）
2. 创建 API Key → 写入后端 `.env` 的 **`VOLC_API_KEY`**（与代码一致）
3. 在方舟控制台记录你开通的每一个 Seedance 视频模型的 **Ark 接入点 ID**（`doubao-seedance-...`）
4. 配置 **`SEEDANCE_MODEL_MAP`**：把对外 API 目录里的每个 `model`（如 `seedance-2.0`）映射到上一步的 Ark ID；并设置 **`SEEDANCE_MODEL`** 作为客户未传 `model` 时的默认上游 ID；最后把 `PROVIDER_MODE=live`  
   详见 `docs/OPERATOR-HANDBOOK.md` 第五节「Seedance 公开模型 ID → Ark 真 ID」。

### 6.2 Cloudflare R2

1. Cloudflare Dashboard → R2 → 创建 Bucket `nextapi-videos`
2. 创建 R2 API Token（读写） → `.env`
3. 配置自定义域 `cdn.nextapi.top`

### 6.3 Stripe（可选）

- API key + Webhook 见 `.env` 配置
- Webhook URL：`https://api.nextapi.top/v1/webhooks/payments/stripe`
- 事件：`checkout.session.completed`、`invoice.paid`

### 6.4 PostHog

- https://posthog.com → 创建项目 → 复制 Project API Key → `NEXT_PUBLIC_POSTHOG_KEY`
- 同时写到 Cloudflare Workers 的 `wrangler.toml [vars]` 才能在前端生效

---

## 七、GitHub Actions 配置

仓库 Settings → Secrets：

| Secret | 值 |
|--------|-----|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers + Pages 权限） |
| `DEPLOY_HOST` | `47.76.205.108` |
| `DEPLOY_SSH_KEY` | 用于部署 Go 后端的 SSH 私钥 |

生成 SSH key：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/nextapi_deploy -N ""
ssh-copy-id -i ~/.ssh/nextapi_deploy.pub root@47.76.205.108
cat ~/.ssh/nextapi_deploy   # 复制到 GitHub Secret
```

---

## 八、上线前检查清单

- [ ] DNS 全部生效（用 `dig +short api.nextapi.top @1.1.1.1` 在非翻墙环境验证）
- [ ] `https://api.nextapi.top/v1/health` → `{"status":"ok"}`
- [ ] `https://nextapi.top` 营销页可访问，logo 正常显示
- [ ] `https://app.nextapi.top` 可注册/登录（Clerk）
- [ ] 登录后可创建 API Key（`/v1/me/keys`）
- [ ] 后端 `.env` 的 `PROVIDER_MODE` 与上游凭据匹配：
      - `seedance_relay`（推荐）：`SEEDANCE_RELAY_API_KEY`、`SEEDANCE_RELAY_MODEL`（必要时 `SEEDANCE_RELAY_MODEL_MAP`）—— 详见 [docs/UPSTREAM-SEEDANCE-RELAY-ZH.md](UPSTREAM-SEEDANCE-RELAY-ZH.md)
      - `live`：`VOLC_API_KEY`、`SEEDANCE_MODEL`、`SEEDANCE_MODEL_MAP`（覆盖所有对外公开的 `model`）已按 `docs/OPERATOR-HANDBOOK.md` 核对
- [ ] 用创建的 Key 调用 `POST /v1/videos` 成功（建议对**每一个**对外 `model` 各测一条最小请求，避免 Ark 报 `model not found`）
- [ ] `https://admin.nextapi.top` 可登录，Overview 数据从 `/v1/internal/admin/overview` 加载
- [ ] Clerk Webhook 创建用户事件能写入 DB

---

## 九、日常运维

| 操作 | 命令 |
|------|------|
| 查看后端日志 | `journalctl -u nextapi-server -f` |
| 查看 Worker 日志 | `journalctl -u nextapi-worker -f` |
| 重启后端 | `systemctl restart nextapi-server nextapi-worker` |
| 部署新后端 | 本地 `GOOS=linux GOARCH=amd64 go build -o /tmp/server ./cmd/server` → `scp` 到 `/opt/nextapi/server` → `systemctl restart nextapi-server` |
| 部署新 Dashboard | 本地 `cd apps/dashboard && pnpm build && npx opennextjs-cloudflare build && npx wrangler deploy` |
| 部署新 Admin | 本地 `cd apps/admin && pnpm build && npx opennextjs-cloudflare build && npx wrangler deploy` |
| 部署新 Marketing | 本地 `pnpm --filter @nextapi/site build && cd apps/site && npx wrangler pages deploy out` |
| 手动调整余额 | Admin UI → Credits 页，或 `POST /v1/internal/admin/credits/adjust` |
| 暂停异常组织 | Admin UI 点 Pause，或 `POST /v1/internal/admin/orgs/:id/pause` |
| Let's Encrypt 续期 | 自动（`systemctl status certbot.timer`） |

---

## 十、常见问题排查

### `https://api.nextapi.top` 浏览器报 SSL 错误
- 检查 Cloudflare DNS：`api` 必须是 **DNS only（灰云）**，否则会用 CF Edge 证书但 Origin 是自签 → "Full" 模式才能通；最稳妥就是 grey-cloud + Let's Encrypt。
- 检查 Let's Encrypt 是否已签：`ls /etc/letsencrypt/live/api.nextapi.top/`

### Dashboard / Admin 打开是 Clerk 的 `*.accounts.dev`
- 这是正常的（开发模式）。要换成自有域名，需要 Clerk Pro + 自定义域。

### Dashboard 数据是不是假的？
不是了。当前实现：
- 首页 4 个 StatCard 中 **Available credits、Active keys** 来自 `/v1/auth/me`（真实），**Jobs in last 24h** 来自 `/v1/videos?limit=10`（真实）。
- **Webhook health** 仍是占位符（`—`），等 webhook 投递统计 API 上线后接入。
- `/jobs` 列表全部走 `/v1/videos?limit=50`。
- `/webhooks` 页**整页是 PREVIEW**（页头有提示横幅），等下个版本接入 endpoint CRUD + delivery log API。

### Worker 部署后 secret 丢失
- `wrangler secret put` 一次性写入，重新 `wrangler deploy` 不会清掉，但**切到新账号 / 删 worker 再创建** 会丢，要重新 put。

---

## 需要律师审核

- `https://nextapi.top/legal/terms` — 服务条款
- `https://nextapi.top/legal/privacy` — 隐私政策
- `https://nextapi.top/legal/aup` — 可接受使用政策
- `https://nextapi.top/legal/sla` — 服务等级协议

以上都已生成 B2B 初稿，正式上线前必须过律师。
