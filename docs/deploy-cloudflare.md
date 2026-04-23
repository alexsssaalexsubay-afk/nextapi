# Cloudflare 部署指南

## 前置要求

1. Cloudflare 账号
2. 域名 `nextapi.top` 已添加到 Cloudflare DNS

## 我们约定的部署方式

- `nextapi.top`：Cloudflare Pages，部署 `apps/site` 的静态导出
- `app.nextapi.top`：Cloudflare Workers，部署 `apps/dashboard` 的 SSR 应用
- `admin.nextapi.top`：Cloudflare Workers，部署 `apps/admin` 的 SSR 应用
- `api.nextapi.top`：阿里云 HK VPS，运行 Go API 与 worker
- 对象存储：Cloudflare R2

## 方案一：GitHub Actions 自动部署（推荐）

### 设置步骤

1. 在 Cloudflare Dashboard 创建 API Token：
   - 权限：`Cloudflare Pages:Edit`、`Workers Scripts:Edit`
   - 获取 Account ID（在 Cloudflare Dashboard 右侧）

2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

3. 首次部署前，先创建静态站点的 Pages 项目：
   ```bash
   npx wrangler pages project create nextapi-site --production-branch=main
   ```

4. 绑定自定义域名：
   - `nextapi.top` -> `nextapi-site.pages.dev`
   - `app.nextapi.top` -> `nextapi-dashboard`
   - `admin.nextapi.top` -> `nextapi-admin`

5. 推送到 `main` 分支即可触发自动部署

### 手动部署

```bash
pnpm --filter @nextapi/site build
npx wrangler pages deploy apps/site/out --project-name=nextapi-site

pnpm --filter @nextapi/dashboard deploy
pnpm --filter @nextapi/admin deploy
```

## 方案二：Cloudflare Dashboard 直连 GitHub

1. 在 Cloudflare Pages → Create a project → Connect to Git
2. 选择 GitHub 仓库
3. 配置：
   - Framework preset: None
   - Build command: `pnpm install && pnpm --filter @nextapi/site build`
   - Build output directory: `apps/site/out`
   - Root directory: `/`（留空）
4. 绑定域名 `nextapi.top`

## DNS 配置

```
nextapi.top      CNAME  nextapi-site.pages.dev
app.nextapi.top  CNAME  <dashboard-worker-subdomain>
admin.nextapi.top CNAME <admin-worker-subdomain>
api.nextapi.top  A      <VPS IP>
```
