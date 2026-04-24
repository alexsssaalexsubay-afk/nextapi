# 上游接入：Seedance 托管中继

> 这份文档面向 NextAPI 运维。客户永远只看到 `https://api.nextapi.top/v1` 和自己的 `sk_*` 业务密钥；我们的上游中继 key 只放在服务器环境变量里，绝不进入前端、SDK、公开文档或 Git。

## 1. 环境变量

```bash
PROVIDER_MODE=seedance_relay

# 运维交接给我们的上游中继 key。不要给客户，不要写进代码。
SEEDANCE_RELAY_API_KEY=...

# 由运维提供；生产服务器可留空使用代码默认值。
SEEDANCE_RELAY_BASE_URL=

# 客户未传 model 时的兜底上游模型。
SEEDANCE_RELAY_MODEL=seedance-2.0-pro

# 可选：公开模型 ID → 上游模型 ID。
SEEDANCE_RELAY_MODEL_MAP=seedance-2.0:seedance-2.0-pro,seedance-2.0-fast:seedance-2.0-fast
```

兼容说明：代码仍能读取旧版变量名，方便老服务器平滑迁移；新部署只写 `SEEDANCE_RELAY_*`。

## 2. 对外与上游字段映射

| NextAPI 对外 | 上游中继 |
| --- | --- |
| `POST /v1/videos` | `POST /v1/video/generations` |
| `GET /v1/videos/:id` | `GET /v1/video/generations/:task_id` |
| `Authorization: Bearer sk_*` | `Authorization: Bearer <server-side relay key>` |
| `input.aspect_ratio` | `ratio` |
| `input.duration_seconds` | `duration` |
| `input.resolution` | `resolution` |
| `input.generate_audio` | `generate_audio` |
| `input.image_url` | `content[]` reference image |
| `input.image_urls` / `video_urls` / `audio_urls` | flat media params |
| `input.first_frame_url` / `last_frame_url` | first / last frame params |

上游返回 `queued → running → succeeded | failed`。成功时读取 `content.video_url` 和 `usage.total_tokens`；失败时读取 `error.code` / `error.message`。

## 3. 视频能力约束

- 模型：`seedance-2.0-pro`、`seedance-2.0-fast`。
- 时长：默认 5 秒，当前网关接受 2-15 秒；生产目录主推 4-15 秒。
- 分辨率：`480p`、`720p`、`1080p`。
- 画幅：`16:9`、`9:16`、`1:1`、`4:3`、`3:4`、`21:9`、`adaptive`。
- `image_urls` 最多 9 个，且不能和 `first_frame_url` 同时使用。
- `video_urls` 最多 3 个。
- `audio_urls` 最多 3 个，且必须同时提供图片或视频输入。
- `last_frame_url` 必须和 `first_frame_url` 一起使用。

## 4. 错误码策略

- `error-1xx`：鉴权 / 余额问题，运维优先检查上游 key 与额度。
- `error-2xx`：参数错误，通常说明网关校验漏了，应补测试。
- `error-3xx`：内容审核失败，客户应换提示词或素材。
- `error-4xx`：素材 URL 不可访问或格式不对，客户应换公网 HTTPS 直链。
- `error-5xx` / `error-6xx`：限流、容量、模型暂不可用，可退避重试。
- `error-7xx`：生成失败或超时，建议客户简化提示词后重试。

## 5. 上线验收

1. `PROVIDER_MODE=seedance_relay` 且 `SEEDANCE_RELAY_API_KEY` 已在服务器 `.env`。
2. `GET https://api.nextapi.top/health` 返回 `{"status":"ok"}`。
3. 用客户 `sk_live_*` 发一条最小 `POST /v1/videos`。
4. 轮询 `GET /v1/videos/:id`，看到 `queued/running/succeeded/failed` 的真实状态。
5. 失败任务必须退款；成功任务必须按 `usage.total_tokens` 对账。
