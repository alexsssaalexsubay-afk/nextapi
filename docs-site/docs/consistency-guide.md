---
title: Character Consistency
sidebar_label: Character Consistency
description: How to keep the same character, outfit, and scene across 100 shots using reference images and continuity groups.
---

# Character Consistency

Video generation models produce new samples each time. Left unguided, the same character looks different in every shot. This page explains how to anchor your character's appearance — not to pixel-perfect locked frames, but to **high consistency** good enough for production.

:::note Honest expectations
Reference images and continuity groups significantly improve consistency, but they are not a guarantee. Expect 85–95% visual consistency across a well-configured batch. Plan for a 5–15% re-shoot rate.
:::

---

## The five consistency levers

Use them together — each one adds a layer of anchoring:

### 1. Character reference image

The strongest lever. One clean reference photo of the character, used on every shot.

**What makes a good reference:**
- Front 3/4 angle, eye level
- Neutral expression, relaxed posture
- Consistent, even lighting (no dramatic shadows)
- Visible upper body at minimum
- No busy backgrounds

Set it in your manifest's `character_ref` column. Upload the file in the Batch Studio sidebar, or use a hosted `https://` URL.

### 2. Outfit reference image

If the character wears the same outfit across a scene, give the model a dedicated outfit reference.

Set it in `outfit_ref`. Like the character ref, use a clean, well-lit photo where the outfit is clearly visible.

### 3. Scene reference image

Use the same scene reference for every shot in a location — even when the camera angle changes. This anchors lighting, colour temperature, and environmental details.

Set it in `scene_ref`.

### 4. Fixed visual traits in the prompt

Put a short phrase from the character bible directly into every prompt that uses that character:

```
Lin Yue, mole below left eye, pearl stud earrings, off-white wool coat
— walks into the cafe, stops at the window-side table...
```

This is cheap to do and meaningfully improves consistency. Keep the same phrase in the same position across all shots for a given character.

### 5. `continuity_group`

A metadata string that tells the API (and the Batch Studio runner) that a group of shots belongs to the same sequence. Two effects:

- The Batch Studio runner inherits empty ref fields from the group's first (anchor) row — you only need to fill in references once.
- Some providers use this hint to keep latent context consistent across shots in the same group.

---

## Setting up continuity groups

### Naming convention

```
<episode>_<scene>_<character>_<location>
```

Examples:
- `ep01_s01_lin_cafe`
- `ep02_s03_chen_rain`
- `ecom_studio_lin_red`

### Anchor row rule

The **first row** of a continuity group is the anchor. Fill in all refs (`character_ref`, `outfit_ref`, `scene_ref`) on the anchor row. Later rows in the same group can leave those columns empty — Batch Studio fills them automatically.

```csv
shot_id,continuity_group,character_ref,outfit_ref,scene_ref,prompt_en
ep01_001,ep01_s01_lin_cafe,char_lin.jpg,outfit_white_coat.jpg,cafe_morning.jpg,Lin Yue walks into the cafe...
ep01_002,ep01_s01_lin_cafe,,,,"Close-up of Lin Yue stirring her coffee..."
ep01_003,ep01_s01_lin_cafe,,,,"Lin Yue looks up as Chen Mo enters..."
```

Rows 2 and 3 inherit `char_lin.jpg`, `outfit_white_coat.jpg`, and `cafe_morning.jpg` from row 1 automatically.

:::tip Visualise it
The Batch Studio manifest preview **highlights inherited cells in blue**, so you can verify inheritance before running.
:::

---

## Character bible

For large productions, maintain a `character_bible.csv`:

```csv
character_id,character_name,fixed_visual_traits,reference_image
char_lin,Lin Yue,"mole below left eye; pearl stud earrings; off-white wool coat",char_lin_ref.jpg
char_chen,Chen Mo,"gold-rimmed glasses; silver bracelet on right wrist; charcoal blazer",char_chen_ref.jpg
```

Copy `fixed_visual_traits` verbatim into the beginning of every prompt for that character. It adds negligible tokens but noticeably stabilises facial features.

A sample character bible is at `toolkit/short_drama_pack/sample_data/character_bible.csv`.

---

## Scene bible

Similarly, maintain a `scene_bible.csv` that captures the lighting and mood keywords for each location:

```csv
scene_id,lighting_keywords,mood_keywords,reference_image
scene_cafe_morning,"soft morning sunlight from left, warm golden tones","calm, intimate",cafe_morning_ref.jpg
scene_rain_street,"cyan and magenta neon, rain droplets in light beams","melancholic, cinematic",rain_street_ref.jpg
```

Append `lighting_keywords` and `mood_keywords` to the end of every prompt for that scene.

---

## What if I need a character change mid-episode?

If a character changes outfit or hairstyle significantly, treat them as a **new character ID** with their own reference image:

```
char_lin          (white coat, normal hair)
char_lin_evening  (red dress, hair up)
```

Don't try to override mid-continuity-group — create a new group with the new reference as the anchor.

---

## Checklist before a consistency batch

- [ ] One clean reference image per character
- [ ] One reference image per outfit
- [ ] One reference image per scene/location
- [ ] `fixed_visual_traits` phrase prepended to every prompt for each character
- [ ] `continuity_group` set for all shots in the same scene-character sequence
- [ ] Anchor row fully filled for each continuity group
- [ ] **Quick Test** with 3 shots before the full batch — verify the character looks right
