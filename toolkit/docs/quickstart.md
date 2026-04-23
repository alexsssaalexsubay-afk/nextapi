# Quickstart — First batch in 10 minutes

This guide gets you from "I just received an API key" to "first video downloaded" as quickly as possible.

---

## Option A: Batch Studio (recommended for most operators)

### 1. Install

Requires Python 3.11+.

```bash
cd toolkit/batch_studio
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

Streamlit opens at `http://localhost:8501`. Keep this browser tab open.

### 2. Set your API key

In the left sidebar under **Connection**, paste your `sk_live_…` key. The status message turns green when it's accepted.

### 3. Upload reference images (optional but recommended)

Under **Reference Images** in the sidebar, upload your character / outfit / scene ref JPGs. File names must match the values in your CSV (e.g. upload `char_lin_ref.jpg` if the CSV says `character_ref = char_lin_ref.jpg`). You can also put full `https://` URLs directly in the CSV and skip this step.

### 4. Upload a manifest

In the **Batch** tab, drag in `sample_data/shot_manifest.csv` to start. It contains 15 production-quality shots across two drama episodes and one ecommerce sequence. Replace it with your own when ready.

Don't have a manifest? Click **✍️ Generate Sample Prompts**, enter a character name and scene, pick shot types, download the CSV, and upload it here.

### 5. Validate

Click **🔍 Validate CSV**. The app shows:

- **Errors** (red) — rows dropped because they can't be submitted (blank shot ID, bad duration, etc.)
- **Warnings** (yellow) — rows that will submit but may not look right (ref image listed but not uploaded, duplicate shot ID)

Fix errors in your CSV and re-upload if needed.

### 6. Quick Test before committing

Click **⚡ Quick Test (3 shots)** — this submits only the first three rows. Use it to confirm:
- Your API key works
- References resolve correctly
- The output looks as expected

A Quick Test typically finishes in 2–5 minutes.

### 7. Full batch

Click **▶ Start Full Batch**. The progress table updates live. Each row shows its status: ⏳ Pending → 📤 Queued → 🎬 Rendering → 💾 Downloaded (or ❌ Failed with a plain-English error message).

### 8. Retry failed

When the batch finishes, click **🔁 Retry Failed** to re-run only the broken rows. Successful shots are never re-processed. Retry as many times as needed.

### 9. Export

Click **⬇ Export Results** to download `result_manifest.csv` with the job ID, output URL, local file path, and error detail for every shot.

MP4 files are in `output/batch_YYYYMMDD_HHMMSS/<shot_id>.mp4`.

---

## Option B: ComfyUI (best for 1–10 shots with per-shot tweaking)

```bash
cd ComfyUI/custom_nodes
cp -r /path/to/toolkit/comfyui_nextapi .
pip install -r comfyui_nextapi/requirements.txt
# restart ComfyUI
```

1. In ComfyUI → **Load** → `toolkit/comfyui_nextapi/example_workflows/short_drama_consistent_character.json`.
2. Open the **NextAPI · Auth** node and paste your key.
3. Open **NextAPI · Asset Resolver** and replace the placeholder `https://` URLs with your ref images.
4. Edit the prompt in **NextAPI · Generate Video**.
5. **Queue Prompt**.

The finished MP4 path appears on **NextAPI · Download Result** after 30–90 seconds.

Full node reference: [`comfyui_guide.md`](comfyui_guide.md)

---

## Option C: Pure Python (CI / cron / scripting)

```python
import asyncio
import pandas as pd
from batch_runner import BatchRunner, RunnerConfig

cfg = RunnerConfig(
    base_url="https://api.nextapi.top",
    api_key="sk_live_…",
    max_concurrency=5,
)
runner = BatchRunner(cfg, refs={
    "char_lin_ref": "https://cdn.example.com/lin.jpg",
})
df = pd.read_csv("sample_data/shot_manifest.csv")
result = asyncio.run(runner.run(df))
print(f"succeeded: {len(result.successes)}  failed: {len(result.failures)}")
```

The runner has no Streamlit dependency — import it directly in any script.

---

## Common first-run issues

| Symptom | Fix |
|---------|-----|
| Sidebar stays orange after pasting key | Key must start with `sk_live_` — re-copy from the NextAPI dashboard |
| `402 insufficient balance` | Top up credits in the NextAPI dashboard → Billing |
| `429` errors | Lower **Parallel shots** to 2–3 and retry |
| Validation error: "missing required column" | Download `sample_data/shot_manifest.csv` and use it as the template |
| Reference image not matched | Upload filename must exactly match the CSV value (e.g. `char_lin_ref.jpg`) |

Full troubleshooting: [`troubleshooting.md`](troubleshooting.md)
