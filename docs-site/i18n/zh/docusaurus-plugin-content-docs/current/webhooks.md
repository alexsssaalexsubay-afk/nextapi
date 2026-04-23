---
sidebar_position: 11
title: Webhook 配置
description: 配置任务完成、批量完成和积分预警的出站 Webhook。
---

# Webhook 配置

NextAPI 在重要事件发生时向您的服务器发送出站 Webhook——任务完成、批量完成和积分预警。这让您的工作流可以实时响应，无需轮询。

---

## 工作原理

```
NextAPI  ──── HTTPS POST ────►  您的服务器
         ← 200 OK（10 秒内响应）
```

每次 Webhook 投递都包含 **HMAC-SHA256 签名**，用于验证数据确实来自 NextAPI。

---

## 创建 Webhook

```http
POST /v1/webhooks
Authorization: Bearer <ak_admin_key>
Content-Type: application/json

{
  "url": "https://your-server.example.com/nextapi-events",
  "event_types": ["job.succeeded", "job.failed", "credits.low"]
}
```

响应：

```json
{
  "id": "wh_abc123",
  "url": "https://your-server.example.com/nextapi-events",
  "event_types": ["job.succeeded", "job.failed", "credits.low"],
  "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "created_at": "2026-04-23T10:00:00Z"
}
```

:::warning 保存好 Secret
Webhook Secret 仅在**创建时显示一次**，之后无法再次获取。请将其安全地存储为环境变量。
:::

---

## 事件类型

| 事件 | 触发时机 |
|------|----------|
| `job.succeeded` | 视频生成任务成功完成 |
| `job.failed` | 任务到达 `failed` 终态 |
| `batch.completed` | 批量任务中所有任务到达终态 |
| `credits.low` | 组织积分余额低于预警阈值 |

---

## 数据结构

所有事件共享统一的外层结构：

```json
{
  "event_type": "job.succeeded",
  "created_at": "2026-04-23T10:05:32Z",
  "data": { ... }
}
```

### `job.succeeded`

```json
{
  "event_type": "job.succeeded",
  "created_at": "2026-04-23T10:05:32Z",
  "data": {
    "id": "vid_xyz789",
    "job_id": "job_abc123",
    "video_id": "vid_xyz789",
    "status": "succeeded",
    "video_url": "https://cdn.nextapi.top/videos/vid_xyz789.mp4",
    "cost_credits": 50,
    "created_at": "2026-04-23T10:00:00Z"
  }
}
```

### `job.failed`

```json
{
  "event_type": "job.failed",
  "created_at": "2026-04-23T10:06:00Z",
  "data": {
    "id": "job_abc123",
    "job_id": "job_abc123",
    "video_id": "job_abc123",
    "status": "failed",
    "error_code": "provider_server_error",
    "error_message": "视频生成在多次重试后失败",
    "created_at": "2026-04-23T10:00:00Z"
  }
}
```

### `batch.completed`

```json
{
  "event_type": "batch.completed",
  "created_at": "2026-04-23T12:00:00Z",
  "data": {
    "batch_id": "br_batch456",
    "status": "partial_failure",
    "total_shots": 100,
    "succeeded_count": 97,
    "failed_count": 3,
    "completed_at": "2026-04-23T12:00:00Z"
  }
}
```

批量状态说明：

| 状态 | 含义 |
|------|------|
| `completed` | 所有镜头成功 |
| `partial_failure` | 部分成功，部分失败 |
| `failed` | 全部失败 |

### `credits.low`

```json
{
  "event_type": "credits.low",
  "created_at": "2026-04-23T09:00:00Z",
  "data": {
    "org_id": "org_abc",
    "current_balance": 450,
    "alert_threshold": 500
  }
}
```

---

## 签名验证

每次 Webhook 投递都包含 `X-NextAPI-Signature` 响应头：

```
X-NextAPI-Signature: sha256=<十六进制 HMAC>
```

HMAC 使用 SHA-256 算法和您的 Webhook Secret 对原始请求体计算得出。

### Python 验证示例

