# ComfyUI-NextAPI Guide

How to install, use, and extend the NextAPI ComfyUI node package.

## Install

```bash
cd ComfyUI/custom_nodes
git clone <this-repo> ComfyUI-NextAPI
cd ComfyUI-NextAPI
pip install -r requirements.txt
```

Restart ComfyUI. Five new nodes appear under the **NextAPI** category in the right-click node menu.

## Node reference

### NextAPI · Auth

The only required upstream node. Creates an `NEXTAPI_AUTH` bundle that all other nodes receive via the `auth` input.

| Input | Default | Notes |
|-------|---------|-------|
| `base_url` | `https://api.nextapi.top` | Override for staging / self-hosted |
| `api_key` | `$NEXTAPI_KEY` | Paste your `sk_live_…` key here |
| `request_timeout_seconds` | 30 | Per-call timeout |
| `max_retries` | 4 | How many times to retry 429 / 5xx |

**Tip:** set the environment variable `NEXTAPI_KEY=sk_live_…` before starting ComfyUI so you don't have to retype the key after every restart.

### NextAPI · Asset Resolver

Converts local file paths or short identifiers into fully-qualified HTTPS URLs, which the API requires.

- If the input already starts with `http://` or `https://`, it's passed through unchanged.
- If it's a local file path (`/Users/…/lin.jpg`) **and** `upload_url` is set, the file is POSTed as `multipart/form-data`. The upload endpoint must return `{"url": "https://..."}`.
- Otherwise the value is passed through — useful when you pre-host files yourself and just wire the URL directly.

Outputs: `character_url`, `outfit_url`, `scene_url`, `reference_video_url` — all `STRING`.

### NextAPI · Generate Video

Submits `POST /v1/video/generations`.

| Input | Type | Notes |
|-------|------|-------|
| `auth` | NEXTAPI_AUTH | from NextAPIAuth |
| `prompt` | STRING | English generation prompt |
| `duration` | INT 4–15 | seconds |
| `aspect_ratio` | enum | `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9` |
| `negative_prompt` | STRING | optional |
| `character_url` | STRING | from AssetResolver or hardcoded |
| `outfit_url` | STRING | |
| `scene_url` | STRING | |
| `reference_video_url` | STRING | |
| `camera` | STRING | e.g. `medium tracking shot` |
| `motion` | STRING | e.g. `slow walk-in then pause` |
| `continuity_group` | STRING | metadata for the provider |
| `shot_id` | STRING | metadata, used in Download filename |

Outputs: `job_id` (STRING), `estimated_credits` (INT), `status` (STRING).

### NextAPI · Poll Job

Blocks the workflow until the job reaches `succeeded` or `failed`.

| Input | Type | Notes |
|-------|------|-------|
| `auth` | NEXTAPI_AUTH | |
| `job_id` | STRING | from Generate Video |
| `polling_interval_seconds` | FLOAT | how often to poll (default 4) |
| `max_wait_minutes` | INT | hard timeout before the node raises (default 15) |

Outputs: `status`, `video_url`, `error_code`, `error_message`.

**Note:** Poll Job runs synchronously on ComfyUI's worker thread. Your ComfyUI instance will appear unresponsive while waiting. For large fan-out batches, use Batch Studio instead.

### NextAPI · Download Result

Streams the finished MP4 to `ComfyUI/output/<output_subdir>/`.

| Input | Type | Notes |
|-------|------|-------|
| `video_url` | STRING | from Poll Job |
| `filename_prefix` | STRING | default `nextapi` |
| `shot_id` | STRING | appended to filename |
| `output_subdir` | STRING | sub-folder under ComfyUI output dir |

Output: `local_file_path` (STRING).

## Importing an example workflow

1. ComfyUI web UI → top-right **Load** button.
2. Select one of:
   - `example_workflows/short_drama_consistent_character.json` — single drama shot wired to one character + one outfit + one scene.
   - `example_workflows/ecom_batch_creatives.json` — two-shot ecommerce pack (full-body spin + close-up detail) sharing the same model + outfit + studio.
3. Update the two placeholders:
   - In **NextAPI · Auth**: paste your key.
   - In **NextAPI · Asset Resolver**: replace the three `https://your-cdn.example.com/…` placeholders with real hosted reference URLs.
4. **Queue Prompt**.

## Tips for short-drama production with ComfyUI

**Continuity groups in ComfyUI** — the easiest way to keep a scene consistent is:

1. Build the workflow once for the anchor shot (with all refs wired).
2. Use `ComfyUI Manager` → `Workflow → Duplicate` or just `Queue Prompt` again with the same refs but a new prompt.
3. Set `continuity_group` to the same value on every shot of the same scene.

**Fanning out 5+ shots** — duplicate the Generate + Poll + Download trio vertically for each shot. Wire `auth` from the single **Auth** node via reroute nodes. ComfyUI runs the entire graph when you **Queue Prompt**, so all generation calls fire roughly in parallel (subject to the API's per-org concurrency limits).

**For 20+ shots** — switch to Batch Studio. The ComfyUI approach doesn't scale past ~10 nodes gracefully.

## Extending the node package

Every node is a single Python class in `nodes/`. Adding a new node:

1. Create `nodes/my_node.py`.
2. Define `NODE_CLASS_MAPPINGS` and optionally `NODE_DISPLAY_NAME_MAPPINGS` in the class or at module level.
3. Import in `nodes/__init__.py` (or the package root `__init__.py`) and add to the two mapping dicts.
4. Restart ComfyUI.

The `_client.py` module provides the `AuthBundle` type and `request_with_retry` helper, so new nodes that call the API don't need to reinvent retry logic.
