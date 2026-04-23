---
title: API Reference
sidebar_label: API Reference
description: Complete reference for POST /v1/video/generations and GET /v1/jobs/id.
---

# API Reference

NextAPI exposes two endpoints for video generation:

- **`POST /v1/video/generations`** — Submit a generation job
- **`GET /v1/jobs/{id}`** — Poll job status

All requests require a Bearer token in the `Authorization` header.

---

## Authentication

```http
Authorization: Bearer sk_live_yourkey
```

Every request must include this header. Requests without it return `401 Unauthorized`.

---

## POST /v1/video/generations

Submit a new video generation job. Returns immediately with a `job_id` — generation happens asynchronously.

```
POST /v1/video/generations
```

### Request body

```json
{
  "prompt": "Lin Yue walks into the cafe, soft morning light",
  "duration": 5,
  "aspect_ratio": "16:9",
  "negative_prompt": "watermark, distorted face, extra fingers",
  "camera": "medium tracking shot",
  "motion": "slow walk-in then pause",
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

### Request fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | ✅ | English generation prompt. Minimum 4 characters; 30–200 words recommended. |
| `duration` | integer | ✅ | Length of video in seconds. Range: 2–12. |
| `aspect_ratio` | string | ✅ | `16:9` · `9:16` · `1:1` · `4:3` · `3:4` · `21:9` |
| `negative_prompt` | string | — | Elements to exclude. Comma-separated phrases. |
| `camera` | string | — | Camera framing and movement description. |
| `motion` | string | — | Subject movement description. |
| `references` | object | — | Reference images/videos (see sub-fields below). |
| `metadata` | object | — | Passed through; used for continuity grouping. |

### References sub-fields

| Field | Type | Description |
|-------|------|-------------|
| `character_image_url` | string (URL) | Reference image for character appearance |
| `outfit_image_url` | string (URL) | Reference image for outfit/costume |
| `scene_image_url` | string (URL) | Reference image for background/location |
| `reference_video_url` | string (URL) | Reference video for motion or style |

All reference values must be fully qualified `https://` URLs. Local file paths are not accepted by the API directly — use Batch Studio or the ComfyUI Asset Resolver node to handle uploads.

### Response — 200 OK

```json
{
  "id": "job_a3k9m2x1",
  "status": "queued",
  "estimated_credits": 12
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Job ID — use this to poll status |
| `status` | string | Initial status, always `queued` on creation |
| `estimated_credits` | integer | Estimated credit cost; actual cost settled on completion |

### Error responses

| HTTP status | Error code | Meaning |
|-------------|-----------|---------|
| `400` | `invalid_request` | Missing required field or invalid value |
| `400` | `content_policy.pre` | Prompt blocked by pre-generation moderation |
| `401` | `unauthorized` | Missing or invalid API key |
| `402` | `insufficient_balance` | Org has no credits |
| `429` | `rate_limit_exceeded` | Key's RPM exceeded |
| `5xx` | — | Server or provider error — retry with backoff |

### Examples

**curl:**

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

**Python:**

```python
import requests

resp = requests.post(
    "https://api.nextapi.top/v1/video/generations",
    headers={"Authorization": "Bearer sk_live_yourkey"},
    json={
        "prompt": "Lin Yue walks into the cafe, soft morning light from the left",
        "duration": 5,
        "aspect_ratio": "16:9",
        "negative_prompt": "watermark, distorted face",
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

Poll the status of a generation job.

```
GET /v1/jobs/{id}
```

### Path parameters

| Parameter | Description |
|-----------|-------------|
| `id` | Job ID returned by the generation endpoint |

### Response — 200 OK

```json
{
  "id": "job_a3k9m2x1",
  "status": "succeeded",
  "video_url": "https://storage.nextapi.top/videos/job_a3k9m2x1.mp4?token=...",
  "error_code": null,
  "error_message": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Job ID |
| `status` | string | Current status — see lifecycle below |
| `video_url` | string \| null | Signed URL to the generated video. Present only when `status = succeeded`. **Expires after 24 hours.** |
| `error_code` | string \| null | Machine-readable error code if failed |
| `error_message` | string \| null | Human-readable error description if failed |

### Job status lifecycle

```
queued  →  running  →  succeeded
                    ↘  failed
```

| Status | Meaning |
|--------|---------|
| `queued` | Accepted and waiting in the provider queue |
| `running` | Generation actively in progress |
| `succeeded` | Finished — `video_url` is populated |
| `failed` | Failed — `error_code` and `error_message` are populated |

**Recommended polling interval:** 4 seconds. Polling more frequently than every 2 seconds provides no benefit and counts against your RPM.

### Examples

**curl:**

```bash
curl https://api.nextapi.top/v1/jobs/job_a3k9m2x1 \
  -H "Authorization: Bearer sk_live_yourkey"
```

**Python polling loop:**

```python
import time
import requests

headers = {"Authorization": "Bearer sk_live_yourkey"}
job_id = "job_a3k9m2x1"

while True:
    resp = requests.get(
        f"https://api.nextapi.top/v1/jobs/{job_id}",
        headers=headers,
    )
    data = resp.json()
    print(f"Status: {data['status']}")

    if data["status"] == "succeeded":
        print(f"Video: {data['video_url']}")
        break
    elif data["status"] == "failed":
        print(f"Failed: {data['error_code']} — {data['error_message']}")
        break

    time.sleep(4)
```

---

## Rate limits

| Default | Description |
|---------|-------------|
| 30 RPM | Requests per minute per key |
| 5 concurrent | Max parallel in-flight generations per key |

Both limits are configurable in the dashboard → **Keys → Edit**. If you consistently hit rate limits with production workloads, request an increase.

---

## Credit accounting

- Credits are **reserved** when a job enters `queued` state.
- If a job fails, reserved credits are **refunded**.
- Final settlement uses actual generation cost, which may differ slightly from `estimated_credits`.
- Credit balance is visible in the dashboard → **Billing**.
