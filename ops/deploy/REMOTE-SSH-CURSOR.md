# Cursor「Connect via SSH」+ 本仓库部署

## 这个功能实际在做什么

**Connect via SSH** 会把 Cursor 的工作区挂到你的 VPS 上（例如打开 `/opt/nextapi`）。之后你在**这个远程窗口**里开的终端、以及 Agent 运行的命令，才会在**服务器本机**执行。

AI **不能**替你点连接、也不能用你的密码自动登录；需要你在本机 Cursor 里完成一次 SSH 配置（密钥登录推荐），然后 **Remote-SSH → Open Folder → `/opt/nextapi`**。

## 推荐流程

1. **本机**：配置 `~/.ssh/config` 里 `Host nextapi-vps`（`HostName`、`User`、可选 `IdentityFile`）。不要用密码长期运维；若密码曾在聊天里泄露过，先在云厂商控制台改 root/业务账号密码。
2. **Cursor**：Command Palette → **Remote-SSH: Connect to Host** → 选你的 Host → 打开文件夹 `/opt/nextapi`（或你实际 clone 的路径）。
3. **远程工作区**：把环境文件准备好：
   ```bash
   cp ops/deploy/production.env.template .env
   chmod 600 .env
   nano .env
   ```
4. **部署**（与 `ops/deploy/README.md` 一致）：
   ```bash
   git pull --ff-only
   ./ops/deploy/deploy.sh
   ```

若你只改配置、不更新镜像，可：

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate backend worker
```

## 安全提醒

- **永远不要把** root 密码、API Key、`.env` 全文贴进聊天。
- 仓库里只保留 `production.env.template` 这类**占位模板**；真实 `.env` 仅在服务器上、且已在 `.gitignore` 中。
