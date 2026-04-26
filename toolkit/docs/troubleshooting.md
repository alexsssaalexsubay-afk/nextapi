# Troubleshooting

Quick fixes for the most common problems operators encounter.

## API / authentication errors

### `401 unauthorised`

- Your `sk_live_…` key is wrong, expired, or revoked.
- In the NextAPI dashboard, go to `/keys` → inspect the key status.
- Generate a new key and paste it in Batch Studio / the Auth node.
- Check that you're using the `sk_live_…` key (not a test `sk_test_…` key) against the production endpoint.

### `403 forbidden` / `not_in_admin_allowlist`

- Your Clerk email is not in the `ADMIN_EMAILS` list. Contact the platform owner.
- If using `X-Admin-Token`, check the shared secret hasn't changed.

### `402 insufficient_balance`

- The org linked to your API key has run out of credits.
- Top up in the NextAPI dashboard → **Billing**.
- Each 5-second shot costs roughly 1–2 credits at the default quality level.

### `400 bad_request: invalid request body`

- A required field is missing or out of range.
- Most common: `duration` outside 4–15, or `aspect_ratio` with an unsupported value.
- Run **Validate CSV** in Batch Studio first; it catches these before submitting.

### `404 not_found` on `GET /v1/jobs/{id}`

- The `job_id` string is empty or wrong.
- Happens when the submit step failed silently; check the `job_id` column in the result manifest.
- A blank `job_id` means the submit call failed before the server returned a response — look at the `error_message` column for that row.

---

## Batch / runner errors

### Shot stuck at `running` for >15 minutes

- The runner waits up to 15 minutes per shot then marks it `failed` with `error_code: timeout`.
- Root causes: provider queue backpressure, upstream degraded performance, very long `duration`.
- Use **Retry Failed** — the second attempt usually lands quickly once queue pressure eases.
- If it keeps happening, check the NextAPI status page.

### `429 Too Many Requests` persists through retries

- Your key's `rate_limit_rpm` cap was hit faster than the backoff can absorb.
- Lower `max_concurrency` (e.g. from 10 → 3) and retry.
- Or raise the key's `rate_limit_rpm` in the NextAPI dashboard → **Keys → Edit → Rate limit**.
- The runner retries 4 times with exponential backoff; if all 4 fail, the row is marked `failed` with `error_code: http_429`.

### Batch stops mid-way with no visible error

- A Python exception in the runner was swallowed. Check the terminal where Streamlit is running for a stack trace.
- If you're on a laptop that went to sleep, the event loop may have been killed — just re-run with **Retry Failed** on the incomplete result manifest.

### `download failed: HTTP 403`

- The signed video URL expired before the download started. This happens when the batch queue was long and many minutes passed between `succeeded` and the download step.
- Use **Retry Failed** — the re-queued shot will produce a fresh URL.

---

## Consistency / visual quality issues

### Character face drifts between shots

1. Check that every shot in the continuity_group has the same `character_ref` value (or that the anchor row has it and the rest inherited it via `continuity_group`).
2. Add the character's `fixed_visual_traits` verbatim to the beginning of the prompt for every shot.
3. If drift is still bad, try a cleaner reference image: one character, neutral expression, even lighting, visible upper body.

### Outfit changes unexpectedly

- Same fix: ensure `outfit_ref` is identical for all rows in the same `continuity_group`.
- Describe the outfit explicitly in the prompt: "in an off-white ribbed wool turtleneck" not just "dressed nicely".

### Scene lighting inconsistent

- Re-use the exact same `scene_ref` URL for every shot in the same location.
- Put the scene's `lighting_keywords` at the end of every prompt.
- Avoid mixing day/night lighting keywords across shots in the same scene.

### Content policy rejection (`error_code: content_policy.pre`)

- The prompt was flagged before generation even started.
- Soften the language: replace violent/explicit phrasing with neutral descriptions.
- Check your org's moderation profile in the dashboard (`/moderation_profile`); `strict` mode has more aggressive filters than `balanced`.

---

## Reference image issues

### Reference image not picked up by the runner

- In Batch Studio, the sidebar uploads are keyed by **filename** (with and without extension).
- The manifest value in `character_ref` must match: `char_lin_ref.jpg` matches an uploaded file named exactly `char_lin_ref.jpg`. If you uploaded `Lin_Yue_Reference.jpg`, that won't match.
- Rename the upload or change the manifest value.
- Or, skip the sidebar and put the full https URL directly in the manifest — no filename matching required.

### ComfyUI Asset Resolver not uploading

- If `upload_url` is empty, local files are passed through unchanged (not uploaded). The API will reject non-https values.
- Set `upload_url` to an endpoint that accepts `POST multipart/form-data file=<bytes>` and returns `{"url": "https://..."}`.

---

## Streamlit-specific

### Page refreshes and progress disappears

- Streamlit rerenders on any interaction. Progress state is kept in `st.session_state` and should persist through rerenders, but may reset on a hard browser refresh.
- Do not hard-refresh the page while a batch is running.

### "Error: no module named 'batch_runner'" on startup

- Run from the `toolkit/batch_studio/` directory, not the repo root.
- `streamlit run toolkit/batch_studio/app.py` from the repo root works because Streamlit adds the script's directory to `sys.path`.

### Slow startup

- First run pulls Streamlit's asset cache. Subsequent starts are 2–3×faster.

---

## Getting help

If none of the above resolves your issue:

1. Run the failing shot once with `max_concurrency=1` and capture the full output.
2. Note the `job_id` (or the error response body if no id was returned).
3. Contact NextAPI support with: `job_id`, `error_code`, `error_message`, the base prompt, and the reference URL (or a description of the ref).

The more specific you are, the faster we can triage.
