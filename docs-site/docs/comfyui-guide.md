---
title: ComfyUI Guide
sidebar_label: ComfyUI Guide
description: Install ComfyUI-NextAPI nodes, load example workflows, and generate videos from ComfyUI.
---

# ComfyUI Guide

The ComfyUI-NextAPI package adds five production nodes that let you call the NextAPI video generation API from any ComfyUI graph.

For **1–10 shots with per-shot tweaking**, ComfyUI is the right tool. For **50+ shots from a CSV**, use [Batch Studio](/batch-guide) instead.

---

## Install

```bash
cd ComfyUI/custom_nodes
cp -r /path/to/toolkit/comfyui_nextapi ./ComfyUI-NextAPI
pip install -r ComfyUI-NextAPI/requirements.txt
```

Restart ComfyUI. The five **NextAPI** nodes appear in the right-click menu.

---

## The five nodes

These nodes form a pipeline: **Auth → Asset Resolver → Generate Video → Poll Job → Download Result**.

### NextAPI · Auth

Bundles your API key and endpoint URL. Required upstream of every other node.

| Input | Default | Notes |
|-------|---------|-------|
| `base_url` | `https://api.nextapi.top` | Change only for staging/self-hosted |
| `api_key` | `$NEXTAPI_KEY` env var | Paste your `sk_live_…` key |
| `request_timeout_seconds` | 30 | Raise to 60 on slow connections |
| `max_retries` | 4 | Retries on 429 + 5xx with backoff |

:::tip Set an env var to avoid re-typing
```bash
export NEXTAPI_KEY=sk_live_your_key_here
```
Restart ComfyUI after setting it. The key is read automatically.
:::

### NextAPI · Asset Resolver

Converts local file paths or short IDs into fully-qualified `https://` URLs that the API requires.

- If the input already starts with `https://`, it passes through unchanged.
- If it's a local file path **and** you've set `upload_url`, the file is uploaded and the returned URL is used.
- Otherwise the value is passed through — useful when you've already hosted your refs.

Outputs: `character_url`, `outfit_url`, `scene_url`, `reference_video_url`.

### NextAPI · Generate Video

Submits **`POST /v1/video/generations`** (flat JSON body) — the bundled node targets this path for ComfyUI compatibility. If you call NextAPI from your own code, prefer **`POST /v1/videos`** with `model` + nested `input` (see the [API Reference](./api-reference)).

Key inputs: `prompt`, `duration` (2–12 s in the node; the gateway allows **2–15** s for `duration_seconds` when you use the API directly), `aspect_ratio`, and optional `character_url`, `outfit_url`, `scene_url` from the Asset Resolver.

Outputs: `job_id`, `estimated_credits`, `status` from the legacy create response.

### NextAPI · Poll Job

Blocks until the job reaches `succeeded` or `failed`. Outputs: `status`, `video_url`, `error_code`, `error_message`.

:::caution
This node runs synchronously on ComfyUI's worker thread. The UI appears unresponsive while polling. For large multi-shot batches, use Batch Studio.
:::

### NextAPI · Download Result

Streams the finished MP4 to `ComfyUI/output/<output_subdir>/`.

---

## Loading an example workflow

Two ready-made workflows ship with the package:

### `short_drama_consistent_character.json`

A single-shot drama workflow with full character + outfit + scene consistency wiring. Edit the prompt in the Generate Video node; everything else is pre-connected.

### `ecom_batch_creatives.json`

Two-shot ecommerce workflow — a full-body spin and a product close-up sharing the same character/outfit/studio reference.

**To load:**
1. ComfyUI → **Load** button (top-right)
2. Select the JSON from `toolkit/comfyui_nextapi/example_workflows/`

---

## Your first shot — step by step

1. Load `short_drama_consistent_character.json`
2. Open **NextAPI · Auth** → paste your `sk_live_…` key into `api_key`
3. Open **NextAPI · Asset Resolver** → replace the three `https://your-cdn.example.com/…` placeholder URLs with your actual reference image URLs
4. Open **NextAPI · Generate Video** → edit the prompt for your shot
5. Click **Queue Prompt**
6. After 30–90 seconds, the path to the downloaded MP4 appears on **NextAPI · Download Result**

---

## Reference assets in ComfyUI

You have three options for reference images:

**Option 1 (recommended): Pre-host your refs**  
Upload character/outfit/scene images to R2, S3, or any CDN. Paste the `https://` URLs directly into the Asset Resolver.

**Option 2: Local file with upload endpoint**  
Set `upload_url` in the Asset Resolver to your own upload endpoint (expected to return `{"url": "..."}`). The node uploads the local file and uses the returned URL.

**Option 3: Wire your own upload step**  
Add an upload node before the Asset Resolver and wire the URL output into it. The Asset Resolver passes any value through unchanged.

---

## Multi-shot workflow tips

To fan out 5–10 shots in ComfyUI:

1. Duplicate the **Generate → Poll → Download** trio for each shot
2. Wire the single **Auth** node to all Generate Video nodes via reroute nodes
3. Connect the same **Asset Resolver** outputs to all Generate nodes
4. Edit each prompt independently
5. **Queue Prompt** — ComfyUI fires all submissions roughly simultaneously

For 20+ shots, switch to Batch Studio. The CSV-driven approach is significantly more maintainable at scale.

---

## Environment variables

| Variable | Node | Purpose |
|----------|------|---------|
| `NEXTAPI_KEY` | Auth | Default API key |
| `NEXTAPI_BASE_URL` | Auth | Default base URL |
| `NEXTAPI_UPLOAD_URL` | Asset Resolver | Upload endpoint for local refs |
| `NEXTAPI_UPLOAD_KEY` | Asset Resolver | Bearer token for the upload endpoint |
