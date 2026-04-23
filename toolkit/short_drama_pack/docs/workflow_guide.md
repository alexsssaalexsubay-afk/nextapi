# Short Drama Workflow Guide

A practical playbook for going from "I have an API key" to "I shipped 100 short-drama shots in one batch with consistent characters." Targeted at producers and operators, not engineers.

## The four bibles

You will maintain four files. Treat them as the source of truth for the entire production:

| File | What it contains |
|------|-------------------|
| `character_bible.csv` | One row per character. Reference image, fixed visual traits ("mole below left eye", "gold-rimmed glasses"). |
| `scene_bible.csv` | One row per location. Reference image, environment / lighting / mood keywords. |
| `outfit_bible.csv` *(optional)* | If outfits change a lot, separate them out. Otherwise inline `outfit_id` strings into the manifest. |
| `shot_manifest.csv` | One row per shot. Glues a character + outfit + scene + prompt into a job. |

Sample versions of all three live in `sample_data/`. They are intentionally short (5 characters, 6 scenes, 12 shots) — extend them.

## The 5 consistency levers

Video models drift unless you give them anchors. Use these in order of decreasing impact:

1. **Reference image** — by far the strongest anchor. One clean, well-lit reference per character / outfit / scene. Always re-use the *same* image for the *same* character across an entire batch.
2. **Fixed visual traits** — add the verbatim phrase ("mole below left eye; pearl stud earrings") into every prompt that uses that character. The model sees this thousands of times and locks it in.
3. **`continuity_group` metadata** — the API forwards this; some providers use it to share latents across shots in the same group. Always set it for shots that should look like the same scene.
4. **Same scene reference** — even when the camera angle changes, keep the same `scene_ref` image so colour / lighting / set don't drift.
5. **Same negative prompt** — establish a baseline negative prompt (`watermark, distorted face, extra fingers`) and re-apply it on every shot. Inconsistent negatives produce inconsistent outputs.

## How to keep character consistency

1. Generate or commission **one** clean reference image per character. Front-3/4 angle, neutral lighting, full visible upper body.
2. Save the path/URL in `character_bible.csv` → `reference_image`.
3. Always reference it in the manifest's `character_ref` column.
4. Copy the character's `fixed_visual_traits` verbatim into the front of `prompt_en` for every shot. (You can automate this — see "Compile a manifest" below.)
5. **Don't** mix references mid-episode. If you need an alternate look ("Lin Yue with hair tied up"), create a *second* `character_id` (`char_lin_tied`) with its own reference image.

## How to keep outfit consistency

1. Photograph or pick the outfit on the actual reference character.
2. Save as a separate `outfit_*.jpg` and reference it in `outfit_ref`.
3. The first row in a `continuity_group` acts as the anchor — later rows with empty `outfit_ref` inherit from the anchor automatically (Batch Studio + the runner do this for you).

## How to keep scene consistency

1. Generate a wide establishing shot of the location at the right time of day with the right lighting.
2. Re-use that exact image as `scene_ref` for *every* shot in that scene, regardless of camera angle.
3. Put environment / lighting / mood keywords from `scene_bible.csv` at the *end* of every prompt for that scene, in the same order each time.

## How to batch by `continuity_group`

`continuity_group` is a free-form string. Recommended convention: `<episode>_<scene>_<character>_<location>`, e.g. `ep01_s01_lin_cafe`.

- Rows that share a `continuity_group` are processed together.
- The first row of a group is the **anchor**. Its `character_ref`, `outfit_ref`, `scene_ref`, `character_id`, `outfit_id` are used as defaults for every later row in the group.
- Override on any row by filling its column explicitly.
- Use this aggressively: a 12-shot scene becomes 1 fully-filled anchor row + 11 short rows where you only specify the prompt and shot_id.

## How to retry failed shots

Both Batch Studio and the API client treat each shot as independent. Failures are logged with a `error_code` / `error_message`.

- In **Batch Studio**: click **Retry Failed**. It rebuilds the dataframe from the previous run's failures and reruns only those rows. You can do this safely as many times as you want — the same `shot_id` will overwrite the previous output.
- In **ComfyUI**: re-queue the workflow with the same parameters. Each shot is a fresh API call.
- In **scripts**: filter `result_manifest.csv` for `status == "failed"` and feed those rows back into `BatchRunner.run(only_failed_records=...)`.

## How to prepare a 100-shot batch

A workable end-to-end sequence:

1. **Outline first.** In a spreadsheet, list episodes → scenes → shot_ids. Decide which characters appear in each scene. Aim for 5–10 shots per scene; very long batches are fine but harder to QA.
2. **Cast the bibles.** Ensure every `character_id`, `outfit_id`, `scene_id` referenced in the outline exists in the corresponding bible file with a reference image.
3. **Compile the manifest.** For each shot:
   - Pick a `continuity_group` per scene-character pair.
   - Fill the anchor row completely; leave subsequent rows' refs empty.
   - Use a prompt template from `prompt_templates.md`.
   - Append the character's `fixed_visual_traits` to the prompt.
   - Append the scene's `environment_keywords` + `lighting_keywords` to the end of the prompt.
4. **Pre-host references.** Upload `character_*.jpg`, `outfit_*.jpg`, `scene_*.jpg` to a CDN, R2 bucket, or any HTTPS-reachable place. The Batch Studio sidebar can also stage them locally.
5. **Dry-run 5 shots.** Pick 5 representative shots, set `max_concurrency=2`, run them. QA the output. Fix any prompt / reference issues before doing the full 100.
6. **Run the full batch.** `max_concurrency=5` is a safe starting value (raise once you confirm your key's RPM headroom). The runner handles retries on transient errors automatically.
7. **Triage failures.** Review `result_manifest.csv` → `failed` rows. Common causes:
   - `content_policy.pre` — your prompt tripped the moderation profile. Soften the wording.
   - `429` after retries — your key's per-minute RPM is too low; lower `max_concurrency` or raise the limit on the key.
   - Visual drift — usually missing reference image; fix `character_ref` and **Retry Failed**.
8. **Stitch and edit.** Outputs land in `output/batch_*/<shot_id>.mp4`. Drop them into your editor (Premiere, FCP, CapCut) — the shot_id naming makes assembly mechanical.

## Realistic expectations

- One shot ≈ 30–90 seconds of wall time on a healthy provider queue.
- 100 shots @ `max_concurrency=5` ≈ 15–25 minutes assuming ~3 shots can finish concurrently per provider slot.
- 5–15% of shots typically need a second attempt for visual quality, even with a perfect manifest. Plan a re-shoot pass.
- Reference image quality drives 80% of consistency. Spending an extra hour on better refs is always cheaper than re-running 100 shots.

## When to use ComfyUI vs Batch Studio

| Use case | Tool |
|----------|------|
| Single shot, careful tweaking, want to wire into existing ComfyUI graph | ComfyUI workflow |
| 1–10 shots with manual adjustments per shot | ComfyUI workflow, duplicated nodes |
| 10–500 shots, repeatable, retry-safe, CSV-driven | Batch Studio |
| Programmatic / CI / cron-driven generation | `batch_runner.py` directly |
