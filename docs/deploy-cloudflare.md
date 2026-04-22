# Cloudflare Pages 部署指南

## 前置要求

1. Cloudflare 账号
2. 域名 `nextapi.top` 已添加到 Cloudflare DNS

## 方案一：GitHub Actions 自动部署（推荐）

### 设置步骤

1. 在 Cloudflare Dashboard 创建 API Token：
   - 权限：`Cloudflare Pages:Edit`
   - 获取 Account ID（在 Cloudflare Dashboard 右侧）

2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

3. 首次部署前，先在 Cloudflare Pages 创建项目：
   ```bash
   npx wrangler pages project create nextapi-site --production-branch=main
   ```

4. 在 Cloudflare Pages 项目设置中绑定自定义域名 `nextapi.top`

5. 推送到 `main` 分支即可触发自动部署

### 手动部署

```bash
pnpm --filter @nextapi/site build
npx wrangler pages deploy apps/site/out --project-name=nextapi-site
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
dash.nextapi.top A      <VPS IP>
admin.nextapi.top A     <VPS IP>
api.nextapi.top  A      <VPS IP>
```
