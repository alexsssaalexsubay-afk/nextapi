---
sidebar_position: 10
title: 运营与平台管理
description: NextAPI 的重试策略、任务生命周期、批量任务、请求日志、死信队列和限流管理。
---

# 运营与平台管理

NextAPI 专为小团队高可信度运营而设计。本文档涵盖平台运营人员可用的所有运行时控制面板——从任务生命周期管理到限流策略和可观测性。

---

## 任务生命周期

每个视频生成请求都遵循严格的状态机流程：

```
queued（排队）→ submitting（提交中）→ running（运行中）→ succeeded（成功）
                            ↘ retrying（重试中）→ submitting（循环）
                                          ↘ failed / timed_out
               ↘ failed（失败）
               ↘ canceled（已取消）
```

| 状态 | 含义 |
|------|------|
| `queued` | 任务已创建，等待 Worker 处理 |
| `submitting` | Worker 正在调用 Provider API |
| `running` | Provider 已接受任务，Worker 轮询结果中 |
| `retrying` | 出现可重试错误，等待下次尝试 |
| `succeeded` | 视频已生成，积分已结算，Webhook 已推送 |
| `failed` | 永久失败，积分已退款 |
| `timed_out` | Provider 在轮询窗口内未响应 |
| `canceled` | 运营人员通过管理 API 取消 |

### 状态转换时间戳

每个任务行都记录重要生命周期事件的时间戳：

| 字段 | 记录时机 |
|------|----------|
| `created_at` | 任务行插入时 |
| `submitting_at` | Worker 发起 Provider 调用时 |
| `running_at` | Provider 接受任务时 |
| `retrying_at` | 重试尝试安排时 |
| `timed_out_at` | 超时阈值超出时 |
| `canceled_at` | 运营人员发出取消操作时 |
| `completed_at` | 到达终态（成功/失败/超时/取消）时 |

---

## 重试策略

NextAPI 在 Asynq 任务队列之上实现了应用级重试。

### 可重试条件

以下错误会触发自动重试：

- 网络错误（DNS、连接拒绝、连接重置）
- 请求超时 / 上下文截止时间超出
- Provider 返回 HTTP `429`（频率超限）
- Provider 返回 HTTP `5xx`（500、502、503、504）

### 不可重试条件

以下错误立即失败，不进行重试：

- 无效请求负载（Provider 返回 `400`）
- 鉴权失败（`401`、`403`）
- Provider 内容策略违规

### 退避时间表

```
第 1 次 → 2秒 ± 30% 抖动
第 2 次 → 4秒 ± 30% 抖动
第 3 次 → 8秒 ± 30% 抖动
第 4 次 → 16秒 ± 30% 抖动
第 5 次 → 32秒 ± 30% 抖动（最后一次）
```

最大延迟上限为 60 秒。5 次尝试均失败后，任务转为 `failed` 并归档至死信队列。

### 任务上的重试元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `retry_count` | int | 已尝试次数 |
| `last_error_code` | text | 最后一次尝试的错误码 |
| `last_error_msg` | text | 最后一次尝试的错误信息 |

---

## 批量任务

**批量任务（Batch Run）** 将多个视频生成任务组合在一起提交。适用于从 CSV 清单或自动化工作流提交 10 个以上镜头的场景。

### 创建批量任务

```http
POST /v1/batch/runs
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "name": "第一集开场镜头",
  "shots": [
    {
      "prompt": "林枫在书桌前认真学习的特写...",
      "model": "seedance-v2-pro",
      "duration": 5,
      "aspect_ratio": "16:9"
    },
    {
      "prompt": "清晨校园全景...",
      "model": "seedance-v2-pro",
      "duration": 5,
      "aspect_ratio": "16:9"
    }
  ],
  "manifest": { "episode": "EP01", "director": "ops-team" }
}
```

响应：

```json
{
  "batch_run_id": "br_abc123",
  "job_ids": ["job_001", "job_002"],
  "total": 2,
  "status": "running",
  "created_at": "2026-04-23T10:00:00Z"
}
```

### 查看批量任务状态

```http
GET /v1/batch/runs/br_abc123
```

