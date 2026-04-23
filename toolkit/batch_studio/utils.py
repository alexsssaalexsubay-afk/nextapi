"""Helpers shared between the Streamlit app and the batch runner."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Ref resolution and payload construction
# ---------------------------------------------------------------------------

def resolve_refs(row: dict, uploaded_refs: dict[str, str]) -> dict:
    """Replace ref filenames in a row with absolute local paths or https URLs.

    ``uploaded_refs`` maps filenames (with and without extension) to either an
    https URL or an absolute local file path. Returns a *copy* of the row.
    """
    out = dict(row)
    for key in ("character_ref", "outfit_ref", "scene_ref", "reference_video"):
        v = out.get(key)
        if isinstance(v, str) and v in uploaded_refs:
            out[key] = uploaded_refs[v]
    return out


def build_payload(row: dict) -> dict:
    """Map a manifest row to the API ``POST /v1/video/generations`` body.

    Optional fields are omitted when empty so we never send ``null`` / NaN.
    """
    payload: dict[str, Any] = {
        "prompt": _clean(row.get("prompt_en") or row.get("prompt_cn")),
        "duration": int(row.get("duration") or 5),
        "aspect_ratio": _clean(row.get("aspect_ratio") or "16:9"),
    }
    if neg := _clean(row.get("negative_prompt")):
        payload["negative_prompt"] = neg
    if cam := _clean(row.get("camera")):
        payload["camera"] = cam
    if mot := _clean(row.get("motion")):
        payload["motion"] = mot

    refs: dict[str, str] = {}
    for src, dst in (
        ("character_ref", "character_image_url"),
        ("outfit_ref", "outfit_image_url"),
        ("scene_ref", "scene_image_url"),
        ("reference_video", "reference_video_url"),
    ):
        v = _clean(row.get(src))
        if v:
            refs[dst] = v
    if refs:
        payload["references"] = refs

    if cg := _clean(row.get("continuity_group")):
        payload["metadata"] = {"continuity_group": cg, "shot_id": _clean(row.get("shot_id"))}
    return payload


# ---------------------------------------------------------------------------
# Continuity inheritance
# ---------------------------------------------------------------------------

# Fields that propagate from the anchor row within a continuity_group.
CONTINUITY_FIELDS = ("character_ref", "outfit_ref", "scene_ref", "character_id", "outfit_id")


def apply_continuity_inheritance(rows: list[dict]) -> list[dict]:
    """Within each continuity_group, fill empty ref fields from the first
    (anchor) row of that group. Rows without a continuity_group are untouched.

    Returns a new list of dicts.
    """
    by_group: dict[str, dict] = {}
    out: list[dict] = []
    for r in rows:
        cg = _clean(r.get("continuity_group"))
        if not cg:
            out.append(dict(r))
            continue
        if cg not in by_group:
            by_group[cg] = r
            out.append(dict(r))
            continue
        anchor = by_group[cg]
        merged = dict(r)
        for key in CONTINUITY_FIELDS:
            if not _clean(merged.get(key)) and _clean(anchor.get(key)):
                merged[key] = anchor[key]
        out.append(merged)
    return out


def annotate_inherited_refs(
    original_rows: list[dict],
    inherited_rows: list[dict],
) -> list[set[str]]:
    """Return a list of sets, one per row, naming the fields that were filled
    by continuity inheritance (i.e. blank in the original but non-blank in
    the inherited version).

    Used by the UI to render "inherited from anchor" badges.
    """
    result: list[set[str]] = []
    for orig, inh in zip(original_rows, inherited_rows):
        inherited: set[str] = set()
        for field in CONTINUITY_FIELDS:
            if not _clean(orig.get(field)) and _clean(inh.get(field)):
                inherited.add(field)
        result.append(inherited)
    return result


def continuity_summary(rows: list[dict]) -> dict[str, dict]:
    """Return a dict mapping continuity_group → {anchor_shot_id, count, fields_shared}.

    Useful for the UI to show a quick summary of each group.
    """
    by_group: dict[str, dict] = {}
    for r in rows:
        cg = _clean(r.get("continuity_group"))
        if not cg:
            continue
        if cg not in by_group:
            by_group[cg] = {
                "anchor_shot_id": _clean(r.get("shot_id")),
                "count": 1,
                "fields_shared": {k for k in CONTINUITY_FIELDS if _clean(r.get(k))},
            }
        else:
            by_group[cg]["count"] += 1
    return by_group


# ---------------------------------------------------------------------------
# Sample prompt pack generator
# ---------------------------------------------------------------------------

SAMPLE_PROMPT_TEMPLATES: list[dict[str, str]] = [
    {
        "label": "Female protagonist entrance",
        "prompt_en": "{character} walks into {scene}, stops at the focal point of the room, turns slowly toward camera, calm intimate expression, soft natural lighting.",
        "camera": "medium tracking shot",
        "motion": "slow walk-in then pause",
        "mood": "calm intimate",
        "duration": "5",
        "aspect_ratio": "16:9",
        "negative_prompt": "distorted face, extra fingers, watermark, low quality",
    },
    {
        "label": "Dialogue reaction close-up",
        "prompt_en": "Close-up of {character}'s face, listening intently, micro-expression shifting to {emotion}, shallow depth of field, naturalistic skin tones.",
        "camera": "tight close-up, eye-level",
        "motion": "static frame, subtle head turn",
        "mood": "intimate, conversational",
        "duration": "4",
        "aspect_ratio": "16:9",
        "negative_prompt": "distorted face, watermark, blur",
    },
    {
        "label": "Emotional pause",
        "prompt_en": "{character} stands still in {scene}, gaze drifting toward middle distance, gentle wind through hair, breath barely visible, held quiet beat.",
        "camera": "medium shot, slightly off-axis",
        "motion": "nearly static, minimal sway",
        "mood": "wistful, contemplative",
        "duration": "5",
        "aspect_ratio": "16:9",
        "negative_prompt": "extra limbs, watermark",
    },
    {
        "label": "Walk and look back",
        "prompt_en": "{character} walks away from camera in {scene}, pauses mid-step, turns over the right shoulder to look back at camera, soft side-lighting.",
        "camera": "medium-wide, slow dolly back",
        "motion": "walk → pause → turn",
        "mood": "longing, dramatic",
        "duration": "6",
        "aspect_ratio": "16:9",
        "negative_prompt": "distorted face, watermark, motion blur on face",
    },
    {
        "label": "Rainy street",
        "prompt_en": "{character} alone on a neon-lit rainy street, umbrella in hand, wet asphalt reflecting cyan and magenta signs, looks up at the night sky, visible breath.",
        "camera": "low-angle medium shot",
        "motion": "still, then slow upward gaze",
        "mood": "melancholic, cinematic",
        "duration": "6",
        "aspect_ratio": "16:9",
        "negative_prompt": "watermark, blur, low quality",
    },
    {
        "label": "Luxury lobby entrance",
        "prompt_en": "{character} steps through the rotating door of a luxury hotel lobby, marble floors and crystal chandelier behind, polished steady cam.",
        "camera": "wide tracking, then dolly-in",
        "motion": "steady walk forward",
        "mood": "elegant, dramatic, high-stakes",
        "duration": "5",
        "aspect_ratio": "16:9",
        "negative_prompt": "distorted face, watermark, blur",
    },
    {
        "label": "Ecommerce full-body spin",
        "prompt_en": "{character} in {outfit} on a seamless white studio cyclorama, one slow 360-degree spin, dress flowing outward, premium fashion lookbook aesthetic.",
        "camera": "full-body wide shot",
        "motion": "360-degree slow spin",
        "mood": "clean, premium ecommerce",
        "duration": "6",
        "aspect_ratio": "9:16",
        "negative_prompt": "watermark, distorted body, extra limbs",
    },
    {
        "label": "Product close-up",
        "prompt_en": "Extreme close-up of {character}'s {body_part} showcasing {product}, soft studio key light, slow lift and rotation revealing all sides, clean white background.",
        "camera": "extreme close-up",
        "motion": "slow lift and rotate",
        "mood": "product showcase, premium",
        "duration": "4",
        "aspect_ratio": "1:1",
        "negative_prompt": "distorted hand, watermark, blur",
    },
]


# ---------------------------------------------------------------------------
# Built-in template CSVs
# ---------------------------------------------------------------------------

BUILT_IN_TEMPLATES: dict[str, dict] = {
    "short_drama": {
        "name": "📽️ Short Drama — 8 Shots",
        "description": (
            "A production-ready 8-shot sequence for a drama episode. "
            "Includes arrival, dialogue, reaction, and exit shots with continuity groups. "
            "Replace the prompts with your character/scene details."
        ),
        "preview_rows": 4,
        "csv": (
            "shot_id,episode,scene_id,continuity_group,character_id,prompt_en,camera,motion,mood,duration,aspect_ratio,negative_prompt\n"
            "s01,EP01,A,ep01_cafe,lin_feng,"
            "\"Close-up of Lin Feng reading a letter, warm afternoon light through cafe window, delicate focus on her eyes\","
            "CU,static,melancholic,5,9:16,blur watermark\n"
            "s02,EP01,A,ep01_cafe,lin_feng,"
            "\"Medium shot of Lin Feng lowering the letter slowly, fingers trembling slightly\","
            "MS,slow_tilt,melancholic,5,9:16,blur watermark\n"
            "s03,EP01,A,ep01_cafe,chen_hao,"
            "\"Medium shot of Chen Hao approaching from the door, carrying two cups of coffee\","
            "MS,walk_in,neutral,5,9:16,blur watermark\n"
            "s04,EP01,A,ep01_cafe,both,"
            "\"Over-the-shoulder two-shot: Lin Feng and Chen Hao sit across from each other, tension in the air\","
            "OTS,rack_focus,tense,5,9:16,blur watermark\n"
            "s05,EP01,B,ep01_rooftop,lin_feng,"
            "\"Wide shot of Lin Feng standing at the rooftop edge, city skyline at dusk\","
            "WS,slow_push,lonely,5,9:16,blur watermark\n"
            "s06,EP01,B,ep01_rooftop,lin_feng,"
            "\"Extreme close-up of Lin Feng's hand releasing a folded paper plane into the wind\","
            "ECU,static,release,4,9:16,blur watermark\n"
            "s07,EP01,B,ep01_rooftop,chen_hao,"
            "\"Medium shot of Chen Hao emerging from the rooftop door, slightly out of breath\","
            "MS,pan_left,urgent,5,9:16,blur watermark\n"
            "s08,EP01,B,ep01_rooftop,both,"
            "\"Wide establishing shot: Lin Feng and Chen Hao silhouetted against the sunset, city below\","
            "WS,slow_push,hopeful,6,9:16,blur watermark\n"
        ),
    },
    "ecommerce": {
        "name": "🛍️ E-commerce Creatives — 6 Shots",
        "description": (
            "Product-focused video ads for social commerce. "
            "Each shot highlights a different selling angle. "
            "Replace product/model details with your own."
        ),
        "preview_rows": 3,
        "csv": (
            "shot_id,episode,scene_id,continuity_group,prompt_en,camera,motion,duration,aspect_ratio,negative_prompt\n"
            "p01,AD01,hero,product_hero,"
            "\"Cinematic product reveal: skincare serum bottle rotating on marble surface, soft studio light, premium shadows\","
            "CU,rotate_360,4,9:16,watermark text logo\n"
            "p02,AD01,hero,product_hero,"
            "\"Slow-motion pour of golden serum from bottle, catching light, luxurious texture\","
            "ECU,slow_pour,4,9:16,watermark blur\n"
            "p03,AD01,lifestyle,product_lifestyle,"
            "\"Young woman in white robe applying serum at vanity mirror, morning light, aspirational\","
            "MS,gentle_push,5,9:16,watermark blur cluttered\n"
            "p04,AD01,lifestyle,product_lifestyle,"
            "\"Close-up of glowing skin after application, soft focus background, clean aesthetic\","
            "CU,rack_focus,4,9:16,pores blemish\n"
            "p05,AD01,results,product_results,"
            "\"Before/after split wipe: left side dry skin, right side radiant glowing skin, same model\","
            "MS,wipe_center,5,9:16,watermark\n"
            "p06,AD01,cta,product_cta,"
            "\"Product pack shot on clean white background with subtle particle bokeh, final frame hold\","
            "WS,slow_push,4,1:1,watermark text\n"
        ),
    },
    "quick_test": {
        "name": "⚡ Quick Test — 3 Shots",
        "description": (
            "3 simple, fast-to-render shots to verify your API key, "
            "concurrency settings, and output folder before running a large batch. "
            "Load this first whenever you set up a new environment."
        ),
        "preview_rows": 3,
        "csv": (
            "shot_id,prompt_en,duration,aspect_ratio\n"
            "test_01,\"A red apple on a white table, soft studio lighting\",4,16:9\n"
            "test_02,\"Ocean waves at sunset, wide shot, cinematic color grade\",4,16:9\n"
            "test_03,\"A single candle flame flickering in darkness, extreme close-up\",4,9:16\n"
        ),
    },
}


def generate_sample_manifest(
    character_name: str,
    scene_name: str,
    continuity_group: str,
    template_indices: list[int] | None = None,
) -> list[dict]:
    """Generate a minimal shot_manifest CSV row list from selected templates.

    ``template_indices`` — which templates to include (0-based). Default: all.
    """
    if template_indices is None:
        template_indices = list(range(len(SAMPLE_PROMPT_TEMPLATES)))

    rows: list[dict] = []
    for idx in template_indices:
        if idx >= len(SAMPLE_PROMPT_TEMPLATES):
            continue
        tmpl = SAMPLE_PROMPT_TEMPLATES[idx]
        prompt = (
            tmpl["prompt_en"]
            .replace("{character}", character_name or "the character")
            .replace("{scene}", scene_name or "the location")
            .replace("{outfit}", "the outfit")
            .replace("{emotion}", "surprise")
            .replace("{body_part}", "wrist")
            .replace("{product}", "the product")
        )
        rows.append(
            {
                "shot_id": f"sample_{idx + 1:03d}",
                "episode": "ep01",
                "scene_id": f"scene_{scene_name[:8].lower().replace(' ', '_') if scene_name else 'main'}",
                "continuity_group": continuity_group or f"ep01_{scene_name[:8].lower().replace(' ', '_') if scene_name else 'main'}",
                "character_id": character_name[:10].lower().replace(" ", "_") if character_name else "char_01",
                "prompt_en": prompt,
                "camera": tmpl.get("camera", ""),
                "motion": tmpl.get("motion", ""),
                "mood": tmpl.get("mood", ""),
                "duration": int(tmpl.get("duration", 5)),
                "aspect_ratio": tmpl.get("aspect_ratio", "16:9"),
                "negative_prompt": tmpl.get("negative_prompt", ""),
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _clean(v: Optional[object]) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    if s.lower() in {"nan", "none", "null"}:
        return ""
    return s


def safe_filename(name: str) -> str:
    keep = "-_.()[]"
    return "".join(c if (c.isalnum() or c in keep) else "_" for c in name).strip("_") or "untitled"


def ensure_output_dir(path: str) -> Path:
    p = Path(os.path.expanduser(path))
    p.mkdir(parents=True, exist_ok=True)
    return p
