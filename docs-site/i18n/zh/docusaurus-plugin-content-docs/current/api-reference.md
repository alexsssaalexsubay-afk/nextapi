---
title: API 参考
sidebar_label: API 参考
description: POST /v1/video/generations 和 GET /v1/jobs/id 的完整接口文档。
---

# API 参考

NextAPI 提供两个视频生成接口：

- **`POST /v1/video/generations`** — 提交生成任务
- **`GET /v1/jobs/{job_id}`** — 查询任务状态

所有请求均需在 `Authorization` 请求头中携带 Bearer Token。

---

## 认证

```http
Authorization: Bearer sk_live_yourkey
```

每个请求都必须包含此请求头。缺少时返回 `401 Unauthorized`。

---

## POST /v1/video/generations

提交一个新的视频生成任务。请求立即返回 `job_id`，生成过程异步进行。

### 请求体

```json
{
  "prompt": "林悦走进咖啡馆，柔和的晨光",
  "duration": 5,
  "aspect_ratio": "16:9",
  "negative_prompt": "水印, 变形面部, 多余手指",
  "camera": "中景跟拍",
  "motion": "缓慢走进后停顿",
  "references": {
    "character_image_url": "https://cdn.example.com/char_lin.jpg",
    "outfit_image_url": "https://cdn.example.com/white_coat.jpg",
    "scene_image_url": "https://cdn.example.com/cafe_morning.jpg"
  },
  "metadata": {
    "continuity_group": "ep01_s01_lin_cafe",
    "shot_id": "ep01_s01_001"
  }
}
```

### 请求字段说明

| 字段 | 类型 | 是否必填 | 说明 |
|------|------|---------|------|
| `prompt` | string | ✅ | 英文生成提示词，最少 4 个字符，推荐 30–200 词 |
| `duration` | integer | ✅ | 视频时长（秒），范围 2–12 |
| `aspect_ratio` | string | ✅ | `16:9` · `9:16` · `1:1` · `4:3` · `3:4` · `21:9` |
| `negative_prompt` | string | — | 反向提示词，逗号分隔 |
| `camera` | string | — | 镜头运动描述 |
| `motion` | string | — | 主体动作描述 |
| `references` | object | — | 参考图（见子字段） |
| `metadata` | object | — | 透传字段，用于连贯组等自定义标记 |

### references 子字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `character_image_url` | string（URL） | 角色外貌参考图 |
| `outfit_image_url` | string（URL） | 服装/造型参考图 |
| `scene_image_url` | string（URL） | 背景/场地参考图 |
| `reference_video_url` | string（URL） | 动作或风格参考视频 |

所有参考图必须是可公开访问的 `https://` 链接。本地文件路径 API 不接受——用 Batch Studio 或 ComfyUI Asset Resolver 节点处理上传。

### 响应体 — 200 OK

```json
{
  "id": "job_a3k9m2x1",
  "status": "queued",
  "estimated_credits": 12
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 任务 ID，用于查询状态 |
| `status` | string | 创建时始终为 `queued` |
| `estimated_credits` | integer | 预估积分消耗，完成后按实际结算 |

### 错误响应

| HTTP 状态 | 错误码 | 含义 |
|-----------|-------|------|
| `400` | `invalid_request` | 缺少必填字段或字段值不合法 |
| `400` | `content_policy.pre` | 提示词被内容审核拦截 |
| `401` | `unauthorized` | 密钥缺失或无效 |
| `402` | `insufficient_balance` | 组织积分不足 |
| `429` | `rate_limit_exceeded` | 超过密钥 RPM 限制 |
| `5xx` | — | 服务端或服务商错误，建议退避重试 |

### 调用示例

**curl：**

```bash
curl -X POST https://api.nextapi.top/v1/video/generations \
  -H "Authorization: Bearer sk_live_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Lin Yue walks into the cafe, soft morning light from the left",
    "duration": 5,
    "aspect_ratio": "16:9",
    "negative_prompt": "watermark, distorted face",
    "references": {
      "character_image_url": "https://cdn.example.com/char_lin.jpg"
    }
  }'
```

**Python：**

```python
import requests

resp = requests.post(
    "https://api.nextapi.top/v1/video/generations",
    headers={"Authorization": "Bearer sk_live_yourkey"},
    json={
        "prompt": "Lin Yue walks into the cafe, soft morning light",
        "duration": 5,
        "aspect_ratio": "16:9",
        "references": {
            "character_image_url": "https://cdn.example.com/char_lin.jpg"
        },
    },
    timeout=30,
)
job = resp.json()
print(job["id"], job["estimated_credits"])
```

---

## GET /v1/jobs/\{id\}

查询生成任务的当前状态。

### 路径参数

| 参数 | 说明 |
|------|------|
| `id` | 生成接口返回的任务 ID |

### 响应体 — 200 OK

```json
{
  "id": "job_a3k9m2x1",
  "status": "succeeded",
  "video_url": "https://storage.nextapi.top/videos/job_a3k9m2x1.mp4?token=...",
  "error_code": null,
  "error_message": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 任务 ID |
| `status` | string | 当前状态（见下方流转图） |
| `video_url` | string \| null | 视频签名链接，仅在 `status = succeeded` 时有值，**24 小时后过期** |
| `error_code` | string \| null | 失败时的错误码 |
| `error_message` | string \| null | 失败时的错误描述 |

### 任务状态流转

```
queued  →  running  →  succeeded
                    ↘  failed
```

| 状态 | 含义 |
|------|------|
| `queued` | 已接受，在服务商队列中等待 |
| `running` | 正在生成中 |
| `succeeded` | 完成，`video_url` 有效 |
| `failed` | 失败，`error_code` 和 `error_message` 有内容 |

**推荐轮询间隔：** 4 秒。每 2 秒以上轮询不会提升速度，只会消耗 RPM 配额。

### 调用示例

**curl：**

```bash
curl https://api.nextapi.top/v1/jobs/job_a3k9m2x1 \
  -H "Authorization: Bearer sk_live_yourkey"
```

**Python 轮询循环：**

```python
import time
import requests

headers = {"Authorization": "Bearer sk_live_yourkey"}

while True:
    resp = requests.get("https://api.nextapi.top/v1/jobs/job_a3k9m2x1", headers=headers)
    data = resp.json()
    print(f"状态: {data['status']}")

    if data["status"] == "succeeded":
        print(f"视频地址: {data['video_url']}")
        break
    elif data["status"] == "failed":
        print(f"失败: {data['error_code']} — {data['error_message']}")
        break

    time.sleep(4)
```

---

## 速率限制

| 默认值 | 说明 |
|--------|------|
| 30 RPM | 每分钟每密钥最多请求数 |
| 5 并发 | 每密钥同时进行中的生成任务数 |

两个限制均可在控制台 → **密钥 → 编辑** 中调整。

---

## 积分结算

- 任务进入 `queued` 时**预占积分**
- 任务失败时，预占积分**全额退回**
- 最终结算按实际生成成本计算，可能与 `estimated_credits` 有轻微差异
- 积分余额在控制台 → **计费** 中查看
