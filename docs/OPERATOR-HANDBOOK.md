# NextAPI 运营手册（写给总管理者）

> **零基础？** 请先读 [`BEGINNERS-GUIDE-ZH.md`](./BEGINNERS-GUIDE-ZH.md) 与 [`GLOSSARY-ZH.md`](./GLOSSARY-ZH.md)；本文假设你会用 SSH 和简单命令行。  
> 文档总目录：[`docs/README.md`](./README.md)。

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
部署前请对照仓库里**实际文件列表**执行到最新编号：

| 编号 | 内容 |
|------|------|
| 00001_init | 用户/订单/视频基础表 |
| 00002_auth | API Key 表 |
| 00003_jobs | 异步任务流水线 |
| 00004_webhooks | 事件投递与重试 |
| 00005_b2b_gateway | 计费 ledger / spend cap / IP 白名单字段 |
| 00006_procurement | 采购合规字段 |
| 00007_queue_tiering | 队列分级 |
| 00008_hardening | 审计日志 / Clerk webhook 去重 / 支付 webhook 去重 / 加速索引 |
| 00009_sales_leads | 销售线索等 |
| **00010_admin_sessions** | **管理后台 `ops_*` 会话、OTP 相关表（若你拉过该迁移）** |

### 1.2 SQL 不会自动执行

**重要**：这些 SQL 文件**不会自己跑**。要么你手动执行，要么部署脚本里调 `make migrate`。

### 1.3 怎么在生产服务器执行（傻瓜版）

SSH 上服务器（生产 IP / 凭据存于 1Password / Vault，**不要写进任何文件、不要发聊天**）：

```bash
ssh root@<PROD_HOST>
# 凭据见密码管理器条目 "nextapi-prod-ssh"
```

> ⚠️ **如果这份文档曾经被推到公开仓库**：立即在控制台轮换 root 密码、改用 SSH key-only 登录（`PasswordAuthentication no`），并审计 `last`、`/var/log/auth.log` 是否有可疑登录。

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

# ===== 上游视频提供方 =====
# PROVIDER_MODE 决定 POST /v1/videos 走哪条路：
#   mock    —— 进程内假 Provider（默认；本地/CI 用）
#   live    —— 火山方舟 Ark 直连（需要 VOLC_API_KEY）
#   uptoken —— UpToken 代跑 (https://uptoken.cc)（需要 UPTOKEN_API_KEY）
PROVIDER_MODE=uptoken

# ---- 方案 A：UpToken 代跑（推荐：开箱即用，不需要方舟账号） ----
# 到 https://uptoken.cc/login 登录 → 左侧 API Keys → 新建一把 ut- 开头的 key
UPTOKEN_API_KEY=ut-...                      # 上游给我们的预留 key
UPTOKEN_BASE_URL=https://uptoken.cc/v1      # 默认即可；上游切换时才改
UPTOKEN_MODEL=seedance-2.0-pro              # 客户未传 model 时的兜底
# 可选：把 NextAPI 目录里对外的 model 映射到 UpToken 真实模型 ID。
# 默认已内置 seedance-2.0→seedance-2.0-pro、seedance-2.0-fast 透传、seedance-1.x 家族→2.0-pro/fast
# UPTOKEN_MODEL_MAP=seedance-2.0:seedance-2.0-pro,seedance-2.0-fast:seedance-2.0-fast

# ---- 方案 B：方舟 Ark 直连 ----
VOLC_API_KEY=...                    # 方舟控制台创建的 API Key（与代码读取的变量名一致）
# 客户请求里未传 model 时，上游默认使用的 Ark 模型 ID（须是你控制台已开通的接入点）
SEEDANCE_MODEL=doubao-seedance-1-5-pro-251215
# 可选：仅当你不用北京接入点时才改
# SEEDANCE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
# 必配：见下文「Seedance 公开模型 ID → Ark 真 ID」——把目录里每个对外 model 映射到控制台里的 doubao-seedance-*
SEEDANCE_MODEL_MAP=seedance-2.0:你的2.0标准ID,seedance-2.0-fast:你的2.0快速ID

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

### Seedance 公开模型 ID → Ark 真 ID（上线前必核对）