```python
import hmac
import hashlib

def verify_signature(payload_bytes: bytes, secret: str, signature_header: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)

# 在您的处理函数中：
raw_body = request.get_data()
sig = request.headers.get("X-NextAPI-Signature", "")
if not verify_signature(raw_body, WEBHOOK_SECRET, sig):
    return "签名无效", 403
```

### Node.js 验证示例

```javascript
const crypto = require("crypto");

function verifySignature(rawBody, secret, signatureHeader) {
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

// 在 Express 处理函数中：
app.post("/nextapi-events", express.raw({ type: "*/*" }), (req, res) => {
  const sig = req.headers["x-nextapi-signature"] || "";
  if (!verifySignature(req.body, process.env.WEBHOOK_SECRET, sig)) {
    return res.status(403).send("签名无效");
  }
  // 处理事件
  res.status(200).send("ok");
});
```

---

## 投递与重试

### 超时

NextAPI 期望您的服务器在 **10 秒内**响应。若超时，本次投递标记为失败并自动重试。

### 重试时间表

```
第 1 次 → 立即
第 2 次 → 30 秒后
第 3 次 → 2 分钟后
第 4 次 → 10 分钟后
第 5 次 → 30 分钟后
```

5 次失败后，本次投递标记为永久失败并记入日志供运营人员审查。

### 查看投递日志

```http
GET /v1/webhooks/<webhook_id>/deliveries
Authorization: Bearer <ak_admin_key>
```

```json
{
  "data": [
    {
      "id": 1,
      "webhook_id": "wh_abc123",
      "event_type": "job.succeeded",
      "status_code": 200,
      "attempt": 1,
      "delivered_at": "2026-04-23T10:05:33Z"
    },
    {
      "id": 2,
      "webhook_id": "wh_abc123",
      "event_type": "job.failed",
      "status_code": null,
      "error": "连接被拒绝",
      "attempt": 3,
      "next_retry_at": "2026-04-23T10:16:00Z"
    }
  ]
}
```

### 手动重放

重放失败的投递：

```http
POST /v1/internal/admin/webhooks/deliveries/<delivery_id>/replay
```

---

## Webhook 管理

### 列出 Webhook

```http
GET /v1/webhooks
Authorization: Bearer <ak_admin_key>
```

### 获取 Webhook 详情

```http
GET /v1/webhooks/<webhook_id>
```

### 删除 Webhook

```http
DELETE /v1/webhooks/<webhook_id>
```

### 轮换 Secret

```http
POST /v1/webhooks/<webhook_id>/rotate
```

返回新的 Secret。请立即更新服务器的环境变量——旧 Secret 立即失效。

---

## 幂等性

每次 Webhook 投递都有唯一的 `delivery_id`，通过 `X-Delivery-Id` 响应头传递：

```
X-Delivery-Id: delivery_00001
```

如果您的服务器收到重复的投递（例如因网络重试），可以使用此 ID 去重——将已处理的 delivery ID 存入数据库，遇到重复时跳过处理。

---

## URL 安全限制

NextAPI 在创建时验证 Webhook URL：

- 必须使用 `https://`
- 不得指向私有/内部 IP 段（防止 SSRF 攻击）
- 不得使用短链接或重定向服务

URL 验证失败时，创建请求返回 `400 invalid_webhook_url`。

---

## 故障排查

**Webhook 未收到？**
1. 确认 Webhook 未被禁用（调用 `GET /v1/webhooks/<id>` 检查 `disabled_at` 字段）。
2. 查看投递日志中的错误信息。
3. 确认您的服务器在 10 秒内响应。
4. 确认事件类型在 Webhook 的 `event_types` 列表中。

**签名验证失败？**
1. 确认您是对请求体的**原始字节**计算 HMAC，而不是解析后的 JSON 对象。
2. 使用常量时间比较（`hmac.compare_digest` / `crypto.timingSafeEqual`）。
3. 确认使用了正确的 Secret——它只在创建时或轮换后显示一次。

**收到 401 或 403？**
- NextAPI 不跟随重定向。请确保 Webhook URL 是最终目的地。
- 如果您的服务器需要认证头，可在 URL 路径中嵌入 Secret Token：`https://your-server.example.com/hook/secret-token`。
