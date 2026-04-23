# ComfyUI-NextAPI

Production ComfyUI custom node package for the NextAPI / Seedance video generation API. Five opinionated nodes wire end-to-end into any existing ComfyUI graph: **Auth → Asset Resolver → Generate Video → Poll Job → Download Result**.

## Install

ComfyUI auto-loads any folder under `ComfyUI/custom_nodes/`.

```bash
cd ComfyUI/custom_nodes
git clone <this-repo> ComfyUI-NextAPI   # or copy the toolkit/comfyui_nextapi/ folder here
cd ComfyUI-NextAPI
pip install -r requirements.txt
```

Restart ComfyUI. The new nodes appear under the **NextAPI** category in the right-click menu.

## Nodes

| Node | Inputs | Outputs | Notes |
|------|--------|---------|-------|
| **NextAPI · Auth** | `base_url`, `api_key`, `request_timeout_seconds`, `max_retries` | `auth` (NEXTAPI_AUTH) | Required upstream of every other node. Reads `NEXTAPI_BASE_URL` / `NEXTAPI_KEY` env defaults. |
| **NextAPI · Asset Resolver** | `character_ref`, `outfit_ref`, `scene_ref`, `reference_video`, optional `upload_url` + `upload_api_key` | four `STRING` URLs | Pass-through if value is already an `https://` URL. If a local file path is given **and** `upload_url` is set, posts the file as multipart/form-data and expects `{"url": "..."}`. |
| **NextAPI · Generate Video** | `auth`, `prompt`, `duration`, `aspect_ratio`, optional refs / camera / motion / continuity_group / shot_id | `job_id`, `estimated_credits`, `status` | Submits `POST /v1/video/generations`. |
| **NextAPI · Poll Job** | `auth`, `job_id`, `polling_interval_seconds`, `max_wait_minutes` | `status`, `video_url`, `error_code`, `error_message` | Blocks until the job reaches `succeeded` / `failed` or the timeout fires. |
| **NextAPI · Download Result** | `video_url`, optional `filename_prefix` / `shot_id` / `output_subdir` | `local_file_path` | Streams the MP4 into `ComfyUI/output/<output_subdir>/`. |

## Example workflows

`example_workflows/short_drama_consistent_character.json` — single shot wired to keep one character + outfit + scene consistent across an episode. Duplicate the **Generate → Poll → Download** chain (or use a Workflow → For Each loop) to fan out across a `continuity_group`.

`example_workflows/ecom_batch_creatives.json` — two-shot ecommerce template sharing one model + outfit + white-studio reference set (full-body spin + close-up detail).

To use:

1. ComfyUI → **Load** → pick a JSON from `example_workflows/`.
2. Open **NextAPI · Auth** and paste your `sk_live_…` key.
3. Open **NextAPI · Asset Resolver** and replace the placeholder URLs with your hosted refs (or use the upload path).
4. Tweak prompts on the **Generate Video** node(s).
5. **Queue Prompt** — generation typically takes 30–90 s per shot.

## Reference assets

The API's `references` block expects fully-qualified `*_image_url` / `*_video_url`. You have three options:

- **Pre-host** on R2 / S3 / CloudFront / image CDN (fastest path).
- **Use the asset resolver's upload mode** — set `upload_url` to your own upload endpoint that returns `{"url": "..."}`.
- **Wire your own upload step** before Generate Video — the asset resolver simply passes any string through.

## Continuity workflow for short drama

A typical 100-shot batch via ComfyUI:

1. Author shots in `shot_manifest.csv` (see [Short Drama Pack](../short_drama_pack/)).
2. For 1–10 shots, the example workflows are easier than ComfyUI loops.
3. For 50+ shots, use **NextAPI Batch Studio** (`toolkit/batch_studio`) — it shares the same API contract and adds proper concurrency control + retry-failed.

## Errors and retries

- `429` and `5xx` responses are retried automatically (4 attempts, exponential backoff with jitter).
- Hard errors (`400`, `401`, `402`, `403`, `404`) raise a Python exception that ComfyUI surfaces in the node panel — read the message; it includes the API's `error.code` and `error.message`.
- If ComfyUI hangs in **Poll Job** for >15 minutes, the node raises with `job <id> did not finish within 15 minutes`. Bump `max_wait_minutes` for very long shots.

## Environment variables

| Var | Used by | Purpose |
|-----|---------|---------|
| `NEXTAPI_BASE_URL` | Auth | Default base URL |
| `NEXTAPI_KEY` | Auth | Default API key |
| `NEXTAPI_UPLOAD_URL` | Asset Resolver | Upload endpoint for local file refs |
| `NEXTAPI_UPLOAD_KEY` | Asset Resolver | Bearer token for the upload endpoint |

## License

MIT — bundled with the NextAPI customer toolkit.
