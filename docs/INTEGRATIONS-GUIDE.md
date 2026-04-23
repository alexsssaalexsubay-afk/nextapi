# NextAPI · 第三方对接指南（傻瓜版）

> 这份文档专门给你（老板）看，告诉你 4 件事怎么搞：
>
> 1. **Resend 邮件通知** — 5 分钟搞定，最值钱
> 2. **Grafana 监控大盘** — 10 分钟，能看到一切
> 3. **admin 双因素登录** — 5 分钟，防被盗号
> 4. **Alipay / Wechat 支付** — 暂不接，给你方案

---

## 1. Resend 邮件通知（5 分钟）

> 用处：客户提交销售线索 / 你/同事在 admin 调账 / 后台对账批量退款时，自动给你发邮件。
> 没这个，所有事故你只能等客户投诉才知道。

### 1.1 注册 Resend 拿 API Key

1. 打开 [resend.com](https://resend.com)，用你的 Gmail 注册（免费档每天 100 封够用）
2. 点 **Domains** → **Add Domain** → 输入 `nextapi.top`
3. Resend 会让你在 Cloudflare DNS 加 4 条记录（一条 SPF、两条 DKIM、一条 MX）— 复制到 Cloudflare DNS 面板贴进去
4. 等 5 分钟点 **Verify**，绿了就行
5. 进 **API Keys** → **Create API Key**，名字随便，权限选 "Full access"
6. 复制 key（`re_xxxxx`），只能看一次

### 1.2 把 key 写进服务器 .env

```bash
ssh root@47.76.205.108
cat >> /opt/nextapi/.env <<'EOF'
RESEND_API_KEY=re_粘贴你刚复制的key
NOTIFY_FROM=NextAPI Alerts <alerts@nextapi.top>
NOTIFY_TO_DEFAULT=alexsssaalexsubay@gmail.com
EOF
systemctl restart nextapi-server nextapi-worker
```

### 1.3 测试

```bash
# 在本地或 Postman 发个销售询盘到生产
curl -X POST https://api.nextapi.top/v1/sales/inquiry \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","company":"我自己","email":"a@b.com","volume":"<10k","latency":"P95<10s","message":"测试邮件"}'
```

立刻应该在你 Gmail 收到一封 `[NextAPI] sales lead — 我自己`。

### 1.4 触发邮件的 5 个事件

| 事件 | 触发时 | 用处 |
|------|--------|------|
| `[NextAPI] sales lead` | 任何人提交 `/sales/inquiry` | 12h 内回复客户 |
| `[NextAPI] org paused` | 你/同事在 admin 暂停 org | 留痕、告诉团队 |
| `[NextAPI] credits adjusted` | 任何 admin 调账 | 防止内鬼 |
| `[NextAPI] reconcile recovered N stuck jobs` | 对账批量退款 ≥5 条 | 服务异常预警 |
| (可选) webhook 投递持续失败 | 客户的 endpoint 挂了 | 主动通知客户 |

---

## 2. Grafana 监控大盘（10 分钟）

> 用处：实时看 QPS、延迟、错误率、Seedance 上游健康、worker 队列深度。

### 2.1 在服务器跑起来

```bash
ssh root@47.76.205.108

# 把 ops/ 目录同步到服务器（如果还没有）
mkdir -p /opt/nextapi/ops
# (从你本地：rsync ops/ root@47.76.205.108:/opt/nextapi/ops/  — 或 git pull)

# 给 Prometheus 设个 metrics 抓取密码
mkdir -p /opt/nextapi/ops/prometheus/secrets
PASS=$(openssl rand -hex 32)
echo -n "$PASS" > /opt/nextapi/ops/prometheus/secrets/metrics-password
chmod 600 /opt/nextapi/ops/prometheus/secrets/metrics-password

# 让后端用同一密码（覆盖之前的 IP allowlist）
sed -i '/^METRICS_/d' /opt/nextapi/.env
echo "METRICS_BASIC_AUTH=prometheus:$PASS" >> /opt/nextapi/.env
echo "GF_ADMIN_PASSWORD=$(openssl rand -hex 12)" >> /opt/nextapi/.env
systemctl restart nextapi-server

# 起观测栈
mkdir -p /opt/nextapi/ops/{grafana/data,prometheus/data}
chown -R 472:472 /opt/nextapi/ops/grafana/data
chown -R 65534:65534 /opt/nextapi/ops/prometheus/data
docker compose -f /opt/nextapi/ops/observability-compose.yml up -d

# 看是不是都起来了
docker ps | grep -E 'prometheus|grafana|exporter'

# 查 Grafana 密码记好
grep GF_ADMIN_PASSWORD /opt/nextapi/.env
```

### 2.2 从你电脑访问 Grafana（不开公网端口）

```bash
# 在你 Mac 终端跑（保持开着）
ssh -L 3000:127.0.0.1:3000 root@47.76.205.108
```

浏览器打开 [http://localhost:3000](http://localhost:3000)
- 用户名：`admin`
- 密码：`grep GF_ADMIN_PASSWORD /opt/nextapi/.env` 看到的那个

进去左侧 Dashboards → nextapi 文件夹 → "NextAPI Overview"，应该能看到：
- 请求 QPS
- p50/p95/p99 延迟
- HTTP 状态码分布
- Seedance 上游错误率
- Worker 协程数 / GC 时间

### 2.3 公网访问？建议先不要

直接把 Grafana 暴露到公网很危险（Grafana 频繁出 CVE）。要么：
- **方法 A（推荐）**：永远 SSH tunnel 用，不开公网
- **方法 B（中等）**：装 [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 把 `grafana.nextapi.top` 走 zero-trust，需要 Google 登录
- **方法 C（不推荐）**：开 nginx 反代 + Cloudflare Access — 最少 30 分钟配置

---

## 3. admin 双因素登录（5 分钟）

> 用处：admin 后台拿你的 Clerk 邮箱登录就能看所有客户、调账、暂停。
> 万一密码泄露 → 灾难。开了 TOTP 至少要拿你手机才能登。

### 3.1 在 Clerk 控制台开 MFA

1. 打开 [dashboard.clerk.com](https://dashboard.clerk.com)
2. 进你的 NextAPI 应用 → **User & Authentication** → **Multi-factor**
3. 打开三个开关：
   - ✅ **Authenticator app (TOTP)** — 用 Google Authenticator / 1Password / Authy
   - ✅ **Backup codes** — 手机丢了的救命稻草
   - ✅ **Passkey**（可选，最爽）
4. **Enforce for**：
   - 选 "specific users"，把你自己的 user ID 添加进来
   - 或者直接 "all users with role admin"（但要先在 Clerk 里给自己打 admin role）

### 3.2 登录一次自己的账号绑定

1. 打开 [https://big-vulture-6.clerk.accounts.dev/user](https://big-vulture-6.clerk.accounts.dev/user)
2. 用 Gmail 登录
3. 进 **Security** → **Two-step verification** → 扫二维码
4. **下载 8 个备份码**存到密码管理器

### 3.3 验证

打开 `https://admin.nextapi.top` 退出登录、再登录，应该会让你输 6 位验证码。
admin 后台顶部那条黄色横幅（"你的账号没开 MFA"）这时就消失了。

---

## 4. Alipay / Wechat 支付（**目前不接，原因如下**）

### 4.1 为什么暂时不接

国内支付（支付宝/微信）开通的门槛高：
- 需要**企业资质**（个体工商户也行）
- 需要**对公账户**收款
- 需要**ICP 备案**（备案号要在网站底部）
- **审核周期 1-4 周**
- 你做的是 B2B API 平台，国外客户多 → 优先接 Stripe 才对

### 4.2 走通的最短路径（如果非要做）

| 步骤 | 用时 | 说明 |
|------|------|------|
| 1. 注册公司 / 个体户 | 1-7 天 | 必须 |
| 2. 办对公账户 | 3-15 天 | 银行办 |
| 3. 工信部 ICP 备案 | 7-20 天 | nextapi.top 必须备案 |
| 4. 支付宝开放平台申请"App 支付" | 1-3 天 | [open.alipay.com](https://open.alipay.com) |
| 5. 微信支付 V3 商户号 | 3-7 天 | [pay.weixin.qq.com](https://pay.weixin.qq.com) |
| 6. 拿到 `APP_ID` / `MCH_ID` / RSA 密钥 | — | |
| 7. 写进 `.env` | 5 分钟 | 我们后端已经有 stub 在 `backend/internal/payment/{alipay,wechat}/` |
| 8. 把 stub 替换成真调用 | 我帮你做 | 给我密钥即可 |

### 4.3 我建议的阶段性路径

| 阶段 | 接什么 | 备注 |
|------|--------|------|
| **现在** | 暂不接，所有支付按钮 disabled，写 "Coming soon" | dashboard 已经这样 |
| **拿到第一个海外客户后** | Stripe（最快，需要美国/HK 公司） | 一周能跑通 |
| **拿到第一个国内客户后** | 走"线下汇款 + 手动充值" | 你在 admin /credits 手动加 |
| **国内客户 ≥10 个** | 才考虑接 Alipay/Wechat | 否则不值 |

### 4.4 临时方案：手动充值流程

客户付钱给你 → 你在 admin 后台 `/credits`：
1. 选 org
2. 输入金额（正数 = 充值）
3. 备注："2026-04-23 alipay 转账 1000元 from 张三 - 13800138000"
4. 提交 → 自动写 `credits_ledger` + `audit_log` + 发邮件给你
5. 客户余额秒到

这套现在就能用，不用任何额外开发。

---

## 5. 一份"上线后第一周"的检查清单

每天打开看一遍：

- [ ] **admin /audit** — 有没有可疑操作（自己之外的人调账？）
- [ ] **admin /attention** — 有没有积压的 job
- [ ] **Gmail 收件箱** — Resend 发的告警有没有
- [ ] **Grafana** — p99 延迟有没有突起，错误率有没有飙
- [ ] **`tail -f /var/log/auth.log`** — 有没有 SSH 暴破

每周做一次：
- [ ] 备份数据库（`docker exec nextapi-postgres-1 pg_dump -U nextapi nextapi | gzip > backup-$(date +%F).sql.gz`）
- [ ] 检查 Cloudflare 流量有没有异常
- [ ] 看 audit_log 总量、对账总量
