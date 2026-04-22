# NextAPI 部署上线操作指南

> 本文档列出把 NextAPI 从代码变成可运营产品需要**你手动操作**的所有步骤。
> 代码层面的工作已经全部完成。以下是需要你在各个平台上配置的事情。

---

## 一、域名 DNS 配置

你的域名：`nextapi.top`

在域名管理后台（Cloudflare / 阿里云 DNS）添加以下记录：

| 类型 | 名称 | 值 | 用途 |
|------|------|-----|------|
| A | `api` | `你的阿里云 HK VPS IP` | Go 后端 API |
| A | `dash` | `你的阿里云 HK VPS IP` | 用户 Dashboard |
| A | `admin` | `你的阿里云 HK VPS IP` | 管理员后台 |
| CNAME | `@` (根域) | Cloudflare Pages 提供的域名 | 营销官网 |

> Cloudflare Pages 的 CNAME 值会在步骤三中得到。

---

## 二、Clerk 认证配置

1. 登录 https://dashboard.clerk.com
2. 创建一个新 Application（或使用已有的）
3. 获取以下密钥：

| 变量名 | 从哪里获取 |
|--------|-----------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys |
| `CLERK_WEBHOOK_SECRET` | 下面步骤 4 获取 |

4. 配置 Clerk Webhook：
   - 进入 Clerk Dashboard → Webhooks
   - 点 "Add Endpoint"
   - URL 填：`https://api.nextapi.top/v1/webhooks/clerk`
   - 选择事件：`user.created`、`user.updated`、`user.deleted`
   - 创建后复制 Signing Secret → 这就是 `CLERK_WEBHOOK_SECRET`

---

## 三、Cloudflare Pages 部署（营销官网）

方法一：GitHub 自动部署（推荐）

1. 登录 Cloudflare Dashboard → Pages
2. 点 "Create a project" → "Connect to Git"
3. 选你的 GitHub 仓库 `nextapi`
4. 配置构建：
   - **Build command**: `pnpm --filter @nextapi/site build`
   - **Build output directory**: `apps/site/out`
   - **Root directory**: `/`（留空即可）
   - **环境变量**: `NODE_VERSION` = `20`
5. 点 Deploy
6. 部署成功后，进入 Custom Domains → 添加 `nextapi.top`
7. 按照提示配置 DNS CNAME 记录（步骤一中的根域记录）

方法二：GitHub Actions（已配置好）

1. 进入 GitHub 仓库 → Settings → Secrets
2. 添加两个 Secret：
   - `CLOUDFLARE_ACCOUNT_ID` — 从 Cloudflare Dashboard 右侧栏获取
   - `CLOUDFLARE_API_TOKEN` — 从 Cloudflare → My Profile → API Tokens → 创建 Token（选 "Edit Cloudflare Workers" 模板）
3. 推送代码到 `main` 分支会自动触发部署

---

## 四、VPS 配置（阿里云 HK）

### 4.1 安装基础软件

```bash
# SSH 登录你的 VPS
ssh root@你的VPS_IP

# 安装 Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

# 安装 Nginx + Certbot
apt install -y nginx certbot python3-certbot-nginx
```

### 4.2 申请 SSL 证书

```bash
# 确保 DNS 已经指向这台 VPS，然后运行：
certbot --nginx -d api.nextapi.top -d dash.nextapi.top -d admin.nextapi.top
```

### 4.3 创建环境变量文件

在 VPS 上创建 `/opt/nextapi/.env`：

```bash
mkdir -p /opt/nextapi
cat > /opt/nextapi/.env << 'EOF'
# ===== 数据库 =====
DATABASE_URL=postgres://nextapi:你设置的密码@localhost:5432/nextapi?sslmode=disable

# ===== Redis =====
REDIS_ADDR=localhost:6379

# ===== 服务器 =====
SERVER_ADDR=:8080

# ===== Clerk 认证 =====
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
CLERK_SECRET_KEY=sk_live_xxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxx

# ===== Seedance / 火山引擎 =====
VOLC_ARK_API_KEY=你的火山引擎API密钥

# ===== R2 对象存储（视频文件）=====
R2_ENDPOINT=https://你的账户ID.r2.cloudflarestorage.com
R2_ACCESS_KEY=你的R2访问密钥
R2_SECRET_KEY=你的R2密钥
R2_BUCKET=nextapi-videos
R2_PUBLIC_URL=https://cdn.nextapi.top

# ===== 管理员 =====
ADMIN_TOKEN=生成一个强随机字符串至少32字符
ADMIN_EMAILS=你的邮箱@example.com

# ===== Stripe（可选，支付用）=====
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# ===== PostHog（可选，追踪用）=====
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxx
EOF
```

> 生成强随机 ADMIN_TOKEN：`openssl rand -hex 32`

### 4.4 启动服务

```bash
cd /opt/nextapi

# 启动 PostgreSQL + Redis
docker compose up -d postgres redis

# 运行数据库迁移
./nextapi migrate up

# 启动 Go 后端
./nextapi server &

# 启动 Worker
./nextapi worker &
```

### 4.5 配置 Nginx 反向代理

创建 `/etc/nginx/sites-available/nextapi`：

```nginx
# API 后端
server {
    server_name api.nextapi.top;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    listen 443 ssl;
    # certbot 会自动填充 SSL 配置
}

# Dashboard
server {
    server_name dash.nextapi.top;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    listen 443 ssl;
}

# Admin
server {
    server_name admin.nextapi.top;
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    listen 443 ssl;
}
```

