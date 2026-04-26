# NextAPI Batch Studio

**A local Streamlit console for batch video generation at production scale.**

Designed for short-drama producers, ecommerce creative teams, and AI video operators who need to generate 10–500+ shots in a single run — with controlled concurrency, automatic retries, continuity-group inheritance, and a clean audit trail — without writing a single line of code.

---

## What it does

| Feature | Detail |
|---------|--------|
| CSV-driven batch | One row per shot; supports all API fields |
| Controlled concurrency | `asyncio.Semaphore` — default 5 parallel jobs, tunable 1–20 |
| Continuity inheritance | Rows in the same `continuity_group` auto-inherit character / outfit / scene refs from the anchor row |
| Quick Test mode | Run only the first 3 rows for a fast pre-flight check |
| Retry Failed | Re-runs only failed shots; never re-processes successful ones |
| Visual validation | Per-row schema errors with plain-English explanations; warns about missing ref images |
| Inherited-ref highlighting | The manifest preview highlights cells filled by continuity inheritance (blue) |
| Continuity group summary | Shows every group, its anchor shot, and which fields it shares |
| Sample Prompt Pack | Built-in generator produces a ready-to-use manifest from your character name + scene |
| Run history | Every run (Full / Quick Test / Retry) is stored in the session with downloadable result CSV |
| Output | `output/batch_YYYYMMDD_HHMMSS/<shot_id>.mp4` + `result_manifest.csv` |
| Exponential backoff | Retries 429 + 5xx up to 4 times with jitter before marking a row failed |

---

## Install

Requires Python 3.11+.

```bash
cd toolkit/batch_studio
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

Streamlit opens `http://localhost:8501`. Keep the browser tab open for the duration of any batch run.

---

## First batch in 10 minutes

### Step 1 — Paste your API key

Open the left sidebar → **Connection → API Key**. Paste your `sk_live_…` key. The sidebar turns green when a key is set.

### Step 2 — Upload reference images (optional but strongly recommended)

In the sidebar under **Reference Images**, upload:
- **Character references** — one clean image per character (front 3/4 angle, neutral lighting)
- **Outfit references** — one image per outfit
- **Scene / background references** — one establishing shot per location

The filename you upload (e.g. `char_lin_ref.jpg`) must match the `character_ref` value in your CSV. You can also put full `https://` URLs directly in the CSV to skip this step.

### Step 3 — Upload your manifest

In the **Batch** tab, drag in `sample_data/shot_manifest.csv` to try a pre-built 15-shot batch, or upload your own.

Don't have a manifest yet? Click the **✍️ Generate Sample Prompts** tab, enter your character name and scene, pick shot types, and download the generated CSV.

### Step 4 — Validate

Click **🔍 Validate CSV**. The app checks every row and shows:
- **Errors** (in red) — rows dropped because they can't be fixed automatically (e.g. empty prompt, bad aspect ratio)
- **Warnings** (in yellow) — issues that won't block generation but may cause unexpected results (e.g. a reference image listed in the CSV but not uploaded)

### Step 5 — Quick Test, then Full Batch

Click **⚡ Quick Test (3 shots)** first. This submits only the first 3 rows — a fast sanity check to confirm your API key is valid, refs resolve correctly, and the output looks right.

Once the Quick Test looks good, click **▶ Start Full Batch**.

### Step 6 — Monitor and retry

The **Results** panel updates live. When the batch finishes:

- Green `💾 Downloaded` rows have MP4s saved in `output/batch_*/`
- Red `❌ Failed` rows show an error code and plain-English explanation

Click **🔁 Retry Failed** to re-run only the broken shots. You can do this as many times as needed — each retry creates a fresh output folder and never overwrites successful shots.

### Step 7 — Export

Click **⬇ Export Results** to download `result_manifest.csv` — the canonical record of the run with `job_id`, `output_url`, `local_file_path`, and `error_message` for every shot.

---

## CSV schema

### Required columns

| Column | Type | Notes |
|--------|------|-------|
| `shot_id` | string | Unique within the batch. Used as the MP4 filename. |
| `prompt_en` | string | English generation prompt. At least 10 words recommended. |
| `duration` | integer (4–15) | Seconds of video |
| `aspect_ratio` | string | `16:9` / `9:16` / `1:1` / `4:3` / `3:4` / `21:9` |

### Optional columns

