# NextAPI 运营手册（写给总管理者）

> 这份文档专门写给"网站老板/总管理者"，不是给开发者看的。
> 重点回答三件事：
>
> 1. 我新加的 SQL 文件怎么跑到生产数据库？
> 2. 我作为老板，每天在哪看数据、做操作？
> 3. 出事了怎么应急？

---

## 一、SQL 迁移：怎么从代码变成线上表

### 1.1 现在仓库里的迁移文件

`backend/migrations/` 下面所有 `0000X_xxx.sql` 都是数据库变更脚本，按编号顺序执行。
最新的是 `00008_hardening.sql`（这次新增的）：

| 编号 | 内容 |
|------|------|
| 00001_init | 用户/订单/视频基础表 |
| 00002_auth | API Key 表 |
| 00003_jobs | 异步任务流水线 |
| 00004_webhooks | 事件投递与重试 |
| 00005_b2b_gateway | 计费 ledger / spend cap / IP 白名单字段 |
| 00006_procurement | 采购合规字段 |
| 00007_queue_tiering | 队列分级 |
| **00008_hardening** | **新增：审计日志 / Clerk webhook 去重 / 支付 webhook 去重 / 加速索引** |

### 1.2 SQL 不会自动执行

**重要**：这些 SQL 文件**不会自己跑**。要么你手动执行，要么部署脚本里调 `make migrate`。

### 1.3 怎么在生产服务器执行（傻瓜版）

SSH 上服务器（你之前给我的是 `47.76.205.108`）：

```bash
ssh root@47.76.205.108
# 密码：<REDACTED-ROTATE-IMMEDIATELY>
```

然后：

```bash
# 进项目目录
cd ~/nextapi-v3/backend

# 拉最新代码
git pull origin main

# 看下有没有装 goose
which goose || go install github.com/pressly/goose/v3/cmd/goose@latest

# 跑迁移（已经执行过的 SQL goose 会自动跳过）
export DATABASE_URL="postgres://nextapi:你的密码@127.0.0.1:5432/nextapi?sslmode=disable"
goose -dir migrations postgres "$DATABASE_URL" up

# 看版本
goose -dir migrations postgres "$DATABASE_URL" status
```

最后一步 `status` 会列每个文件是 `Applied` 还是 `Pending`。

### 1.4 怎么看 SQL 跑的结果

```bash
# 进 postgres
docker exec -it nextapi-postgres psql -U nextapi -d nextapi

# 看新增的表存不存在
\dt audit_log
\dt clerk_webhook_seen
\dt payment_webhook_seen

# 看记录数
SELECT count(*) FROM audit_log;
SELECT count(*) FROM clerk_webhook_seen;

# 退出
\q
```

### 1.5 出错了怎么回滚

```bash
goose -dir migrations postgres "$DATABASE_URL" down   # 回退一个版本
```

⚠️ 千万别在生产用 `down` 除非数据可以丢，因为 `DROP TABLE` 会带走数据。

---

## 二、你作为总管理者，每天在哪看数据？

### 2.1 三个网站的分工

| 网址 | 用途 | 谁能看 |
|------|------|--------|
| `https://nextapi.top` | 营销官网 | 全世界 |
| `https://app.nextapi.top` | 用户后台（自己的 key、账单、任务） | 任何登录用户 |
| **`https://admin.nextapi.top`** | **总管理者后台** | **你 + 加到 `ADMIN_EMAILS` 白名单的人** |

你看数据 → **永远是 `admin.nextapi.top`**。

### 2.2 admin 后台你能看到的页面

打开 `admin.nextapi.top` 用 Clerk 登录后（你的邮箱必须在 `ADMIN_EMAILS` 里）：

| 页面 | 路径 | 你能干什么 |
|------|------|-----------|
| **Overview** | `/` | 今日总用量、活跃 org 数、待关注的事 |
| **Users** | `/users` | 全部注册用户、关联 org |
| **Orgs** | `/orgs` | 全部组织、可暂停/恢复、改信用额度、改吞吐量 |
| **Jobs** | `/jobs` | 所有视频任务、可强制取消、看上游错误 |
| **Credits** | `/credits` | 给某个 org 充值/扣款（手动调账） |
| **Attention** | `/attention` | 异常事件清单（卡住的任务、可疑充值、moderation 拒批） |
| **Audit Log** | `/audit` | **所有管理员操作的留痕（暂停/调账/取消/审核），现在已经接通真实表** |
| **Incidents** | `/incidents` | 事故记录 |

### 2.3 关键场景：你最常用的 4 个动作

#### A. 客户欠费 → 暂停其 org

1. `/orgs` 找到 org
2. 点 "Pause"，写原因
3. 这个 org 所有 API 调用立刻 402

#### B. 客户客诉 → 退款

1. `/credits`
2. 选 org，输入正数（充值）或负数（扣回）
3. 必填备注 — 会写进 `audit_log`，谁都能查到是你操作的

#### C. 任务卡住 → 强制取消

1. `/jobs` 搜任务 ID
2. 点 "Cancel"
3. 系统自动退预扣的额度 + 发 `job.failed` webhook 给客户

#### D. 看谁动过手脚

1. `/audit`
2. 默认显示最近 200 条管理员写操作
3. 可以按 action 筛选（`credits.adjust`、`org.pause` 等）

### 2.4 数据库直查（紧急情况兜底）

万一 admin UI 出问题，你也可以直接进数据库：

