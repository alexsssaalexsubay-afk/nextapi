---
title: Short Drama Workflow
sidebar_label: Short Drama Workflow
description: End-to-end workflow from script to deliverable short drama batch — 100 shots, repeatable, operator-friendly.
---

# Short Drama Workflow

A repeatable production workflow for short-drama teams: from script breakdown to a completed batch of shots ready for editing.

This guide assumes you are using [Batch Studio](/batch-guide) for generation and the templates in `toolkit/short_drama_pack/`.

---

## The six-phase workflow

```
Script  →  Shot breakdown  →  Bibles  →  Manifest  →  Batch  →  Edit
```

---

## Phase 1: Script to shot list

Break the script into individual shots. For each shot, decide:

- Which character appears
- Which scene / location
- Camera framing (wide, medium, close-up)
- Key action in the shot (walks in, pauses, turns, speaks)
- Emotional tone

Don't write the API prompt yet — just a human-readable description. Work in a spreadsheet.

**Rough sizing:** 
- A 5-minute drama episode typically needs 40–80 shots.
- An action-packed 3-minute episode can use 80–120 shots.
- Ecommerce creative packs usually run 6–15 shots per product.

---

## Phase 2: Build the bibles

Before writing any prompts, set up two files:

### character_bible.csv

One row per character. Capture fixed visual traits — these go into every prompt verbatim.

```csv
character_id,character_name,fixed_visual_traits,reference_image
char_lin,Lin Yue,"mole below left eye; pearl stud earrings; off-white wool coat",char_lin_ref.jpg
```

Get or commission reference photos for each character. A clean, front-facing, neutrally-lit photo is more important than any other asset in this workflow.

### scene_bible.csv

One row per location. Capture lighting conditions and mood keywords.

```csv
scene_id,environment_keywords,lighting_keywords,mood_keywords,reference_image
scene_cafe,"corner cafe, large windows","soft morning sunlight, warm golden tones","calm, intimate",cafe_ref.jpg
```

Screenshot, photograph, or generate reference images for each scene. Re-use the same scene ref for every shot in that location — even if the camera angle changes.

Sample bibles are in `toolkit/short_drama_pack/sample_data/`.

---

## Phase 3: Write the manifest

Fill in `shot_manifest.csv`. For each shot:

1. Set `shot_id` (unique per batch — used as the MP4 filename)
2. Set `episode`, `scene_id`, `continuity_group` for organisation
3. Set `character_id` and `outfit_id`
4. Set `character_ref`, `outfit_ref`, `scene_ref` on the anchor row only
5. Write `prompt_en`: `[fixed_visual_traits] + [action] + [camera/motion] + [scene/lighting]`

### Prompt formula

```
{character fixed_visual_traits}, {action description}, {camera framing}, 
{lighting from scene bible}, {mood from scene bible}
```

Example:
```
Lin Yue, mole below left eye, pearl stud earrings, off-white wool coat 
— walks into the corner cafe, stops at the window-side table, turns 
toward camera with a soft expression; medium tracking shot; soft morning 
sunlight from left, warm golden tones; calm intimate mood
```

:::tip Use the prompt template generator
In Batch Studio → **✍️ Generate Sample Prompts** tab, enter your character name and scene, pick shot types, and download a ready-to-use manifest. Then edit the prompts to match your script.
:::

### Batch by continuity group

- Name each group `<episode>_<scene>_<character>_<location>`
- Fill all refs on the anchor (first) row for each group
- Leave refs blank on subsequent rows — they inherit from the anchor

---

## Phase 4: Pre-flight

Before running the full 100-shot batch:

1. **Upload references** in the Batch Studio sidebar
2. **Validate CSV** — fix any errors listed in the panel
3. **Quick Test (3 shots)** — pick 3 representative shots from different continuity groups
4. Review the Quick Test output. Check:
   - Does the character look right?
   - Is the scene consistent with the ref?
   - Is the prompt producing the expected action?
5. If anything is off, fix the reference image or prompt before running the full batch

A 30-minute pre-flight saves hours of re-shooting.

---

## Phase 5: Full batch

Once pre-flight passes:

1. Click **▶ Start Full Batch**
2. Set **Parallel shots** to 5 (raise to 8–10 once you've confirmed your rate limit allows it)
3. Monitor the progress table — check the first few completions visually
4. Let it run to completion

A 100-shot batch at `max_concurrency=5` typically takes **20–40 minutes**, depending on provider queue depth.

---

## Phase 6: Triage and retry

When the batch finishes:

- Filter `result_manifest.csv` for `status = failed`
- For each failure, read `error_code` and `error_message`
- Common failures at this stage:
  - `content_policy.pre` — soften the prompt wording
  - `http_429` — queue retry (lower concurrency)
  - `timeout` — provider congestion, retry usually succeeds
- Click **🔁 Retry Failed** — it re-runs only failed rows

For shots that succeeded but look visually wrong (consistency drift, wrong expression), add them to a "re-shoot list" and create a new mini-manifest with corrected prompts and references.

---

## Phase 7: Edit assembly

Output files are named `<shot_id>.mp4` in the batch folder. The naming makes assembly mechanical:

1. Create a new project in your editor (Premiere, FCP, CapCut, DaVinci)
2. Import all MP4s from the batch folder
3. Your shot list spreadsheet tells you the intended order
4. Arrange by `episode_scene_shot` order — the naming follows naturally

:::tip AI edit assist
Many short-drama teams pipe the `result_manifest.csv` into an LLM to generate a rough EDL (edit decision list) or timeline note, then refine in the NLE.
:::

---

## Realistic throughput estimates

| Batch size | Concurrency | Estimated time |
|------------|-------------|----------------|
| 15 shots | 5 | 5–15 min |
| 50 shots | 5 | 15–30 min |
| 100 shots | 5 | 25–50 min |
| 100 shots | 10 | 15–25 min |

Times vary by provider queue depth. Plan a buffer and check the NextAPI status page during peak hours.

---

## Production checklist

- [ ] Character bibles done, one ref image per character
- [ ] Scene bibles done, one ref image per location
- [ ] `shot_manifest.csv` filled, continuity groups set
- [ ] Pre-flight: validated CSV + Quick Test passed
- [ ] Full batch completed
- [ ] Result manifest triaged: no unexpected failures
- [ ] Re-shoot mini-batch done for visual failures
- [ ] Edit assembly ready
