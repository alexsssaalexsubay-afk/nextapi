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

# 托管中继任务完成回调（HMAC-SHA256）；与 OpenAPI/运维约定路径一致。
SEEDANCE_RELAY_WEBHOOK_SECRET=...

# 可选：为媒体库图片同时在中继侧登记 asset://（默认 false）。
SEEDANCE_RELAY_ASSETS_ENABLED=false

# 可选：允许的分辨率列表（逗号分隔），默认 480p,720p,1080p。
SEEDANCE_RELAY_ALLOWED_RESOLUTIONS=480p,720p,1080p
```

兼容说明：代码仍能读取旧版变量名，方便老服务器平滑迁移；新部署只写 `SEEDANCE_RELAY_*`。

## 2. 对外与上游字段映射

| NextAPI 对外 | 上游中继 |
| --- | --- |
| `POST /v1/videos` | `POST /v1/video/generations` |
| `GET /v1/videos/:id` | `GET /v1/video/generations/:task_id` |
| `Authorization: Bearer sk_*` | `Authorization: Bearer <server-side relay key>` |
| `input.aspect_ratio` / `input.ratio` | `ratio` |
| `input.duration_seconds` | `duration` |
| `input.resolution` | `resolution` |
| `input.generate_audio` | `generate_audio` |
| `input.prompt` | `content[] text` |
| `input.image_url` / `input.image_urls[]` | `content[] image_url role=reference_image` |
| `input.video_urls[]` | `content[] video_url role=reference_video` |
| `input.audio_urls[]` | `content[] audio_url role=reference_audio` |
| `input.first_frame_url` / `input.last_frame_url` | `content[] image_url role=first_frame` / `last_frame` |

上游返回 `queued → running → succeeded | failed`。成功时读取 `content.video_url` 和 `usage.total_tokens`；失败时读取 `error.code` / `error.message`。

网关不再设置旧的本地 `prompt` 字符硬上限（例如 2000 / 4000 字符）。当前 UpToken/Seedance 文档的限制是语言感知的：英文 `<=1000 words`，中文 `<=500 chars`；并且在已有图片、视频或首尾帧输入时 `prompt` 可为空。若上游因为 prompt 内容或长度拒绝请求，应把上游返回的 `error.message` 直接透传给用户，不要改写成固定错误表。

对外 API 同时支持两种输入形态：

- **NextAPI flat fields**：`prompt`、`image_urls`、`first_frame_url`、`video_urls`、`audio_urls` 等。
- **UpToken content[]**：`content: [{ type: "text" }, { type: "image_url", role: "reference_image" }, ...]`。

这两种形态互斥：一旦传了 `content[]`，就不要再同时传 `prompt`、`image_url(s)`、`video_url(s)`、`audio_url(s)`、`first_frame_url` 或 `last_frame_url`。共享参数（`duration_seconds`、`resolution`、`ratio/aspect_ratio`、`generate_audio`、`draft`、`seed`）仍然放在 `input` 顶层。`ratio` 是 `aspect_ratio` 的别名；两者同时出现时必须一致。

## 3. 视频能力约束

- 模型：`seedance-2.0-pro`、`seedance-2.0-fast`。
- 时长：默认 5 秒；**对外 API 与网关校验为 4–15 秒**（与 Seedance 能力一致）。
- 分辨率：`480p`、`720p`、`1080p`。
- 画幅：`16:9`、`9:16`、`1:1`、`4:3`、`3:4`、`21:9`、`adaptive`；对外可传 `aspect_ratio` 或上游别名 `ratio`。
- `image_urls` 最多 9 个，且不能和 `first_frame_url` 同时使用。
- `video_urls` 最多 3 个。
- `audio_urls` 最多 3 个，且必须同时提供图片或视频输入。
- `last_frame_url` 必须和 `first_frame_url` 一起使用。
- 只要请求里已经有视觉媒体输入，`prompt` 可以为空。
- `content[]` 里的 `image_url` 支持 `reference_image`、`first_frame`、`last_frame`；`video_url` 支持 `reference_video`；`audio_url` 支持 `reference_audio`。上传真人肖像时，应先通过素材库拿到 `asset://ut-asset-*`，等状态为 `active` 后再作为引用传入。
- 素材库同步字段必须覆盖上游返回的 `virtual_id`、`asset_url`、`status`、`processing_status`、`filename`、`size_bytes`、`rejection_reason`。NextAPI 的媒体库已有本地 `filename/size_bytes`，但对用户排错最关键的是状态流 `ready | pending | active | failed` 和 `failed` 时的 `rejection_reason`；这些需要在后台刷新和 Dashboard 响应中保留。

## 4. 错误码策略

- HTTP 状态码先决定处理分支：400/422 让客户修正参数或素材，401 检查 key，402 检查余额，429 退避，502/504 可重试或换模型。
- `error.message` 是用户排错的第一信息源，提交失败和轮询失败都必须原样展示给用户。
- `error.code` 只用于日志、粗粒度分组和告警；不要依赖固定错误码清单，因为上游可能返回网关码或模型供应商码。

## 5. 任务回调（Webhook）

生产环境在托管中继侧登记回调 URL（HTTPS）：

`https://api.nextapi.top/api/webhooks/seedance`

服务端用 `SEEDANCE_RELAY_WEBHOOK_SECRET` 校验 HMAC 签名；详见 `docs/modules/seedance-relay-webhook-assets.md`。未收到回调时，任务仍以轮询为准。

## 6. 上线验收

1. `PROVIDER_MODE=seedance_relay` 且 `SEEDANCE_RELAY_API_KEY` 已在服务器 `.env`。
2. `GET https://api.nextapi.top/health` 返回 `{"status":"ok"}`。
3. 用客户 `sk_live_*` 发一条最小 `POST /v1/videos`。
4. 轮询 `GET /v1/videos/:id`，看到 `queued/running/succeeded/failed` 的真实状态。
5. 失败任务必须退款；成功任务必须按 `usage.total_tokens` 对账。