```bash
ssh root@47.76.205.108
docker exec -it nextapi-postgres psql -U nextapi -d nextapi

-- 今天有多少新注册
SELECT count(*) FROM users WHERE created_at > current_date;

-- 今天总收入（分）
SELECT sum(delta_cents) FROM credits_ledger
  WHERE reason = 'topup' AND created_at > current_date;

-- 哪些 org 余额最低
SELECT org_id, balance_credits FROM org_balances
  ORDER BY balance_credits ASC LIMIT 20;

-- 最近 50 条管理员操作
SELECT created_at, actor_email, action, target_type, target_id
  FROM audit_log ORDER BY created_at DESC LIMIT 50;
```

---

## 三、Prometheus / Grafana — 实时监控大盘

### 3.1 在哪

后端有 `/metrics` 端点（Prometheus 格式）。这个端点**不再用 ADMIN_TOKEN 鉴权**了（这是这次的修复 E4），改成：

| 方式 | 怎么开 |
|------|--------|
| Basic Auth | `export METRICS_BASIC_AUTH="prometheus:超长密码"` |
| IP 白名单 | `export METRICS_IP_ALLOWLIST="10.0.0.0/8,127.0.0.1"` |

任选其一。Grafana / Prometheus 抓数据时按这个走。

### 3.2 关键指标（你以后要让 SRE 帮你做面板）

```
http_requests_total                # 接口 QPS
http_request_duration_seconds      # P50/P95/P99 延迟
nextapi_jobs_total{status="..."}   # 任务成功/失败率
nextapi_provider_errors_total       # Seedance 上游错误
go_goroutines                       # 后端协程数（突增=泄漏）
```

---

## 四、出事应急清单

### 4.1 网站打不开

```bash
# 1. 看 API 服务还活着吗
curl https://api.nextapi.top/health

# 2. 看 docker 容器
ssh root@47.76.205.108 "docker ps"

# 3. 看后端日志
ssh root@47.76.205.108 "journalctl -u nextapi-server -n 200 --no-pager"
```

### 4.2 任务全部卡住

```bash
# 看 Redis / asynq
ssh root@47.76.205.108 "docker exec nextapi-redis redis-cli LLEN asynq:queues:critical"

# 看 worker
ssh root@47.76.205.108 "journalctl -u nextapi-worker -n 200 --no-pager"
```

新加的对账服务每 10 分钟会自动把超过 1 小时还没结果的任务标记为失败 + 退款 + 发 webhook，
所以即使你一晚上没看，第二天客户的余额也是对的。

### 4.3 Seedance 上游崩了

后端有断路器（这次新加的 S1）：
连续 6 次失败就熔断 30 秒。客户会收到清晰的 503，而不是被卡住。
熔断状态可以在 `/metrics` 里看到 `nextapi_provider_circuit_state`。

### 4.4 收到 Stripe / 支付 webhook 重复扣款投诉

新加的 `payment_webhook_seen` 表会按 `provider+event_id` 去重，
即使 Stripe 重发 100 遍也只生效一次。

如果还是投诉重复，直接查：

```sql
SELECT * FROM payment_webhook_seen
 WHERE event_id = 'evt_xxx';
SELECT * FROM credits_ledger
 WHERE note LIKE '%evt_xxx%';
```

---

## 五、必须配的环境变量清单

部署服务器上 `~/nextapi-v3/backend/.env`（或者 systemd 的 EnvironmentFile）：

```bash
# ===== 数据库 =====
DATABASE_URL=postgres://nextapi:...@127.0.0.1:5432/nextapi?sslmode=disable
REDIS_ADDR=127.0.0.1:6379

# ===== Seedance =====
VOLC_API_KEY=...
PROVIDER=seedance

# ===== Clerk（用户登录） =====
CLERK_ISSUER=https://你的clerk frontend api  # 缺这个 dashboard 进不去
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# ===== 管理后台 =====
ADMIN_TOKEN=非常长的随机字符串              # admin Worker 调后端用
ADMIN_EMAILS=you@nextapi.top,partner@xxx.com  # 谁能进 admin

# ===== /metrics 鉴权（这次新加） =====
METRICS_BASIC_AUTH=prometheus:超长密码
# 或
METRICS_IP_ALLOWLIST=10.0.0.0/8

# ===== 反滥用（这次新加） =====
TURNSTILE_SECRET_KEY=...                    # Cloudflare Turnstile，没配就关闭 captcha
TURNSTILE_BYPASS_TOKEN=tests-only-token-长且保密  # 给我们自己的 e2e 用

# ===== Key 上限（这次新加） =====
MAX_KEYS_PER_ORG=25                         # 单 org 最多活跃 key 数

# ===== 支付 =====
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
ALIPAY_APP_ID=...
WECHAT_MCH_ID=...
```

---

## 六、这一轮升级你要做的 3 件事

| # | 步骤 | 命令 |
|---|------|------|
| 1 | 拉最新代码 | `cd ~/nextapi-v3 && git pull origin main` |
| 2 | 跑数据库迁移 | `cd backend && goose -dir migrations postgres "$DATABASE_URL" up` |
| 3 | 重启服务 | `systemctl restart nextapi-server nextapi-worker` |

完事后访问 `https://admin.nextapi.top/audit` 应该看到一个空表（还没人操作过），
做一次 "Pause Org" 测试，刷新就该出现一行。

---

## 附录：技术债 / 后续要做的

- [ ] 邮件通知（暂停/调账/对账触发时给你发邮件）
- [ ] 双因素认证（admin 登录强制 TOTP）
- [ ] 公开 status page（`status.nextapi.top` 还没真接探针）
- [ ] Grafana 大盘（指标已经出，但 dashboard JSON 还没写）
- [ ] 财务月报导出（按 org 出账单 CSV）

这些不影响"能用"，但影响"专业感"。
