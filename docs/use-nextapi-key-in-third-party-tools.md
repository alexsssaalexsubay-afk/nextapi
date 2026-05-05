# 把 NextAPI Key 填入第三方创作工具

NextAPI 卖的是视频生成 API 能力。用户如果不想在 NextAPI 控制台里生成视频，可以把
NextAPI 作为后端，接入 ComfyUI、n8n、Make、Dify 或本地画布。本文只写已知可解释的
路径；没有验证的原生集成不能说成已完成。

## 1. 中文严格配置流程

1. 登录 [app.nextapi.top](https://app.nextapi.top)。
2. 进入 **API Keys**。
3. 点击 **Create key**，命名为 `comfyui-local`、`n8n-video` 之类，复制完整 `sk_...`。
4. 确认第三方工具支持以下任一能力：
   - Custom HTTP Request
   - OpenAPI Tool
   - Custom Provider
   - Bearer Token
5. Base URL 填 `https://api.nextapi.top/v1`。
6. 如果工具把 Host 与 Path 拆开：
   - Host 填 `https://api.nextapi.top`
   - Create path 填 `/v1/videos`
   - Poll path 填 `/v1/videos/{id}`
7. Headers 必填：
   - `Authorization: Bearer sk_...`
   - `Content-Type: application/json`
8. 创建视频用 `POST /v1/videos`，Body 必须是 JSON。
9. 保存创建响应里的 `id`。
10. 轮询 `GET /v1/videos/{id}`，或使用 `GET /v1/videos/{id}/wait?timeout=60`。
11. 只有 `status = succeeded` 且 `output.url` 或 `output.video_url` 有值，才算生成成功。

严格边界：

- 不要把 ByteDance、Seedance、ViMax 或其他上游 provider key 填给用户工具。
- 用户只使用 NextAPI 的 `sk_*`。
- 任务、计费、轮询、下载都必须继续走 NextAPI 现有网关。

## 2. Universal REST configuration

Tools that can send arbitrary HTTP requests can drive NextAPI video jobs with this two-step flow.

### Create video

```http
POST https://api.nextapi.top/v1/videos
Authorization: Bearer sk_...
Content-Type: application/json
```

```json
{
  "model": "seedance-2.0-pro",
  "input": {
    "prompt": "A cinematic product reveal",
    "duration_seconds": 5,
    "resolution": "720p"
  }
}
```

The create response should be HTTP `202` and include an `id`, `status`, and
`estimated_cost_cents`.

### Poll result

```http
GET https://api.nextapi.top/v1/videos/{id}
Authorization: Bearer sk_...
```

Poll until:

- `status` is `succeeded`
- `output.url` or `output.video_url` is present

Use a short, low-cost test before building a large workflow.

## 3. 字段照填表

| 字段 | 填写值 |
|------|--------|
| Base URL / 基址 | `https://api.nextapi.top/v1` |
| Fallback root / 根地址 | `https://api.nextapi.top` |
| Create path / 创建路径 | `POST /v1/videos` |
| Poll path / 轮询路径 | `GET /v1/videos/{id}` |
| Wait path / 长轮询路径 | `GET /v1/videos/{id}/wait?timeout=60` |
| Authorization | `Bearer sk_...` |
| Content-Type | `application/json` |
| Models / 模型 | `seedance-2.0-pro`, `seedance-2.0-fast`, `seedance-v2-pro` |

## 4. Tool setup matrix

| Tool | How it can accept NextAPI | Configuration | Status |
|------|---------------------------|---------------|--------|
| **ComfyUI** | Trusted HTTP/API request custom node. Core ComfyUI does not currently ship a native NextAPI provider. | Add a trusted HTTP/API request custom node, call `POST /v1/videos`, store the returned `id`, then poll `GET /v1/videos/{id}`. | Integration path available; packaged NextAPI node pending. |
| **n8n** | Built-in **HTTP Request** node. | Method `POST`, URL `https://api.nextapi.top/v1/videos`, bearer/header auth, JSON body, then a second HTTP Request node to poll the returned id. | Good fit for automation workflows. |
| **Make** | Built-in **HTTP** app / "Make a request". | Set URL, method, `Authorization` and `Content-Type` headers, raw JSON body, then chain a polling request. | Good fit for no-code workflows. |
| **Dify** | Custom tool / OpenAPI schema. | Define `POST /v1/videos` and `GET /v1/videos/{id}` in an OpenAPI tool, then configure bearer-token auth with the NextAPI key. | Good fit for AI app builders; video UX depends on workflow design. |
| **AI-CanvasPro** | User-installed upstream only; generic provider fields may exist for some model types. | Install from the official GitHub repo. Try base URL `https://api.nextapi.top/v1` and `sk_...` only in local/trusted installs. | NextAPI does not distribute it. Its video adapter is not verified with `/v1/videos` yet. |
| **Runway / Pika / Luma / Kling / Canva-style hosted editors** | No generic NextAPI key path verified. | Only use if the product exposes custom HTTP, OpenAPI, or OpenAI-compatible provider settings. | Not enough evidence; most hosted editors hardcode their own providers. |

## 5. 按工具配置

### ComfyUI

当前不是“在原生 ComfyUI 设置里填 NextAPI key”。严格做法：

1. 只使用本地或你信任的 ComfyUI 安装。
2. 安装可信 HTTP/API Request 自定义节点。
3. 添加创建请求节点：
   - method: `POST`
   - URL: `https://api.nextapi.top/v1/videos`
   - header: `Authorization: Bearer sk_...`
   - header: `Content-Type: application/json`
   - body: 上文 JSON payload
4. 保存返回的 `id`。
5. 添加查询请求节点：
   - method: `GET`
   - URL: `https://api.nextapi.top/v1/videos/{id}`
   - header: `Authorization: Bearer sk_...`
6. 成功后读取 `output.url`；如果响应里只有 `output.video_url`，也可以作为下载地址。

这不是一个已经打包好的原生 ComfyUI 节点。NextAPI 后续应该做自己的 ComfyUI custom
node，作为销售资产和更低门槛的接入方案。

### n8n

1. 在 n8n 创建 Header Auth credential。
2. Header Name 填 `Authorization`。
3. Header Value 填 `Bearer sk_...`。
4. 添加 HTTP Request node。
5. Method 选 `POST`。
6. URL 填 `https://api.nextapi.top/v1/videos`。
7. Body Content Type 选 JSON，Body 填 `model` 和 `input`。
8. 添加第二个 HTTP Request node 查询 `https://api.nextapi.top/v1/videos/{{$json.id}}`。
9. `status = succeeded` 后把 `output.url` 传给下载、存储或通知节点。

### Make

1. 添加 HTTP app，选择 **Make a request**。
2. Method 选 `POST`。
3. URL 填 `https://api.nextapi.top/v1/videos`。
4. Headers 填：
   - `Authorization: Bearer sk_...`
   - `Content-Type: application/json`
5. Body type 选 Raw，Content type 选 JSON。
6. 粘贴请求体。
7. 用后续 HTTP 模块轮询 `GET /v1/videos/{id}`。
8. `status = succeeded` 后再读取 `output.url`。

### Dify

1. 在 Dify 工作区创建 Custom tool。
2. 导入或手写 OpenAPI schema，至少定义：
   - `POST /v1/videos`
   - `GET /v1/videos/{id}`
3. 认证方式选择 Bearer token。
4. Token 填 NextAPI 的 `sk_*`。
5. 工作流里先调用创建视频工具，保存 `id`。
6. 再调用查询工具轮询结果，并把 `output.url` 返回给用户。

## 6. 验收检查

- `POST /v1/videos` 返回 HTTP `202`。
- 响应里有 `id`、`status`、`estimated_cost_cents`。
- `GET /v1/videos/{id}` 使用同一个 `sk_*`。
- 先跑短任务：`720p`、`5` 秒、短提示词。
- 成功标准是 `status = succeeded` 且 `output.url` 或 `output.video_url` 可访问。

## 7. 常见问题

| 错误 | 处理 |
|------|------|
| `401 / unauthorized` | key 缺失、复制不完整、Bearer 前缀漏写，或 key 已撤销。重新创建并替换。 |
| `402 / insufficient_credits` | 账户余额不足或预算限制触发。先充值或调低测试任务规模。 |
| `404 / not_found` | 轮询 id 写错，或使用了其他账号的 key。创建和查询必须使用同一个 NextAPI key。 |
| `422 / invalid_request` | JSON 字段不符合 OpenAPI。确认 `model`、`input.prompt`、`duration_seconds`、`resolution`。 |
| 一直 `queued` / `running` | 视频任务是异步的。先用 5 秒、720p 测试；自动化工具里加等待或使用 `/wait`。 |

## 8. AI-CanvasPro note

AI-CanvasPro 是阿硕的第三方本地节点画布。它是 Source Available / non-commercial：

- 用户可自行从 [github.com/ashuoAI/AI-CanvasPro](https://github.com/ashuoAI/AI-CanvasPro) 安装。
- NextAPI 不分发、不镜像、不修改、不白标它。
- 不要使用非官方托管镜像。
- 它的通用模型配置可能对部分模型类型有帮助，但我们尚未验证它的视频生成节点兼容
  NextAPI 的 `/v1/videos`。

如果 NextAPI 想打包或白标 AI-CanvasPro，必须先获得上游作者的书面商业授权。

## 9. Security warnings

- 只把 key 填入你信任的工具。
- 优先使用本地工具或你自己控制账号里的自动化平台。
- 不要把 key 填入非官方托管镜像。
- 怀疑泄露时立刻轮换：app.nextapi.top -> API Keys -> revoke old key -> create a new key。
- 新工具先用短任务、低成本参数测试。

## 10. What NextAPI should build next

- A dedicated **ComfyUI custom node** for NextAPI video jobs.
- An **n8n workflow template** with create + poll + download steps.
- A **Make scenario template** with the same two-step video flow.
- A **Dify OpenAPI tool schema** users can import.
- Our own **NextCut** (Desktop App): fill key, write prompt, upload image, generate video.

These assets are safer and more useful than promising broad "OpenAI-compatible" support that only
covers chat clients.

## References

- [ComfyUI custom nodes](https://docs.comfy.org/development/core-concepts/custom-nodes)
- [n8n HTTP Request node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Make HTTP app](https://apps.make.com/http)
- [Dify workspace tools](https://docs.dify.ai/en/use-dify/workspace/tools)
- [AI-CanvasPro upstream](https://github.com/ashuoAI/AI-CanvasPro)
