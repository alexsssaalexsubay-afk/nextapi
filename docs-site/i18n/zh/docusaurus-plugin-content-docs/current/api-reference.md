---
title: API 参考
sidebar_label: API 参考
description: 视频生成 — /v1/models、/v1/videos 与旧版兼容端点说明。
---

# API 参考

**权威说明：** 以仓库内 OpenAPI 文件（`backend/api/openapi.yaml`）为准。本文是面向阅读的摘要，以 OpenAPI 为准。

**基地址：** `https://api.nextapi.top/v1`（本地开发一般为 `http://localhost:8080/v1`）

**鉴权：** 在 `Authorization` 中携带 `Bearer sk_live_…` 或 `sk_test_…`（下表所列的对外路由）。

---

## 推荐使用的主接口

| 方法 | 路径 | 说明 |
|--------|------|---------|
| `GET` | `/models` | 公开模型目录（游标分页） |
| `GET` | `/models/{model_id}` | 获取单个模型 |
| `POST` | `/videos` | 创建 **video** 任务（异步，返回 `202`） |
| `GET` | `/videos` | 列表，支持 `status`、`model`、时间范围等筛选 |
| `GET` | `/videos/{id}` | 查询状态、入参回显、输出、费用、错误信息 |
| `DELETE` | `/videos/{id}` | 取消或删除（非终态时） |
| `GET` | `/videos/{id}/wait` | 长轮询直至终态（可带 `timeout`） |

对支持幂等的 **`POST`** 请携带 **`Idempotency-Key`** 请求头（同 key+同 body 在 24 小时窗口内去重，见 OpenAPI）。部分响应会返回 **`X-Request-Id`**。

### 公开 model ID

视频目录主 ID：`seedance-2.0-pro`、`seedance-2.0-fast`。旧 ID（如 `seedance-2.0`）仍可能被接受并映射到同档位（以 `GET /models` 为准）。

### `POST /videos` — 请求体

顶层必填字段：**`model`**、**`input`**；**`input`** 内须包含 **`prompt`**。

```json
{
  "model": "seedance-2.0-pro",
  "input": {
    "prompt": "一个人走进洒满阳光的房间",
    "duration_seconds": 5,
    "resolution": "1080p",
    "image_url": "https://example.com/optional-first-frame.png"
  },
  "webhook_url": "https://example.com/hooks/nextapi"
}
```

`input` 中可选字段（视模型能力而定）包括：`mode`（`fast` / `normal`）、`aspect_ratio`、`fps`（`24` / `30`）、`generate_audio`、`watermark`、`seed`、`camera_fixed`，以及 `references` 对象数组。完整定义与限制见 OpenAPI 的 `VideoInput`（如填写 `duration_seconds` 时一般需在 **2～15** 秒之间）。

### `POST /videos` — 成功响应（`202`）

```json
{
  "id": "vid_01HXXX",
  "object": "video",
  "status": "queued",
  "model": "seedance-2.0-pro",
  "created_at": "2026-04-24T12:00:00Z",
  "estimated_cost_cents": 50
}
```

### `GET /videos/{id}`

返回同一条 `video` 资源，在成功时带 `input`、`output`；失败时带 `error_code`、`error_message`。成功时 `output.video_url` 为短期有效的签名地址，请下载后自存。

**轮询间隔：** 数秒一次即可；也可使用 `GET /v1/videos/{id}/wait`，或为组织在控制台配置 [Webhooks](./webhooks) 接收完成事件。

### 示例：curl

```bash
curl -sS -X POST "https://api.nextapi.top/v1/videos" \
  -H "Authorization: Bearer sk_live_yourkey" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "一个人走进洒满阳光的房间",
      "duration_seconds": 5,
      "resolution": "1080p"
    }
  }'
```

```bash
curl -sS "https://api.nextapi.top/v1/videos/vid_01HXXX" \
  -H "Authorization: Bearer sk_live_yourkey"
```

---

## 旧版兼容（仍提供）

与 `/v1/videos` 共用同一条生成链路，但请求体为 **平铺** JSON，返回为 **任务（job）形态** 的 JSON（**没有** `object: "video"` 包一层）。

| 方法 | 路径 | 说明 |
|--------|------|--------|
| `POST` | `/video/generations` | 必填 `prompt`；使用 **`duration_seconds`**（**不要** 使用字段名 `duration`）；另有 `model`、`image_url`、`resolution`、`aspect_ratio` 等，与 `VideoHandlers.Generate` 一致 |
| `GET` | `/jobs/{id}` | 用旧接口创建时返回的 **任务 id** 做轮询 |

**旧版创建（`202`）响应：** `id`、`status`、`estimated_credits`。  
**旧版 `GET`：** 返回 `id`、`status`、`video_url`、`error_code`、`error_message`、`created_at`、`completed_at` 等。

**新对接请优先用 `POST /v1/videos` + `GET /v1/videos/{id}`**，字段与 OpenAPI 以及仪表盘/SDK 更一致。

---

## Webhook 与计费

- **单次请求**：可在 `POST /v1/videos` 中传 `webhook_url`（见 OpenAPI）。  
- **组织级**：在控制台用 `POST /v1/webhooks` 登记端点，事件带 HMAC 签名，详见 [Webhooks](./webhooks)。

`Video` 资源上 `/v1/videos` 使用以 **美分 USD** 计价的 `estimated_cost_cents` / `actual_cost_cents`。部分旧版字段或说明仍用「积分」表述时，**以新接口的 OpenAPI `Video` 为准**。

---

## 限流

- 业务面默认对 **已鉴权** 请求有 **每 Key 约 600 次/分钟** 的路由级限流，响应中可见 `X-RateLimit-*`。
- 若 Key 在 **控制台 → 密钥** 中配置了 **`rate_limit_rpm`**，会 **再叠加** 该 Key 专属上限；可能返回 **`429`** 且 `error.code` 为 **`key_rate_limited`**。

请根据 **`X-RateLimit-*` / `X-RateLimit-Key-*`** 调整重试与并发。

---

## 错误体

一般形式：

```json
{ "error": { "code": "invalid_request", "message": "…" } }
```

具体 HTTP 与业务码以 OpenAPI `responses` 与 [错误说明](./errors.md) 为准。
