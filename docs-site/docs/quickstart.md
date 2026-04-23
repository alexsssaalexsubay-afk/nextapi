---
title: Quick Start
sidebar_label: Quick Start
description: Generate your first video in under 10 minutes with NextAPI Batch Studio.
---

# Quick Start

**Time to first video: ~10 minutes.**

This guide uses **Batch Studio** — a local app that handles everything without writing code. You upload a CSV, click a button, and videos land in a folder on your machine.

---

## Before you begin

You need three things:

| Requirement | Where to get it |
|-------------|-----------------|
| API key (`sk_live_…`) | [app.nextapi.top](https://app.nextapi.top) → **Keys → New key** |
| Python 3.11+ | [python.org/downloads](https://python.org/downloads) |
| Enough credits | Dashboard → **Billing** (each 5-second shot ≈ 1–2 credits) |

---

## Step 1 — Install Batch Studio

Open a terminal. Run these four commands:

```bash
cd toolkit/batch_studio
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

Streamlit prints a URL like `http://localhost:8501`. Open it in your browser.

:::tip Keep the tab open
The browser tab must stay open for the duration of any batch run. Closing it cancels the batch.
:::

---

## Step 2 — Connect your API key

In the **left sidebar**, find the **Connection** section:

- **API Endpoint** — leave as `https://api.nextapi.top` (don't change this unless told to)
- **API Key (sk_live_…)** — paste your key here

The status indicator turns **green** when the key is recognised.

:::warning Never share your key
Treat it like a password. Don't paste it in Slack, email, or screenshots. If it leaks, go to the dashboard and rotate it immediately.
:::

---

## Step 3 — Upload the sample manifest

A 15-shot sample manifest is included at:

```
toolkit/batch_studio/sample_data/shot_manifest.csv
```

In the **Batch** tab, drag this file onto the upload area (or click to browse). You'll see:

- A manifest preview table — 15 rows, one per shot
- A stats bar: **15 shots · 5 continuity groups · 0 ref images staged**
- The manifest organised by episode and scene

This sample covers two drama episodes and one ecommerce product sequence, so it exercises the full range of features.

---

## Step 4 — Run a Quick Test (3 shots)

Before committing the full batch, click **⚡ Quick Test (3 shots)**.

This submits only the first three rows — a fast check that:

1. Your API key is valid and accepted
2. The endpoint is reachable
3. The API returns sensible job IDs and video URLs
4. Downloads land in your output folder

A Quick Test typically finishes in **2–5 minutes**.

When you see three `💾 Downloaded` rows in the results table, you're confirmed live.

---

## Step 5 — Run the full batch

Click **▶ Start Full Batch**.

Watch the results table fill in. Each shot moves through these states:

| Status | Meaning |
|--------|---------|
| ⏳ Pending | Waiting to be submitted |
| 📤 Queued | Submitted — waiting in the provider queue |
| 🎬 Rendering | Generation in progress |
| 💾 Downloaded | Finished, MP4 saved to your output folder |
| ❌ Failed | Failed — see error code and message in the table |

A 15-shot batch at the default concurrency of 5 typically takes **5–15 minutes**.

---

## Where are my videos?

Output files are saved to:

```
output/
└── batch_20260423_143022/
    ├── ep01_s01_001.mp4
    ├── ep01_s01_002.mp4
    ├── ep01_s01_003.mp4
    ├── ...
    └── result_manifest.csv
```

Each batch creates a timestamped folder. Inside you'll find the MP4s (named by `shot_id`) and a `result_manifest.csv` with the full job record.

---

## Step 6 — Handle failures

If any rows show `❌ Failed`:

1. Read the **Error** and **Detail** columns in the results table
2. Fix the root cause (see the table below)
3. Click **🔁 Retry Failed** — it re-runs only the failed rows

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `401 unauthorised` | Wrong or expired API key | Re-issue in the dashboard |
| `402 insufficient balance` | Out of credits | Add credits in dashboard → Billing |
| `429 rate limit` | Too many parallel requests | Lower **Parallel shots** to 2–3 |
| Reference not found | Image filename mismatch | Upload the image in the sidebar or use an `https://` URL in the CSV |
| `content_policy.pre` | Prompt flagged | Soften the wording |

---

## Quick reference

```bash
# Launch Batch Studio
cd toolkit/batch_studio && streamlit run app.py

# Or set env vars so you don't re-paste the key every time
export NEXTAPI_KEY=sk_live_yourkey
export NEXTAPI_BASE_URL=https://api.nextapi.top
streamlit run app.py
```

---

## What's next

Now that your pipeline is confirmed working, build your own manifest:

| Goal | Guide |
|------|-------|
| Build a production CSV manifest | [Batch Guide](/batch-guide) |
| Keep characters consistent across 100 shots | [Character Consistency](/consistency-guide) |
| Full short drama production workflow | [Short Drama Workflow](/short-drama-workflow) |
| Use the API in Python, curl, or Postman | [API Keys](/api-key-guide) |
| Call the API directly | [API Reference](/api-reference) |
