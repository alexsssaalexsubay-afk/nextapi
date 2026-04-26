# Batch Studio Guide

Full reference for every setting, button, and CSV field in NextAPI Batch Studio.

## Sidebar — settings panel

| Field | Default | Notes |
|-------|---------|-------|
| `base_url` | `https://api.nextapi.top` | Override only for self-hosted or regional endpoints |
| `api_key` | `$NEXTAPI_KEY` if set | Stored only in session memory, never on disk |
| `max_concurrency` | 5 | Cap on parallel in-flight jobs. Bounded by your key's `rate_limit_rpm` on the server. |
| `polling_interval_seconds` | 4 | How often the runner polls `/v1/jobs/{id}` |
| `request_timeout_seconds` | 30 | Per-request timeout; download timeouts are 6× this |
| `output_dir` | `./output` | Root directory for batches; each run creates `batch_YYYYMMDD_HHMMSS/` subfolder |

### Reference assets

Four uploaders, one per reference kind. Dropped files are persisted to `<output_dir>/.staging/<kind>/<safe_filename>` so the runner can reference them.

- The **manifest's `character_ref` value must match the uploaded filename** (with or without extension). The runner resolves `character_ref="char_lin_ref.jpg"` to the local staged path and passes it through `build_payload()`.
- For production, pre-host references on R2 / S3 / a CDN and put https URLs directly into the manifest — this is faster and doesn't stream files through Streamlit.

## Main panel

### 1. Upload manifest

Accepts a single `.csv`. On upload the file is parsed and `apply_continuity_inheritance()` fills missing refs within each `continuity_group` from the group's anchor row.

The DataFrame preview below shows the inherited version, so you can verify the anchor behaviour before running.

### 2. Validate CSV

Runs each row through the `ShotRow` pydantic model. Invalid rows are dropped and listed in a separate panel with their failure reason. The manifest is replaced with the cleaned version in memory (the original CSV on disk is untouched).

Common validation failures:

- `shot_id` missing or empty → every row must have one
- `prompt_en` shorter than 4 chars → the model won't do useful work with 1-word prompts
- `duration` outside 4–15 → clamp it or pick a supported value
- `aspect_ratio` not in the allowed set → use one of `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`

### 3. Start Batch

Disabled until `api_key` is non-empty. On click:

- Creates `output/batch_YYYYMMDD_HHMMSS/`
- Spins up a `BatchRunner` with the current settings
- Submits one job per row, bounded by `max_concurrency`
- Polls each job until it reaches `succeeded` or `failed`
- Downloads the MP4 for successes
- Writes `result_manifest.csv` at the end

The progress table updates live per row. You can leave the tab and come back; state is kept in `st.session_state` while the batch runs.

### 4. Retry Failed

Only enabled after a batch finishes. Rebuilds a dataframe from the previous run's failures and runs only those rows. Output lands in a fresh `batch_*` subfolder — it does **not** overwrite the prior batch, which keeps audit clean.

### 5. Export Results

Downloads the last batch's `result_manifest.csv`. This file is the canonical record of what happened, and is the easiest way to hand off failures to someone else for triage.

## Result manifest columns

| Column | Meaning |
|--------|---------|
| `shot_id` | From the input manifest |
| `row_index` | 0-based index in the validated input |
| `status` | `downloaded` on full success, `failed` otherwise |
| `job_id` | The remote job id, useful for support tickets |
| `estimated_credits` | What the API said the shot would cost |
| `output_url` | Signed URL returned by the provider (may expire) |
| `local_file_path` | Absolute path to the downloaded MP4 |
| `error_code` | `content_policy.pre`, `http_429`, `http_500`, etc. |
| `error_message` | Verbose message — copy/paste into your support ticket |
| `attempts` | Always 1 in the default runner; for retry-failed this remains 1 since each row is a new run |

## Concurrency, throughput, retries

- The client retries transient failures (HTTP 429 + 5xx, network errors) up to 4 times with exponential backoff (1.5s, 3s, 6s, 12s base + ±30% jitter).
- If the batch's overall RPS is pegging your key's `rate_limit_rpm`, the 429s are expected — the retry layer absorbs them but progress slows. Lower `max_concurrency` to stop wasting retries, or request a higher RPM on the key from the dashboard.
- The runner is bounded by one `asyncio.Semaphore(max_concurrency)`. It does **not** open more than `max_concurrency` sessions; aiohttp reuses the single session pool for all requests.
- Polling is independent of submit concurrency. If you have 50 submitted jobs and `max_concurrency=5`, at any moment up to 5 rows are actively being processed by `_run_one()`; each holds its own poll loop.

## Limits and known edge cases

- **Streamlit session lifetime.** Closing the tab kills the event loop; the batch is aborted. Always keep the tab open for a full run. For truly long-running batches, use `batch_runner.py` directly (CLI / script).
- **Upload size.** Streamlit's default upload cap is 200MB per file. Configure `~/.streamlit/config.toml` → `[server] maxUploadSize = 512` if you need larger refs.
- **Mac ``asyncio`` + Streamlit.** On macOS with `proactor` event loops, the first run may occasionally log `DeprecationWarning`. Safe to ignore; functionality is unaffected.
- **Windows.** Tested on Windows 11 + Python 3.11. Streamlit occasionally reports stale progress until you click somewhere; known Streamlit quirk, not a runner bug.
