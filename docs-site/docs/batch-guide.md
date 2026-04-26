---
title: Batch Generation Guide
sidebar_label: Batch Guide
description: Build a shot manifest CSV, control concurrency, monitor progress, and retry failed shots.
---

# Batch Generation Guide

A **batch** is a list of video generation jobs defined in a CSV file. One row = one shot. Batch Studio submits them to the API, tracks progress, downloads results, and writes an audit trail — all from a single click.

---

## The shot manifest CSV

The manifest is the heart of any batch. Think of it as a shot list in a spreadsheet. You build it in Excel, Google Sheets, or any text editor, then upload it to Batch Studio.

### A minimal valid manifest

```csv
shot_id,prompt_en,duration,aspect_ratio
ep01_s01_001,"Lin Yue walks into the cafe, stops at the window, looks outside",5,16:9
ep01_s01_002,"Close-up of Lin Yue stirring her coffee, hair falls forward",4,16:9
ep01_s01_003,"Chen Mo enters the cafe, spots Lin Yue across the room",5,16:9
```

Three rows. Three shots. That's all you need to start.

### Required columns

Every manifest **must** have these four columns. Missing any one of them is a validation error.

| Column | Type | Constraints | Example |
|--------|------|-------------|---------|
| `shot_id` | text | Unique within the batch | `ep01_s01_001` |
| `prompt_en` | text | Min 10 characters recommended | `Lin Yue walks into the cafe...` |
| `duration` | number | 4–15 (seconds) | `5` |
| `aspect_ratio` | text | See options below | `16:9` |

**Supported aspect ratios:** `16:9` · `9:16` · `1:1` · `4:3` · `3:4` · `21:9`

Use `9:16` for vertical short-form (Douyin, TikTok, Reels). Use `16:9` for standard drama or widescreen.

### Optional columns — use what you need

| Column | Purpose |
|--------|---------|
| `episode`, `scene_id` | Organisational labels — not sent to the API |
| `continuity_group` | Keeps character/outfit/scene consistent across a sequence |
| `character_ref` | Filename or `https://` URL for the character reference image |
| `outfit_ref` | Filename or `https://` URL for the outfit reference image |
| `scene_ref` | Filename or `https://` URL for the background/scene reference image |
| `negative_prompt` | Things to exclude — e.g. `watermark, distorted face, blur` |
| `camera` | Camera framing — e.g. `medium tracking shot` |
| `motion` | Movement — e.g. `slow walk-in then pause` |
| `mood` | Tone — e.g. `calm intimate morning` |
| `prompt_cn` | Chinese prompt (fallback if `prompt_en` is empty) |

### A production-quality row

```csv
episode,scene_id,shot_id,continuity_group,character_id,character_ref,outfit_ref,scene_ref,prompt_en,camera,motion,mood,duration,aspect_ratio,negative_prompt
ep01,scene_cafe,ep01_s01_001,ep01_s01_lin_cafe,char_lin,char_lin.jpg,outfit_white_coat.jpg,cafe_morning.jpg,"Lin Yue, mole below left eye, pearl stud earrings — walks into the corner cafe and stops at the window-side table, turns toward camera with a soft expression",medium tracking shot,slow walk-in then pause and gaze,calm intimate morning,5,16:9,"distorted face, extra fingers, watermark, low quality"
```

The prompt starts with the character's fixed visual traits (`mole below left eye, pearl stud earrings`), then the action, camera, and mood. This is the pattern that produces the most consistent character appearances.

---

## Concurrency: how many shots run at once

**Parallel shots** (default: 5) is the number of generation jobs running at the same time. Think of each slot as a worker who takes one shot, submits it, waits for it to finish, then picks up the next.

```
Workers:  [Shot 1] [Shot 2] [Shot 3] [Shot 4] [Shot 5]  ← 5 parallel
          [Shot 6] [Shot 7] [Shot 8] ...                 ← next batch starts as slots free up
```

:::warning Start low
Always start at 5. Raising it too high hits your key's per-minute rate limit (RPM), causing 429 errors that slow the batch down more than a lower concurrency would have.
:::

**When to raise concurrency:**
- Your Quick Test showed no 429 errors
- The dashboard shows your key's RPM is set to 60+ (dashboard → Keys → Edit)
- You're running a 100+ shot batch and time matters

**Safe progression:** 5 → 8 → 12 → 15. Watch for 429 errors at each step.

---

## Step-by-step: your first 100-shot batch

### Step 1: Validate first

Click **🔍 Validate CSV** before running anything.

