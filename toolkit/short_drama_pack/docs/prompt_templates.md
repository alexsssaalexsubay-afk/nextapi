# Prompt Templates — Short Drama + Ecommerce

A library of reusable prompt skeletons. Drop them into the `prompt_en` column of your `shot_manifest.csv`, then customise the bracketed placeholders. Each template is paired with reasonable defaults for `camera`, `motion`, `mood`, `duration`, and `aspect_ratio`.

Conventions:
- `{CHAR}` — character name from `character_bible.csv`.
- `{OUTFIT}` — outfit short description.
- `{SCENE}` — scene name from `scene_bible.csv`.
- `{ACTION}` — verb phrase ("walks in", "turns and looks back", "lifts the cup").

---

## 1. Female protagonist entrance

```
{CHAR} walks into {SCENE}, in {OUTFIT}, stops at the focal point of the room,
turns slowly toward camera, calm intimate expression, soft natural lighting.
```

| Field | Suggested |
|------|-----------|
| camera | medium tracking shot |
| motion | slow walk-in then pause |
| mood | calm intimate |
| duration | 5–6 |
| aspect_ratio | 16:9 (drama) or 9:16 (vertical short) |
| negative | distorted face, extra fingers, watermark, low quality |

---

## 2. Dialogue reaction close-up

```
Close-up of {CHAR}'s face, {OUTFIT}, listening intently, eyes meeting an
off-screen speaker, micro-expression shifting from neutral to {EMOTION},
shallow depth of field, naturalistic skin tones.
```

`{EMOTION}` examples: surprise · soft smile · doubt · quiet anger · relief.

| Field | Suggested |
|------|-----------|
| camera | tight close-up, eye-level |
| motion | static frame, subtle head turn |
| mood | intimate, conversational |
| duration | 3–4 |
| aspect_ratio | 16:9 |
| negative | distorted face, watermark, blur |

---

## 3. Emotional pause

```
{CHAR} stands still in {SCENE}, in {OUTFIT}, gaze drifting toward middle
distance, gentle wind through hair, breath barely visible, ambient sound only,
held quiet beat for the camera.
```

| Field | Suggested |
|------|-----------|
| camera | medium shot, slightly off-axis |
| motion | nearly static, minimal sway |
| mood | wistful, contemplative |
| duration | 5–6 |
| aspect_ratio | 16:9 |
| negative | extra limbs, watermark |

---

## 4. Walking / turning / looking back

```
{CHAR} walks away from camera in {SCENE}, {OUTFIT} flowing in motion,
pauses mid-step, turns over the right shoulder to look back at camera,
soft side-lighting, depth of field on background blur.
```

| Field | Suggested |
|------|-----------|
| camera | medium-wide, slow dolly back |
| motion | walk → pause → turn |
| mood | longing, dramatic |
| duration | 6 |
| aspect_ratio | 16:9 |
| negative | distorted face, watermark, motion blur on face |

---

## 5. Cafe morning

```
{CHAR} sits at a window-side table in a sunlit cafe, {OUTFIT}, warm latte
between hands, soft golden morning light from the left, gentle haze of steam,
distant chatter, intimate mood.
```

| Field | Suggested |
|------|-----------|
| camera | medium shot from across the table |
| motion | subtle hand-to-cup, gentle head tilt |
| mood | calm intimate morning |
| duration | 5 |
| aspect_ratio | 16:9 |
| negative | distorted hand, watermark, blur |

---

## 6. Late office

```
{CHAR} alone at a floor-to-ceiling office window at night, {OUTFIT}, city
skyline glowing through glass, single desk lamp providing key light, holding
{PROP}, reflective expression.
```

`{PROP}` examples: wine glass · coffee cup · phone · printout.

| Field | Suggested |
|------|-----------|
| camera | wide back shot, then medium turn |
| motion | slow turn toward camera |
| mood | tense, lonely, professional |
| duration | 6 |
| aspect_ratio | 16:9 |
| negative | distorted hand, extra glasses, watermark |

---

## 7. Rainy street

```
{CHAR} stands alone on a neon-lit rainy street, {OUTFIT}, umbrella in hand,
wet asphalt reflecting cyan and magenta signs, looks up at the night sky,
visible breath, melancholic cinematic atmosphere.
```

| Field | Suggested |
|------|-----------|
| camera | low-angle medium shot |
| motion | still, then slow upward gaze |
| mood | melancholic, cinematic |
| duration | 6 |
| aspect_ratio | 16:9 or 21:9 |
| negative | watermark, blur, low quality |

---

## 8. Luxury interior

```
{CHAR} steps out of the rotating door of a luxury hotel lobby, {OUTFIT},
marble floors and crystal chandelier behind, polished tracking shot,
elegant tense atmosphere.
```

| Field | Suggested |
|------|-----------|
| camera | wide tracking, then dolly-in |
| motion | steady walk forward |
| mood | elegant, dramatic |
| duration | 5–6 |
| aspect_ratio | 16:9 |
| negative | distorted face, watermark, blur |

---

## 9. Ecommerce heroine — full-body spin

```
Female model {CHAR} in {OUTFIT}, on a seamless white studio cyclorama,
single softbox key light from front-left, hair light from behind, performs
one slow 360-degree turn, dress flowing outward, premium fashion lookbook
aesthetic.
```

| Field | Suggested |
|------|-----------|
| camera | full-body wide shot |
| motion | 360-degree slow spin |
| mood | clean, premium ecommerce |
| duration | 6 |
| aspect_ratio | 9:16 (Douyin / TikTok / Reels) |
| negative | watermark, distorted body, extra limbs |

---

## 10. Ecommerce product showcase — close-up

```
Extreme close-up of {CHAR}'s {BODY_PART} showcasing {PRODUCT}, soft studio
key light, slow lift and rotation revealing all sides of the product,
clean white background, premium retail aesthetic.
```

`{BODY_PART}` examples: wrist · neck · ear · hand. `{PRODUCT}` examples: silver bracelet · diamond pendant · pearl earring · luxury watch.

| Field | Suggested |
|------|-----------|
| camera | extreme close-up |
| motion | slow lift and rotate |
| mood | product showcase, premium |
| duration | 4 |
| aspect_ratio | 1:1 (Instagram / Xiaohongshu) |
| negative | distorted hand, watermark, blur |

---

## Negative-prompt cheat sheet

A small set of negatives applies to almost all shots. Layer them with shot-specific ones:

- `distorted face, extra fingers, extra limbs, watermark, low quality, blur, jpeg artifacts`
- For ecommerce: append `text overlay, brand logo, retail tag visible`.
- For drama: append `motion blur on face, double exposure`.

---

## How to extend

1. Add a row to `character_bible.csv` and `scene_bible.csv` for any new asset.
2. Pick the closest template, swap the placeholders.
3. Save as a new shot in `shot_manifest.csv`.
4. Re-use `continuity_group` so refs auto-inherit across the sequence.