```json
{
  "id": "br_abc123",
  "status": "running",
  "summary": {
    "total": 100,
    "queued": 40,
    "running": 22,
    "succeeded": 35,
    "failed": 3
  }
}
```

### 仅重试失败镜头

```http
POST /v1/batch/runs/br_abc123/retry-failed
```

重新提交批量任务中所有处于 `failed` 或 `timed_out` 状态的任务。新任务会被创建；原始失败任务保留以供审计。

### 下载批量清单

```http
GET /v1/batch/runs/br_abc123/manifest
```

以文件形式返回原始清单 JSON，便于核对和重跑。

---

## 请求日志

每个已鉴权的 API 调用都会被记录到 `request_logs` 表，提供可查询的完整历史记录。

### 记录内容

| 字段 | 说明 |
|------|------|
| `request_id` | 每次请求的唯一 ID（也在响应头 `X-Request-Id` 中） |
| `org_id` | 发起调用的组织 |
| `api_key_id` | 使用的 API Key |
| `job_id` | 若调用创建了任务，则为任务 UUID |
| `batch_run_id` | 若为批量任务的一部分 |
| `endpoint` | 路由路径（如 `/v1/videos` 或旧版 `/v1/video/generations`） |
| `method` | HTTP 方法 |
| `request_hash` | 请求体的 SHA-256 哈希，用于重复检测 |
| `response_status` | 返回的 HTTP 状态码 |
| `total_latency_ms` | 端到端请求延迟 |
| `error_code` | 若请求失败，则为错误码 |

:::note 隐私保护
原始请求体**不会被存储**。仅保留 SHA-256 哈希。提示词文本和图片 URL 不会持久化到请求日志中。
:::

### 查询请求日志（管理员）

```http
GET /v1/internal/admin/request-logs?org_id=<uuid>&from=2026-04-01T00:00:00Z&limit=100
```

参数：

| 参数 | 说明 |
|------|------|
| `org_id` | 按组织筛选 |
| `job_id` | 按任务筛选 |
| `status` | 按响应 HTTP 状态码筛选 |
| `from` / `to` | ISO8601 时间范围 |
| `limit` / `offset` | 分页（最大 500） |

---

## 死信队列

耗尽所有重试次数的任务会被归档到**死信队列（DLQ）**，代表 Provider 持续返回错误的情况。

### 查看死信任务

```http
GET /v1/internal/admin/dead-letter?org_id=<uuid>
```

```json
{
  "data": [
    {
      "id": 42,
      "job_id": "job_xyz",
      "org_id": "org_abc",
      "reason": "provider_server_error",
      "retry_count": 5,
      "last_error": "HTTP 503: provider unavailable",
      "archived_at": "2026-04-23T09:15:00Z"
    }
  ],
  "total": 1
}
```

### 重放死信任务

```http
POST /v1/internal/admin/dead-letter/42/replay
```

以相同的请求负载创建新任务。积分从组织余额中重新预留。

---

## 管理员任务工具

### 搜索任务

```http
GET /v1/internal/admin/jobs/search
```

参数：

| 参数 | 说明 |
|------|------|
| `org_id` | 按组织筛选 |
| `status` | 一个或多个状态：`queued`、`running`、`failed`、`succeeded`、`retrying` |
| `provider` | 如 `seedance` |
| `batch_run_id` | 按批量任务筛选 |
| `error_code` | 按特定错误码筛选 |
| `from` / `to` | ISO8601 时间范围 |
| `limit` / `offset` | 分页（最大 200） |

### 查看任务详情

```http
GET /v1/internal/admin/jobs/<job_id>/detail
```

返回完整任务行，包括所有生命周期时间戳、重试元数据和执行元数据。

### 重试失败任务

```http
POST /v1/internal/admin/jobs/<job_id>/retry
```

以相同的原始请求负载创建新任务。原始失败任务保持不变以供审计。

### 取消任务

```http
POST /v1/internal/admin/jobs/<job_id>/force-cancel
```

将任务移至 `canceled` 状态并退还积分。对任何非终态任务均有效。

---

## 限流

NextAPI 使用 Redis 滑动窗口计数器在多个层次执行限流。

### 层次说明