Batch Studio checks:
- All required columns are present
- `duration` is between 4 and 15 (seconds)
- `aspect_ratio` is a recognised value
- All `shot_id` values are unique
- Referenced images are either uploaded in the sidebar or use `https://` URLs

**Errors (red)** — rows dropped from the batch  
**Warnings (yellow)** — rows that will run but may not produce what you expect

Fix errors in your spreadsheet and re-upload. For warnings, decide whether to address them before running.

### Step 2: Quick Test — always do this

Click **⚡ Quick Test (3 shots)** before the full batch.

This costs 3 shots' worth of credits and takes 2–5 minutes. It confirms:
- Your key works
- References resolve correctly
- The first shots look visually correct before you commit to 100

:::tip The 30-minute rule
30 minutes on pre-flight saves hours of re-shooting. Don't skip Quick Test.
:::

### Step 3: Full batch

Click **▶ Start Full Batch**. Keep the browser tab open.

**Estimated times at concurrency = 5:**

| Shots | Estimate |
|-------|---------|
| 15 | 5–15 min |
| 50 | 15–30 min |
| 100 | 25–50 min |

Times vary by provider queue depth. During peak hours, expect 20–30% longer.

---

## Reading the live progress table

As the batch runs, the results table updates per shot:

| Column | What it tells you |
|--------|-------------------|
| **Shot ID** | Which row this is |
| **Status** | Current state (see below) |
| **Job ID** | Remote job ID — use this for support tickets |
| **Credits** | What the API estimated this shot costs |
| **File** | Filename of the downloaded MP4 once complete |
| **Error** | Short error code if failed |
| **Detail** | Plain-English explanation of the error |
| **Inherited** | Which fields were filled by continuity group inheritance |

**Status values:**

```
⏳ Pending → 📤 Queued → 🎬 Rendering → 💾 Downloaded
                                        ↘ ❌ Failed
```

A shot in `🎬 Rendering` is actively being generated by the provider. This is the longest phase — typically 20–90 seconds per shot.

---

## Retrying failed shots

When the batch finishes, check the summary metrics:
- ✅ Downloaded (success)
- ❌ Failed (needs attention)

For failures, the **Error** and **Detail** columns in the table explain what went wrong. Common causes and fixes:

| Error code | Plain-English meaning | Fix |
|------------|----------------------|-----|
| `http_401` | API key rejected | Re-issue key in dashboard |
| `http_402` | No credits left | Top up in dashboard → Billing |
| `http_429` | Too many requests | Lower **Parallel shots** and retry |
| `content_policy.pre` | Prompt blocked by moderation | Soften the wording |
| `timeout` | Job took longer than 15 min | Provider congestion — retry usually works |
| `no_video_url` | API said success but no video | Transient provider issue — retry |

**To retry:** Click **🔁 Retry Failed**. This creates a new batch folder and re-runs only the failed rows. Successful shots are never re-run.

You can retry as many times as needed.

---

## Output structure

Every run creates a timestamped folder:

```
output/
└── batch_20260423_143022/       ← timestamp of when the batch started
    ├── ep01_s01_001.mp4         ← named by shot_id
    ├── ep01_s01_002.mp4
    ├── ep01_s01_003.mp4
    ├── ecom_spin_001.mp4
    └── result_manifest.csv      ← full record of the run
```

**`result_manifest.csv`** — the audit trail. Contains every shot's `job_id`, `status`, `output_url`, `local_file_path`, `error_code`, and `error_message`. Export it with **⬇ Export Results** for handoff or archival.

---

## Best practices

### Write detailed prompts

More detail = more consistent output. Compare:

```
❌ "A woman walks into a cafe"
✅ "Lin Yue, mole below left eye, pearl stud earrings, off-white wool coat —
    walks into a sunlit corner cafe and stops at the window-side table,
    turns toward camera with a soft expression; medium tracking shot;
    warm golden morning light from the left; calm intimate mood"
```

The second prompt gives the model reference points for character identity, camera, lighting, and mood simultaneously.

### Use a consistent negative prompt

Add this to every row:

```
watermark, distorted face, extra fingers, extra limbs, low quality, blur
```

Consistent negatives produce consistent quality. Inconsistent negatives produce random artefacts.

### One continuity group per scene-character pair

If Lin Yue appears in three scenes across an episode, use three continuity groups:

```
ep01_s01_lin_cafe
ep01_s03_lin_office
ep02_s02_lin_rain_street
```

Don't reuse the same group across different scenes — it merges context that should be separate.

### Test a new reference image before a large batch

Before running 50 shots with a new character reference, run a 3-shot Quick Test to confirm the model is using the reference correctly. Bad reference images waste credits.
