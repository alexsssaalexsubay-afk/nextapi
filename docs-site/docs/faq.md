---
title: FAQ
sidebar_label: FAQ
description: Frequently asked questions about NextAPI video generation.
---

# FAQ

---

## General

### What is NextAPI?

NextAPI is a video generation gateway built on top of Seedance. It handles authentication, billing, rate limiting, and reference-image management so you can focus on generating videos instead of managing infrastructure.

### What kind of videos can I generate?

Short-form vertical (9:16), standard horizontal (16:9), and square (1:1) videos, from 2 to 12 seconds per clip. Primary use cases:
- Short drama and series production
- E-commerce product showcase videos
- Social media content at scale

### Do I need a GPU or special hardware?

No. Generation runs on remote infrastructure. You only need an internet connection and an API key.

### What languages can I use in prompts?

English prompts (`prompt_en`) produce the most consistent results. Chinese prompts are supported via `prompt_cn` in the manifest, used as a fallback when `prompt_en` is empty.

---

## Pricing and Credits

### How are credits calculated?

Each video costs credits based on duration and complexity. A 5-second standard shot at default quality typically costs **1–2 credits**. The API returns `estimated_credits` when you submit, and settles the actual amount on completion.

### What happens if a job fails?

Reserved credits are refunded. Failed jobs don't cost credits.

### Do credits expire?

Credits are tied to your organisation account and don't expire under normal circumstances. Check your dashboard for specific terms.

### Can I test without spending production credits?

Use the `Quick Test (3 shots)` feature in Batch Studio to run a minimal test. 3 shots cost 3–6 credits. This is intended as a connection and quality check, not free generation.

---

## Generation Quality

### How consistent is character appearance across shots?

With a good reference image and consistent prompting (fixed physical traits in every prompt + `continuity_group`), character appearance is **highly consistent within a sequence**. Across different shooting sessions or days, you may notice minor variations.

:::caution Consistency is high but not perfect
The model does not lock a character identity the way human actors do. Always include physical descriptors (hairstyle, distinguishing marks, distinctive clothing details) in every prompt alongside the reference image.
:::

### Why does the character look different in some shots?

Common causes:
1. **Inconsistent prompt** — the character description changed between rows (e.g. different hairstyle wording)
2. **Weak reference image** — blurry, small, or heavily cropped reference reduces adherence
3. **Conflicting descriptions** — prompt says "short hair" but reference image shows long hair
4. **Continuity group not set** — shots that should share context are in separate groups or no group at all

Fix: standardise the physical descriptor text across your manifest. Create a `character_bible.csv` as a single source of truth.

### What's the recommended reference image format?

- **Format:** JPG or PNG
- **Size:** 512×512 minimum; 1024×1024 or larger recommended
- **Content:** Clear, front-facing, well-lit. No crowds, no heavy cropping, no text overlays.
- **Clothing:** Use a dedicated `outfit_ref` image if you want specific costume consistency. Don't rely on the character reference image for outfit detail.

### Why is the output video blurry or low quality?

- Use a detailed, specific prompt — vague prompts produce vague output
- Avoid very short durations (2–3 seconds) for complex motion — the model has less time to establish the scene
- Check that your `negative_prompt` includes `low quality, blur`

---

## Batch Studio

### Can I run Batch Studio on a server or in CI?

Yes. Batch Studio is a Streamlit app, so it runs anywhere Python runs. For headless/CI use, call `api_client.py` and `batch_runner.py` directly in a Python script — they don't require the Streamlit UI.

### Where is my API key stored by Batch Studio?

Only in your browser's session state for the duration of the session. It's not written to disk or sent anywhere except `api.nextapi.top`.

### What happens if I close the browser tab mid-batch?

The batch stops. Jobs that were already submitted continue rendering on the server — their results can be retrieved if you know the job IDs. In-progress and pending jobs won't be submitted.

### Can I pause a batch and resume later?

Not in the current version. Plan your batches to run uninterrupted. For very large jobs (200+ shots), split into chunks of 50–100.

### My CSV has 500 rows. Will Batch Studio handle that?

Yes. There's no hard limit on manifest size. For very large batches, use concurrency 5–8 and expect the run to take 1–3 hours. Keep the machine awake and the browser tab open.

---

## ComfyUI

### Does the ComfyUI node package work offline?

No. Each node call makes an HTTP request to the NextAPI server. An internet connection is required.

### Can I use the ComfyUI nodes in a cloud ComfyUI instance?

Yes — set the `NEXTAPI_KEY` environment variable in the cloud instance's environment, or paste it directly into the Auth node. For cloud instances, be careful about workflow files containing the key in plain text.

### How many shots can I run in one ComfyUI workflow?

ComfyUI queues workflows serially (one queue item at a time by default). For more than ~5 shots, Batch Studio's async concurrency model is significantly faster.

---

## API

### Is there a webhook for job completion?

Not in the current public API. Poll `GET /v1/jobs/{id}` until the status is `succeeded` or `failed`. The recommended polling interval is every 4 seconds.

### Can I cancel a running job?

Cancellation is not currently supported. Once submitted, a job runs to completion (or failure). Credits for cancelled-by-provider jobs are refunded automatically.

### How long are video URLs valid?

`video_url` values from the API are signed and expire **24 hours** after generation. Download and store the video file on your own storage — don't rely on the URL staying valid.

### Is there a sandbox or mock mode?

For development and integration testing, set `NEXTAPI_BASE_URL` to a local mock server. The `toolkit/batch_studio/sample_data/` folder includes `README.md` instructions for running a lightweight Python mock server that returns fake job IDs and MP4 URLs.
