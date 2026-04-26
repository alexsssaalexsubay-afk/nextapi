---
title: Errors & Troubleshooting
sidebar_label: Errors & Troubleshooting
description: Plain-English explanations for every NextAPI error code, with specific fixes.
---

# Errors & Troubleshooting

When something goes wrong, the API returns an HTTP status code and a JSON body like:

```json
{
  "error": {
    "code": "insufficient_balance",
    "message": "Organisation has no remaining credits."
  }
}
```

In Batch Studio, the `error_code` and `error_message` appear directly in the results table row.

---

## 401 — Unauthorized

**What happened:** Your API key was not recognised or is missing from the request.

**Common causes:**

- Key pasted incorrectly (leading/trailing space, missing characters)
- Key was revoked in the dashboard
- Using a test key against a production endpoint, or vice versa
- `Authorization: Bearer` header was omitted

**Fix:**
1. Open the dashboard → **Keys** and confirm the key exists and is not revoked
2. Re-copy the key — paste it in a plain text editor first to check for invisible characters
3. Confirm you're using `Authorization: Bearer sk_live_…` (not `API-Key` or `X-Api-Key`)

```bash
# Test your key directly
curl https://api.nextapi.top/v1/videos/does-not-exist \
  -H "Authorization: Bearer sk_live_yourkey"
# Should return 404, not 401
```

---

## 402 — Insufficient Balance

**What happened:** Your organisation has no remaining credits.

**Fix:** Go to the dashboard → **Billing → Add credits**. The request will succeed immediately after top-up.

:::info Credits are per-organisation
All keys under the same organisation share one credit balance. If one team member runs a large batch, it affects everyone's available credits.
:::

---

## 429 — Too Many Requests

**What happened:** Your key's rate limit (requests per minute) was exceeded.

**Immediate fix:** The API automatically retries 429 errors with exponential backoff — if you're using Batch Studio or the toolkit client, wait and the batch will recover on its own.

**If it keeps happening:**

- Lower **Parallel shots** in Batch Studio (try 3 instead of 10)
- Check the key's `rate_limit_rpm` in dashboard → **Keys → Edit** and raise it if your workload justifies it

**What backoff looks like:**

```
Attempt 1:  429 → wait 1.5s → retry
Attempt 2:  429 → wait 3s   → retry
Attempt 3:  429 → wait 6s   → retry
Attempt 4:  429 → wait 12s  → retry
Attempt 5:  FAIL — row marked as failed
```

If all 4 retries hit 429, the row is marked `failed` with `error_code: http_429`. Use **Retry Failed** after a short wait.

---

## 400 — Bad Request

**What happened:** The request body has invalid or missing fields.

**Common causes and fixes:**

| Sub-message | Fix |
|-------------|-----|
| `"prompt is required"` | For `POST /v1/videos`, include `input.prompt`; in Batch Studio manifests, add a non-empty `prompt_en` (or the column your template expects) |
| `"duration out of range"` / `duration_seconds` | Set `input.duration_seconds` (or legacy `duration_seconds`) between **4 and 15** when you pass a value |
| `"unsupported aspect_ratio"` | Use one of: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`, `adaptive` |
| `"invalid reference url"` | Ensure reference URLs start with `https://` and are reachable |

Run **🔍 Validate CSV** in Batch Studio before submitting — it catches most 400-class issues before any credits are spent.

---

## 400 — content_policy.pre

**What happened:** The prompt was flagged by the pre-generation moderation filter and the job was not created.

This is a hard rejection — no credits are charged.

**Fix:** Revise the prompt. Avoid:
- Explicit or violent descriptions
- Real person names (especially public figures) in compromising contexts
- Descriptions of sensitive political or religious content

If you believe the rejection was incorrect, try rephrasing using more neutral language. The exact threshold depends on your organisation's moderation profile setting (dashboard → **Moderation**).

---

## 5xx — Server Error

**What happened:** An error on the NextAPI or provider side.

**Fix:**
1. Wait 30–60 seconds and retry
2. If retries consistently fail, check the NextAPI status page
3. The toolkit client and Batch Studio retry automatically on 5xx with backoff

5xx errors do not charge credits. If a job fails with 5xx after all retries, the reserved credits are refunded.

---

## Job status: `failed` (after accepted)

**What happened:** The job was created and started rendering, but failed during generation.

Check `error_code` and `error_message` from `GET /v1/videos/{id}` (or legacy `GET /v1/jobs/{id}` for job IDs from the old create path):

| error_code | Meaning | Fix |
|------------|---------|-----|
| `content_policy.post` | Prompt passed pre-check but generated content was flagged | Soften the prompt; check moderation profile |
| `provider_error` | Upstream provider returned an error | Retry — usually a transient issue |
| `timeout` | Job exceeded the 15-minute generation window | Provider congestion — retry during off-peak hours |
| `quota_exceeded` | Provider capacity limit hit for this org | Contact support to increase limits |

---

## Timeout

**What happened:** Batch Studio's `MAX_POLL_MINUTES` (15 minutes) elapsed with no terminal status.

This means the provider accepted the job but it never completed in time.

**Fix:** Click **🔁 Retry Failed**. The retry creates a new job — the old one may complete eventually but its output won't be downloaded.

If timeouts are frequent, check the NextAPI status page for provider queue depth advisories.

---

## Missing reference image

**What happened (Batch Studio):** A `character_ref`, `outfit_ref`, or `scene_ref` value in the manifest doesn't match any uploaded file.

**Validation warning message:**
> `'char_lin_ref.jpg' is listed as Character reference but no matching file was uploaded in the sidebar.`

**Fixes:**
1. Upload the file in the Batch Studio sidebar — the filename must match exactly (`char_lin_ref.jpg`, not `Char_Lin_Ref.JPG`)
2. Or replace the CSV value with a fully qualified `https://` URL pointing to the hosted image
3. Or remove the column value from the CSV if you don't need a reference for that shot

---

## General troubleshooting checklist

Before contacting support, try these:

- [ ] API key starts with `sk_live_`?
- [ ] No leading/trailing whitespace in the key?
- [ ] Key is active in the dashboard (not revoked)?
- [ ] Org has a positive credit balance?
- [ ] `duration` / `duration_seconds` is between 4 and 15 (seconds)?
- [ ] `aspect_ratio` is a supported value?
- [ ] Reference URLs are `https://` and publicly reachable?
- [ ] Prompt is not empty and has enough detail?
- [ ] Ran **Validate CSV** before submitting?

If you've checked all of the above and the issue persists, open a support ticket with:
- The `job_id` (or the full API response if no ID was returned)
- The `error_code` and `error_message`
- The prompt you used (without any proprietary content if needed)
