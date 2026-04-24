---
title: API Keys
sidebar_label: API Keys
description: How to use your NextAPI key in Batch Studio, ComfyUI, Python, curl, and Postman — plus security and multi-key strategy.
---

# API Keys

Your API key (`sk_live_…`) is the credential that authenticates every request to the NextAPI. This page covers where to put it in each tool you might use, how to keep it safe, and what to do when things go wrong.

---

## Get your key

Go to [app.nextapi.top](https://app.nextapi.top) → **Keys → New key**.

Give it a name you'll recognise (e.g. `batch-studio-prod`, `comfyui-dev`). Copy the key immediately — it's only shown once.

:::danger One-time display
The full key is shown only when you create it. After that, the dashboard shows only the prefix. If you lose it, rotate it.
:::

---

## Using your key in Batch Studio

**Sidebar → Connection → API Key (sk_live_…)**

Paste your key there. It's stored only in your browser's session memory — not on disk, not sent to any server other than `api.nextapi.top`.

**Avoid re-pasting on every restart** by setting an environment variable before launching:

```bash
export NEXTAPI_KEY=sk_live_yourkey
export NEXTAPI_BASE_URL=https://api.nextapi.top
streamlit run app.py
```

Batch Studio reads these automatically and pre-fills the fields.

---

## Using your key in ComfyUI

### Option A: Paste directly in the Auth node

Open the **NextAPI · Auth** node → **api_key** field → paste your key.

This works but means the key is stored in your workflow JSON. Don't commit that file to a public repository.

### Option B: Set an environment variable (recommended)

```bash
export NEXTAPI_KEY=sk_live_yourkey
```

Restart ComfyUI. The Auth node reads `NEXTAPI_KEY` automatically if the field is left blank.

**On Windows:**

```cmd
set NEXTAPI_KEY=sk_live_yourkey
```

Or add it to **System Properties → Environment Variables** for persistence.

---

## Using your key in Python

### Synchronous (requests)

```python
import requests

API_KEY = "sk_live_yourkey"     # or: os.getenv("NEXTAPI_KEY")
BASE_URL = "https://api.nextapi.top"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Create a video (primary API: nested input)
resp = requests.post(
    f"{BASE_URL}/v1/videos",
    json={
        "model": "seedance-2.0-pro",
        "input": {
            "prompt": "Lin Yue walks into the cafe, soft morning light",
            "duration_seconds": 5,
            "resolution": "1080p",
            "aspect_ratio": "16:9",
        },
    },
    headers=headers,
    timeout=30,
)
resp.raise_for_status()
video = resp.json()
print(
    f"ID: {video['id']}  object={video.get('object')}  "
    f"estimated USD cents: {video.get('estimated_cost_cents')}"
)

# Poll for completion
import time
while True:
    r = requests.get(f"{BASE_URL}/v1/videos/{video['id']}", headers=headers)
    data = r.json()
    print(f"Status: {data['status']}")
    if data["status"] in ("succeeded", "failed", "cancelled"):
        break
    time.sleep(4)

if data["status"] == "succeeded":
    out = data.get("output") or {}
    print(f"Video URL: {out.get('video_url')}")
else:
    print(f"Failed: {data.get('error_code')} — {data.get('error_message')}")
```

### Asynchronous (aiohttp)

```python
import asyncio
import aiohttp
import os

API_KEY = os.getenv("NEXTAPI_KEY")
BASE_URL = "https://api.nextapi.top"

async def generate_and_poll(prompt: str) -> str | None:
    headers = {"Authorization": f"Bearer {API_KEY}"}
    async with aiohttp.ClientSession(headers=headers) as session:
        # Submit
        async with session.post(
            f"{BASE_URL}/v1/videos",
            json={
                "model": "seedance-2.0-pro",
                "input": {
                    "prompt": prompt,
                    "duration_seconds": 5,
                    "aspect_ratio": "16:9",
                },
            },
        ) as resp:
            v = await resp.json()
            vid = v["id"]

        # Poll
        while True:
            async with session.get(f"{BASE_URL}/v1/videos/{vid}") as resp:
                data = await resp.json()
            if data["status"] == "succeeded":
                out = data.get("output") or {}
                return out.get("video_url")
            if data["status"] == "failed":
                print(f"Error: {data.get('error_code')}")
                return None
            await asyncio.sleep(4)

video_url = asyncio.run(generate_and_poll("Lin Yue walks into the cafe"))
print(video_url)
```

:::tip Use the toolkit client
`toolkit/batch_studio/api_client.py` is a production-ready async client with retry logic, backoff, and download support. Import it directly in your scripts:

```python
from api_client import ClientConfig, NextAPIClient

cfg = ClientConfig(base_url="https://api.nextapi.top", api_key="sk_live_…")
async with NextAPIClient(cfg) as client:
    resp = await client.submit_generation(
        {
            "model": "seedance-2.0-pro",
            "input": {
                "prompt": "...",
                "duration_seconds": 5,
                "aspect_ratio": "16:9",
            },
        }
    )
```
:::

---

## Using your key with curl

Submit a generation job:

```bash
curl -X POST https://api.nextapi.top/v1/videos \
  -H "Authorization: Bearer sk_live_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "Lin Yue walks into the cafe, soft morning light",
      "duration_seconds": 5,
      "aspect_ratio": "16:9"
    }
  }'
```

Poll video status:

```bash
curl https://api.nextapi.top/v1/videos/vid_abc123 \
  -H "Authorization: Bearer sk_live_yourkey"
```

To store the key in a shell variable instead of repeating it:

```bash
export NEXTAPI_KEY=sk_live_yourkey

curl -X POST https://api.nextapi.top/v1/videos \
  -H "Authorization: Bearer $NEXTAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"seedance-2.0-pro","input":{"prompt":"...","duration_seconds":5,"aspect_ratio":"16:9"}}'
```

---

## Using your key in Postman

1. Create a new request → **POST** → `https://api.nextapi.top/v1/videos`
2. Go to **Authorization** tab → Type: **Bearer Token** → paste your key
3. Go to **Body** tab → **raw** → **JSON**
4. Paste the request body:

```json
{
  "model": "seedance-2.0-pro",
  "input": {
    "prompt": "Lin Yue walks into the cafe, soft morning light",
    "duration_seconds": 5,
    "aspect_ratio": "16:9"
  }
}
```

5. Click **Send**

**To poll status:**  
Duplicate the request → change method to **GET** → URL to `https://api.nextapi.top/v1/videos/{id}` → replace `{id}` with the `id` from the `202` response.

---

## Multi-key strategy

### When to use multiple keys

| Scenario | Recommendation |
|----------|---------------|
| Production vs development/testing | Always separate — one key per environment |
| Multiple team members | One key per person, or one per project |
| Different rate limits for different batches | Create keys with different `rate_limit_rpm` settings |
| A client gets their own API access | Create a key scoped to their org |

### Naming your keys

In the dashboard, name keys descriptively:

```
batch-studio-prod
comfyui-dev
ci-test-runner
client-acme-corp
```

You'll thank yourself when you need to rotate one without touching the others.

### Key rotation

1. In the dashboard, create a **new key** with the same or updated settings
2. Update the new key in each tool (env var, Batch Studio, ComfyUI, etc.)
3. **Test the new key works** (Quick Test a small batch)
4. **Revoke the old key** in the dashboard

Never delete the old key before confirming the new one works.

### Never mix production and test keys

- Production key: real credits, real API calls, real data
- Test key: lower rate limits, for development and experimentation only

Accidentally running a 500-shot batch with the wrong key environment wastes money and can confuse billing.

---

## Security guidelines

### DO
- Store keys in environment variables or a `.env` file
- Add `.env` to `.gitignore`
- Rotate keys every 90 days or when you suspect exposure
- Create separate keys for separate projects

### DON'T
- Hard-code keys in source code files
- Commit keys to any Git repository (public or private)
- Paste keys in screenshots, Slack, email, or issue trackers
- Share keys between multiple people who each need independent access

**If you see your key in a `.git log`, in a screenshot, or anywhere you didn't intend:**

1. Go to the dashboard immediately
2. Revoke the exposed key
3. Create a new key
4. Update all tools with the new key

---

## Troubleshooting key issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `401 Unauthorized` | Key is wrong, revoked, or malformed | Verify the key starts with `sk_live_`; re-issue if needed |
| `401` even with a correct-looking key | Pasted with leading/trailing space | Re-paste carefully; use env var to avoid clipboard issues |
| `402 Insufficient balance` | Org has no credits | Add credits in dashboard → Billing |
| `429 Too Many Requests` | Key's RPM limit exceeded | Lower concurrency; or raise the key's `rate_limit_rpm` in the dashboard |
| Key accepted in curl but not in Batch Studio | Environment variable conflict | Check `NEXTAPI_KEY` env var isn't pointing to an old key |
| Lost the key | Dashboard only shows prefix after creation | Rotate: create new, update tools, revoke old |
