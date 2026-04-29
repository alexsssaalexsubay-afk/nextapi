# Use your NextAPI key in third-party creation tools

NextAPI sells API access. Some users will prefer to bring their own creation surface instead of using
our dashboard. This guide lists concrete third-party/local tools that can accept a NextAPI key directly
or indirectly, plus the exact configuration pattern.

## 1. Get your NextAPI key

1. Sign in at [app.nextapi.top](https://app.nextapi.top).
2. Open **API Keys**.
3. Click **Create key**, give it a name such as `comfyui-local`, and copy the `sk_...` value.
4. The full key is shown only once. Store it safely.

Your key is tied to your account credits. Anyone with the key can spend those credits.

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

### Poll result

```http
GET https://api.nextapi.top/v1/videos/{id}
Authorization: Bearer sk_...
```

Poll until `status` is `succeeded` and `output.url` is present. Use a short, low-cost test before
building a large workflow.

## 3. Tool setup matrix

| Tool | How it can accept NextAPI | Configuration | Status |
|------|---------------------------|---------------|--------|
| **ComfyUI** | Through trusted custom HTTP/API request nodes. Core ComfyUI does not currently ship a native NextAPI provider. | Add a custom HTTP/API request node, call `POST /v1/videos` with `Authorization: Bearer sk_...`, then poll `GET /v1/videos/{id}`. | Integration path available; we still need a packaged preset/custom node. |
| **n8n** | Built-in **HTTP Request** node. | Method `POST`, URL `https://api.nextapi.top/v1/videos`, bearer/header auth, JSON body, then a second HTTP Request node to poll the returned id. | Good fit for automation workflows. |
| **Make** | Built-in **HTTP** app / "Make a request". | Set URL, method, `Authorization` and `Content-Type` headers, raw JSON body, then chain a polling request. | Good fit for no-code workflows. |
| **Dify** | Custom tool / OpenAPI schema. | Define `POST /v1/videos` and `GET /v1/videos/{id}` in an OpenAPI tool, then configure bearer-token auth with the NextAPI key. | Good fit for AI app builders; video UX depends on workflow design. |
| **AI-CanvasPro** | User-installed upstream only; generic OpenAI-compatible provider settings appear available for some model types. | Install from the official GitHub repo. Try base URL `https://api.nextapi.top/v1` and `sk_...` only in local/trusted installs. | NextAPI does not distribute it. Its video adapter is not verified with `/v1/videos` yet. |
| **Runway / Pika / Luma / Kling / Canva-style hosted editors** | No generic NextAPI key path verified. | Only use if the product exposes custom HTTP, OpenAPI, or OpenAI-compatible provider settings. | Not enough evidence; most hosted editors hardcode their own providers. |

## 4. ComfyUI notes

ComfyUI is the closest "creative workbench" pattern, but the safe NextAPI path is currently:

1. Use a trusted custom node that can make HTTP requests.
2. Configure the create request:
   - method: `POST`
   - URL: `https://api.nextapi.top/v1/videos`
   - header: `Authorization: Bearer sk_...`
   - header: `Content-Type: application/json`
   - body: the JSON payload above
3. Store the returned `id`.
4. Use another request node to poll `GET https://api.nextapi.top/v1/videos/{id}`.
5. Feed `output.url` into the next node once the job succeeds.

This is not the same as a polished native ComfyUI node. A dedicated NextAPI ComfyUI custom node is a
good future sales asset, but it should be written by us or built on permissively licensed examples.

## 5. AI-CanvasPro note

AI-CanvasPro is a local node-based AI canvas by 阿硕. It is Source Available / non-commercial:

- Users install it themselves from [github.com/ashuoAI/AI-CanvasPro](https://github.com/ashuoAI/AI-CanvasPro).
- NextAPI does not distribute, mirror, modify, or white-label it.
- Do not use unofficial hosted mirrors.
- Its generic OpenAI-compatible settings may help with some model types, but we have not verified
  that its video generation node works with NextAPI's `/v1/videos` endpoint.

If NextAPI wants to bundle or white-label AI-CanvasPro, get written commercial permission first.

## 6. Security warnings

- Only paste your key into tools you trust.
- Prefer local-only tools or tools running inside accounts you control.
- Never paste your key into unofficial hosted mirrors.
- Rotate the key if exposed: app.nextapi.top -> API Keys -> revoke old key -> create a new key.
- Start with short/cheap jobs while testing a new tool.

## 7. What NextAPI should build next

- A dedicated **ComfyUI custom node** for NextAPI video jobs.
- An **n8n workflow template** with create + poll + download steps.
- A **Make scenario template** with the same two-step video flow.
- A **Dify OpenAPI tool schema** users can import.
- Our own **Creator Kit**: fill key, write prompt, upload image, generate video.

These assets are safer and more useful than promising broad "OpenAI-compatible" support that only
covers chat clients.

## References

- [ComfyUI custom nodes](https://docs.comfy.org/development/core-concepts/custom-nodes)
- [n8n HTTP Request node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Make HTTP app](https://apps.make.com/http)
- [Dify workspace tools](https://docs.dify.ai/en/use-dify/workspace/tools)
- [AI-CanvasPro upstream](https://github.com/ashuoAI/AI-CanvasPro)