| 层次 | 默认限制 | 窗口 | 覆盖方式 |
|------|----------|------|----------|
| 每个 API Key | 600 次 | 1 分钟 | 在 Key 记录的 `rate_limit_rpm` 字段设置 |
| 业务接口 | 600 次 | 1 分钟 | — |
| 管理员接口 | 120 次 | 1 分钟 | — |
| 销售询价 | 10 次 | 1 小时 | — |

### 限流响应

请求被拦截时，您会收到：

```http
HTTP 429 Too Many Requests
Retry-After: <秒数>
X-RateLimit-Limit: <限制>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <Unix 时间戳>
```

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "请求过于频繁，请稍后重试。",
    "request_id": "req_abc123"
  }
}
```

### 为特定 Key 设置限流

```http
PATCH /v1/keys/<key_id>
Authorization: Bearer <ak_admin_key>

{ "rate_limit_rpm": 1200 }
```

设为 `0` 或 `null` 可取消该 Key 的专属限制，回落到全局默认值。

---

## 可观测性

### Prometheus 指标

所有指标通过 `GET /metrics` 暴露（需认证，详见部署指南）。

| 指标 | 类型 | 标签 | 说明 |
|------|------|------|------|
| `nextapi_http_requests_total` | 计数器 | route, method, status | HTTP 请求总数 |
| `nextapi_http_request_duration_seconds` | 直方图 | route | 请求延迟 |
| `nextapi_jobs_total` | 计数器 | provider, status | 到达终态的任务数 |
| `nextapi_jobs_failed_total` | 计数器 | provider, error_code | 按原因分类的失败任务数 |
| `nextapi_retry_total` | 计数器 | provider, error_code | 重试次数 |
| `nextapi_provider_latency_ms` | 直方图 | provider | Provider 提交延迟（毫秒） |
| `nextapi_end_to_end_job_latency_ms` | 直方图 | provider, status | 任务全链路耗时（毫秒） |
| `nextapi_webhook_delivery_total` | 计数器 | event_type, result | Webhook 投递结果 |
| `nextapi_rate_limit_block_total` | 计数器 | key_type, endpoint | 被限流拦截的请求数 |
| `nextapi_batch_runs_total` | 计数器 | status | 批量任务完成数 |
| `nextapi_dead_letter_total` | 计数器 | provider, error_code | 死信队列归档数 |
| `nextapi_jobs_by_status` | 仪表盘 | status | 当前各状态任务数 |
| `nextapi_provider_healthy` | 仪表盘 | provider | Provider 健康状态（1=正常，0=异常） |

### 推荐 Grafana 面板

1. **任务吞吐量** — `rate(nextapi_jobs_total[5m])` 按 `status` 分组
2. **失败率** — `rate(nextapi_jobs_failed_total[5m])` 按 `error_code` 分组
3. **重试率** — `rate(nextapi_retry_total[5m])`
4. **Provider 延迟 p95** — `histogram_quantile(0.95, rate(nextapi_provider_latency_ms_bucket[5m]))`
5. **端到端延迟 p95** — `histogram_quantile(0.95, rate(nextapi_end_to_end_job_latency_ms_bucket[5m]))`
6. **限流拦截** — `rate(nextapi_rate_limit_block_total[5m])`
7. **死信队列** — `increase(nextapi_dead_letter_total[1h])`

### 健康检查

```http
GET /health
GET /v1/health
```

服务正常时返回 `200 { "status": "ok" }`。

---

## 审计追踪

每个管理员的状态变更操作都会记录到 `audit_log`，可通过以下接口访问：

```http
GET /v1/internal/admin/audit
```

已审计的操作：

| 操作 | 触发场景 |
|------|----------|
| `admin.credit.adjust` | 手动调整积分 |
| `admin.key.create` | 创建 API Key |
| `admin.key.revoke` | 吊销 API Key |
| `admin.webhook.create/delete` | 修改 Webhook 端点 |
| `admin.job.retry` | 手动重试任务 |
| `admin.job.cancel` | 手动取消任务 |
| `admin.dlq.replay` | 重放死信任务 |
| `admin.org.pause/unpause` | 修改组织支出控制 |

审计日志不可变——无法通过 API 删除或修改。