| Column | Notes |
|--------|-------|
| `episode`, `scene_id` | Organisational metadata |
| `continuity_group` | Rows with the same value share refs from the first (anchor) row |
| `character_id`, `outfit_id` | Identifier strings forwarded as metadata |
| `character_ref` | Filename of uploaded character image, or an https URL |
| `outfit_ref` | Filename of uploaded outfit image, or an https URL |
| `scene_ref` | Filename of uploaded scene image, or an https URL |
| `reference_video` | Optional reference video filename or URL |
| `prompt_cn` | Chinese prompt (fallback if `prompt_en` is empty) |
| `camera` | e.g. `medium tracking shot` |
| `motion` | e.g. `slow walk-in then pause` |
| `mood` | e.g. `calm intimate morning` |
| `negative_prompt` | Things to exclude — e.g. `watermark, distorted face, blur` |

See `sample_data/shot_manifest.csv` for a 15-shot production-quality example.

---

## Continuity groups

Shots in the same `continuity_group` share character / outfit / scene refs from the **first row** (anchor). Later rows with empty ref fields inherit from the anchor automatically.

Example: 4 shots in `ep01_s01_lin_cafe` — fill in `character_ref`, `outfit_ref`, and `scene_ref` on the first row only. The remaining three rows need only `shot_id`, `prompt_en`, `duration`, and `aspect_ratio`.

The manifest preview **highlights inherited cells in blue** so you can verify the inheritance before running.

---

## Output

Each run creates a timestamped batch folder:

```
output/
└── batch_20260423_223104/
    ├── ep01_s01_001.mp4
    ├── ep01_s01_002.mp4
    ├── ...
    └── result_manifest.csv
```

`result_manifest.csv` columns:

| Column | Meaning |
|--------|---------|
| `shot_id` | From the input manifest |
| `status` | `downloaded` on full success, `failed` otherwise |
| `job_id` | Remote job ID (useful for support tickets) |
| `estimated_credits` | Credits the API estimated for this shot |
| `output_url` | Signed video URL (may expire after 24 h) |
| `local_file_path` | Absolute path to the downloaded MP4 |
| `error_code` | Short machine-readable code if failed |
| `error_message` | Plain-English explanation |
| `inherited_fields` | Comma-separated list of fields filled by continuity inheritance |

---

## Concurrency and rate limits

| Setting | Recommended starting value | Notes |
|---------|---------------------------|-------|
| `Parallel shots` | 5 | Raise to 10–15 once you've confirmed your key's RPM allows it |
| `Polling interval` | 4 s | Lower to 2 s for short shots; raise to 8 s for long queues |
| `Request timeout` | 30 s | Raise to 60 s on slow connections |

If you see persistent `429` errors, lower **Parallel shots** or ask the NextAPI dashboard to raise your key's `rate_limit_rpm`.

---

## Programmatic use

`batch_runner.py` and `api_client.py` work without Streamlit:

```python
import asyncio
import pandas as pd
from batch_runner import BatchRunner, RunnerConfig

cfg = RunnerConfig(
    base_url="https://api.nextapi.top",
    api_key="sk_live_…",
    max_concurrency=8,
)
runner = BatchRunner(cfg, refs={"char_lin_ref": "https://cdn.example.com/lin.jpg"})
df = pd.read_csv("sample_data/shot_manifest.csv")
result = asyncio.run(runner.run(df))
print(f"succeeded: {len(result.successes)}  failed: {len(result.failures)}")
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| API key turns red on save | Wrong format | Must start with `sk_live_` |
| `401 unauthorised` | Expired or revoked key | Re-issue in the NextAPI dashboard → Keys |
| `402 insufficient balance` | No credits | Top up in the NextAPI dashboard → Billing |
| `429` persists through retries | Key RPM too low | Lower Parallel shots, or raise the key's rate limit |
| Validation warning about missing ref | Filename mismatch | The `character_ref` CSV value must exactly match the uploaded filename (with or without extension) |
| Inherited cells not highlighted | CSV has no `continuity_group` column | Add the column or use the sample manifest |
| Batch stops mid-way | Browser refreshed or laptop slept | Use **🔁 Retry Failed** to re-run remaining shots |
| `no_video_url` error | Transient provider issue | Retry; almost always clears on second attempt |

---

## License

MIT — included in the NextAPI customer toolkit.