```bash
ln -s /etc/nginx/sites-available/nextapi /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 五、第三方服务配置

### 5.1 火山引擎 Seedance API

1. 登录 https://console.volcengine.com
2. 开通"方舟大模型平台"（Ark）
3. 创建 API Key → 填入 `.env` 的 `VOLC_ARK_API_KEY`

### 5.2 Cloudflare R2（视频存储）

1. Cloudflare Dashboard → R2
2. 创建 Bucket：名称 `nextapi-videos`
3. 创建 API Token（R2 读写权限）→ 填入 `.env`
4. 可选：配置自定义域名 `cdn.nextapi.top` 指向该 Bucket

### 5.3 Stripe（支付，可选）

1. 登录 https://dashboard.stripe.com
2. Developers → API Keys → 复制 Secret Key → 填入 `.env`
3. Developers → Webhooks → 添加端点：
   - URL：`https://api.nextapi.top/v1/webhooks/payments/stripe`
   - 事件：`checkout.session.completed`、`invoice.paid`
4. 复制 Webhook Signing Secret → 填入 `.env`

### 5.4 PostHog（用户追踪，可选）

1. 登录 https://posthog.com
2. 创建项目
3. 复制 Project API Key → 填入 `.env` 的 `NEXT_PUBLIC_POSTHOG_KEY`

---

## 六、GitHub 配置

### 6.1 GitHub Actions Secrets

进入 GitHub 仓库 → Settings → Secrets and variables → Actions，添加：

| Secret 名称 | 值 |
|-------------|-----|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `DEPLOY_HOST` | VPS IP 地址 |
| `DEPLOY_SSH_KEY` | SSH 私钥（用于部署到 VPS）|

### 6.2 生成部署 SSH Key

```bash
# 在本地电脑上
ssh-keygen -t ed25519 -f ~/.ssh/nextapi_deploy -N ""

# 把公钥添加到 VPS
ssh-copy-id -i ~/.ssh/nextapi_deploy.pub root@你的VPS_IP

# 把私钥内容复制为 GitHub Secret DEPLOY_SSH_KEY
cat ~/.ssh/nextapi_deploy
```

---

## 七、Dashboard 和 Admin 环境变量

在 VPS 上启动 Dashboard 和 Admin 时需要以下环境变量：

```bash
# Dashboard (apps/dashboard)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
CLERK_SECRET_KEY=sk_live_xxxxx
NEXT_PUBLIC_API_URL=https://api.nextapi.top

# Admin (apps/admin)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
CLERK_SECRET_KEY=sk_live_xxxxx
NEXT_PUBLIC_API_URL=https://api.nextapi.top
```

启动命令：

```bash
# 在 VPS 上编译并启动
cd /opt/nextapi/apps/dashboard
pnpm build
PORT=3001 pnpm start &

cd /opt/nextapi/apps/admin
pnpm build
PORT=3002 pnpm start &
```

---

## 八、上线前检查清单

- [ ] DNS 记录全部生效（`dig api.nextapi.top`、`dig dash.nextapi.top` 等）
- [ ] SSL 证书正常（浏览器打开各域名无证书警告）
- [ ] `https://api.nextapi.top/health` 返回 `{"status":"ok"}`
- [ ] `https://nextapi.top` 营销官网正常加载
- [ ] `https://dash.nextapi.top` 可以注册/登录（Clerk）
- [ ] 登录后可以创建 API Key
- [ ] 用创建的 Key 调用 API 成功
- [ ] `https://admin.nextapi.top` 可以登录，看到 Overview 数据
- [ ] Webhook 端点可以接收 Clerk 事件（创建新用户测试）

---

## 九、日常运维

| 操作 | 命令 |
|------|------|
| 查看后端日志 | `journalctl -u nextapi-server -f` |
| 查看 Worker 日志 | `journalctl -u nextapi-worker -f` |
| 重启后端 | `systemctl restart nextapi-server` |
| 手动调整用户余额 | 在 Admin 后台 → Credits 页面操作，或 API: `POST /v1/internal/admin/credits/adjust` |
| 暂停异常组织 | Admin 后台 → 点击 Pause，或 API: `POST /v1/internal/admin/orgs/:id/pause` |

---

## 需要律师审核的内容

以下页面已有初稿，上线前需要律师审核：

- `https://nextapi.top/legal/terms` — 服务条款
- `https://nextapi.top/legal/privacy` — 隐私政策
- `https://nextapi.top/legal/aup` — 可接受使用政策
- `https://nextapi.top/legal/sla` — 服务等级协议

---

## 架构总览

```
用户浏览器
    │
    ├── nextapi.top (Cloudflare Pages, 静态)
    │       营销官网 / 文档 / 定价 / Enterprise / Legal
    │
    ├── dash.nextapi.top (VPS, Next.js SSR, port 3001)
    │       用户 Dashboard → Clerk 登录 → 管理 API Key / 查看用量
    │
    ├── admin.nextapi.top (VPS, Next.js SSR, port 3002)
    │       管理员后台 → Clerk 登录 → 管理用户/组织/余额
    │
    └── api.nextapi.top (VPS, Go, port 8080)
            REST API ← Nginx 反向代理 (HTTPS)
            ├── /v1/videos/* ← 视频生成（sk_* key 认证）
            ├── /v1/keys/* ← API Key 管理
            ├── /v1/billing/* ← 计费
            ├── /v1/webhooks/* ← Webhook 管理
            ├── /v1/internal/admin/* ← 管理员 API（X-Admin-Token）
            └── Worker (Asynq) ← 异步视频生成 + 轮询 + Webhook 投递

数据存储：
    PostgreSQL 16 ← 用户/组织/Key/Job/视频/账单/Webhook
    Redis 7 ← 限频/缓存/Asynq队列/在途负债追踪
    Cloudflare R2 ← 生成的视频文件
```
