# 上游接入：UpToken（uptoken.cc）

> UpToken 是 NextAPI 的官方代跑上游（视频生成），帮你打通方舟渠道、合规、计费等杂事。把 `PROVIDER_MODE=uptoken` + 一把 `ut-` 开头的 key 写进 `.env`，`POST /v1/videos` 就会被自动翻译到上游。

官方文档：[https://uptoken.cc/docs](https://uptoken.cc/docs)  
代码入口：`backend/internal/provider/uptoken/`（`live.go` / `models.go` / `pricing.go`）

---

## 1. 取 key

1. 打开 [https://uptoken.cc/login](https://uptoken.cc/login)，用 Google / Email 登录
2. 左侧 **API Keys** → **Create Key**
3. 复制以 `ut-` 开头的**完整字符串**——显示一次，丢了只能重建
4. 右上角 `BALANCE` 保证 > 0（上游会用 HTTP **402** 回拒余额不足，我们会把它透传给客户）

> 如果是上游给我们的**预留合作 key**，直接塞进 `UPTOKEN_API_KEY` 即可，不需要改代码。

---

## 2. 改 `.env`

```bash
# PROVIDER_MODE 三选一：mock / live / uptoken
PROVIDER_MODE=uptoken

UPTOKEN_API_KEY=ut-xxxxxxxxxxxxxxxxxxxx
UPTOKEN_BASE_URL=https://uptoken.cc/v1          # 默认值，可不写
UPTOKEN_MODEL=seedance-2.0-pro                  # 客户未传 model 时的兜底

# 可选：公开目录里每个 model → UpToken 真实 ID
# 默认映射见下表，一般不需要改
# UPTOKEN_MODEL_MAP=seedance-2.0:seedance-2.0-pro,seedance-2.0-fast:seedance-2.0-fast
```

改完重启服务即可：`systemctl restart nextapi-server nextapi-worker`。

---

## 3. 上游接口一览

| 动作     | NextAPI 对外                         | UpToken 真实调用                                   |
|----------|--------------------------------------|----------------------------------------------------|
| 创建任务 | `POST /v1/videos`                    | `POST https://uptoken.cc/v1/video/generations`     |
| 轮询任务 | `GET /v1/videos/:id`                 | `GET https://uptoken.cc/v1/video/generations/:id`  |
| 鉴权     | `Authorization: Bearer sk-...`（客户 key） | `Authorization: Bearer ut-...`（我们的 UpToken key）|

网关内部会：
- 把客户传的 `prompt` + `image_url` 组装成 UpToken 要求的 `content[]`（`text` + `image_url` 对象 w/ `role=reference_image`）
- 把 `aspect_ratio` 映射成 `ratio`，其余字段（`resolution` / `duration` / `generate_audio` / `seed`）1:1 透传
- 把公开模型 ID 映射成 UpToken 上游 ID（见 §4）
- 只在上游返回 `succeeded` 时才把 `content.video_url` 交给下游；失败就把 `error.code` 写进 Job 的 `error_code`

---

## 4. 模型映射

UpToken 目前对外暴露：

| 上游 ID              | 说明                                       |
|----------------------|--------------------------------------------|
| `seedance-2.0-pro`   | 主推，视频质量最高，最长 15s / 720p       |
| `seedance-2.0-fast`  | 快速档，15s / 720p                         |
| `seedream-5.0-lite`  | 图像生成（暂未接入我们的 `/v1/videos`）   |

NextAPI 对外目录里的公开 ID 会被自动翻译（可用 `UPTOKEN_MODEL_MAP` 覆盖）：

| 公开 ID（客户传）        | 默认翻译到          |
|--------------------------|---------------------|
| `seedance-2.0`           | `seedance-2.0-pro`  |
| `seedance-2.0-fast`      | `seedance-2.0-fast` |
| `seedance-1.5-pro`       | `seedance-2.0-pro`  |
| `seedance-1.0-pro`       | `seedance-2.0-pro`  |
| `seedance-1.0-pro-fast`  | `seedance-2.0-fast` |
| `seedance-1.0-lite`      | `seedance-2.0-fast` |
| 未知 ID                  | **按原样透传**（客户自担风险） |

> 如果客户直接传 `seedance-2.0-pro`，我们也会原样发给上游，不会被拦截。

---

## 5. 请求 / 响应形状

### 5.1 创建任务

```http
POST https://uptoken.cc/v1/video/generations
Authorization: Bearer ut-xxx
Content-Type: application/json

{
  "model": "seedance-2.0-pro",
  "content": [
    { "type": "text", "text": "A cinematic drone shot over mountains at golden hour" },
    { "type": "image_url",
      "image_url": { "url": "https://cdn.example.com/ref.jpg" },
      "role": "reference_image" }
  ],
  "ratio": "16:9",
  "resolution": "720p",
  "duration": 5,
  "generate_audio": true,
  "seed": 42
}

# 响应
{ "id": "ut-a8f3K9mN2pQx" }
```

### 5.2 轮询任务

```http
GET https://uptoken.cc/v1/video/generations/ut-a8f3K9mN2pQx
Authorization: Bearer ut-xxx

# 响应（succeeded）
{
  "id":     "ut-a8f3K9mN2pQx",
  "status": "succeeded",
  "content": { "video_url": "https://uptoken.cc/v1/media/proxy?..." },
  "usage":   { "total_tokens": 97605 }
}

# 响应（failed）
{
  "id":     "ut-a8f3K9mN2pQx",
  "status": "failed",
  "error":  { "code": "error-701", "message": "Video generation failed", "type": "generation_failed" }
}
```

状态流：`queued → running → succeeded | failed`。`video_url` 的下载链接**有效期 24 小时**——我们已经在 worker 侧在第一次收到 `succeeded` 时立刻把视频落到 R2，客户拿到的是我们 CDN 的永久链接。

---

## 6. 错误码对照

UpToken 用 `error-1xx` ~ `error-7xx` 统一标记，网关按 HTTP code 透传给客户。常见分类：

| 前缀        | HTTP  | 语义          | 建议重试策略                          |
|-------------|-------|---------------|---------------------------------------|
| `error-1xx` | 401/402 | 鉴权 / 余额   | 不要重试；`402` 充值后重发            |
| `error-2xx` | 400   | 参数错误      | **不要重试**，改请求后再发            |
| `error-3xx` | 400 / 200* | 内容审核   | 不要重试，换 prompt / 媒体            |
| `error-4xx` | 400   | 媒体 URL 不可达 | 换 URL 后再发                         |
| `error-5xx` | 429   | 限流          | 指数退避后重试                        |
| `error-6xx` | 502/504 | 上游容量 / 超时 | 指数退避后重试；长期 6xx 要切 Ark     |
| `error-7xx` | 200*  | 生成失败      | 不要立刻重试；通常是 prompt 过于复杂 |

`*` 表示 `error-3xx/7xx` 会以 `status: "failed"` 出现在轮询响应里，而不是 HTTP 错误。

网关侧的硬性约束（`backend/internal/provider/uptoken/live.go`）：
- 创建重试 3 次，轮询重试 5 次；只对 408 / 429 / 5xx 重试
- 连续 6 次失败（60s 窗口）触发熔断，30s 内对该 Provider 的调用直接 503（`ErrUpstreamUnavailable`），而不是把请求烧在上游

---

## 7. 上线前冒烟

对外目录里的每个 `model` 至少跑一条：

```bash
curl -X POST https://api.nextapi.top/v1/videos \
  -H "Authorization: Bearer sk-你的业务key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2.0",
    "prompt": "a cat plays piano, cinematic lighting",
    "duration_seconds": 5,
    "resolution": "720p",
    "aspect_ratio": "16:9"
  }'
```

然后 `GET /v1/videos/:id` 轮询到 `status=succeeded` 即代表端到端链路通。任何 `error-2xx` 基本上都是我们这一侧的参数校验漏过——优先查 `backend/internal/gateway/videoparams.go`。

---

## 8. 切换到自建 Ark 的退路

如果哪天要从 UpToken 切回方舟直连：

1. 在方舟控制台开通 Seedance 视频模型，拿到 `doubao-seedance-*-YYYYMMDD`
2. 按 `docs/OPERATOR-HANDBOOK.md` 第五节配 `VOLC_API_KEY` + `SEEDANCE_MODEL_MAP`
3. 把 `PROVIDER_MODE` 从 `uptoken` 改成 `live`，重启
4. Provider 接口一致，网关 / 计费 / 对账代码一行都不用改

反之亦然——需要紧急切流时，改 env + 重启就够了。

---

## 9. 已知限制

- **Asset Library（`POST /v1/assets`）** UpToken 独有、我们暂未透出。客户想用参考图时，请直接传**公网 HTTPS URL**（或把图片先传到自家 R2）。
- **视频链接 24h 过期** 上游返回的 `content.video_url` 只保证 24 小时；别把它直接丢给客户，必须走 worker 落 R2 的路径。
- **沙箱/测试 key** 上游支持 `__test_poll_timeout` 等关键词触发 mock 失败；NextAPI 自己的 `PROVIDER_MODE=mock` 已经覆盖这些场景，不需要叠加使用。