客户在 `POST /v1/videos` 里传的 `model` 是 **NextAPI 目录 ID**（如 `seedance-2.0`、`seedance-1.0-lite`）。网关会把它换成火山 **方舟控制台里显示的接入点模型名**（形如 `doubao-seedance-*-YYMMDD`）再调 `POST .../contents/generations/tasks`。

- **代码里只内置了两条「已对照文档写死」的映射**：`seedance-1.0-pro`、`seedance-1.5-pro`。其余公开 ID **不会瞎猜**，避免写错 ID 导致计费/路由异常。
- **你必须**在部署环境配置 `SEEDANCE_MODEL_MAP`，把你在营销/控制台里承诺给客户的每一个 `model` 都映射到当前账号里**真实开通**的 Ark ID。格式为逗号分隔的 `公开ID:ArkID`，例如：

```bash
export SEEDANCE_MODEL_MAP="seedance-2.0:doubao-seedance-2-0-pro-YYYYMMDD,seedance-2.0-fast:doubao-seedance-2-0-fast-YYYYMMDD,seedance-1.0-pro-fast:doubao-seedance-1-0-pro-fast-YYYYMMDD,seedance-1.0-lite:doubao-seedance-1-0-lite-YYYYMMDD"
```

（把 `YYYYMMDD` 换成你控制台里复制的完整字符串。）

**怎么拿 Ark ID**：登录 [火山引擎控制台](https://console.volcengine.com) → 方舟大模型平台 → 推理 / 模型接入点，找到已开通的 Seedance 视频模型，复制 **Endpoint 或模型 ID** 一栏的完整名称。

**上线前自检**：对每个对外 `model` 各发一条最小 `POST /v1/videos`（或 staging 环境），确认返回 2xx 且任务能跑完；若 Ark 报 `model not found`，多半是 `SEEDANCE_MODEL_MAP` 缺项或 ID 复制不全。

官方接口说明索引：[火山方舟文档](https://www.volcengine.com/docs/82379)（视频生成 API / 创建视频生成任务）。

### UpToken 模式（`PROVIDER_MODE=uptoken`）速查

UpToken 是一个上游代跑网关（[uptoken.cc](https://uptoken.cc)），替你打通方舟合规、渠道、计费等杂事，开箱即用。接入后所有 `POST /v1/videos` 会被网关翻译成：

```
POST https://uptoken.cc/v1/video/generations
Authorization: Bearer ut-...
```

1. **取 key**：登录 [uptoken.cc/login](https://uptoken.cc/login) → 左侧 **API Keys** → 新建，复制以 `ut-` 开头的完整字符串。
2. **充值 / 确认余额**：右上角 `BALANCE` 一栏必须 > 0，否则上游会以 HTTP 402 回拒；我们会把 402 透传给客户。
3. **配 env**：写入 `UPTOKEN_API_KEY`，并把 `PROVIDER_MODE=uptoken`。`UPTOKEN_MODEL` 留空时默认 `seedance-2.0-pro`。
4. **模型映射**：上游目前暴露三个 ID：
   - `seedance-2.0-pro`（主推，最高 15s/720p）
   - `seedance-2.0-fast`（快速档，15s/720p）
   - `seedream-5.0-lite`（图像生成，暂未接入 `/v1/videos`）

   我们内置了公开 ID → UpToken ID 的映射（seedance-2.0→pro、seedance-2.0-fast→fast、1.x 家族就近回落），需要覆盖时用 `UPTOKEN_MODEL_MAP="a:b,c:d"`。
5. **预留 key 来源**：如果是上游（UpToken 官方）给我们的合作 key，直接塞进 `UPTOKEN_API_KEY` 即可，不需要额外改代码。
6. **冒烟**：上线后对每个对外 `model` 各发一条最小 `POST /v1/videos`；查 `GET /v1/videos/:id` 轮询到 `succeeded`，说明端到端链路通了。
7. **错误码**：UpToken 统一用 `error-1xx/2xx/3xx/4xx/5xx/6xx/7xx`，网关按 HTTP code 透传，客户侧建议按前缀分类重试（`error-5xx` 限流可等待重试，`error-2xx` 参数类不要重试）。完整映射见 [docs/UPSTREAM-UPTOKEN-ZH.md](UPSTREAM-UPTOKEN-ZH.md)。

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
