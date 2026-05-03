"""NextAPI-facing director adapter for the vendored ViMax project.

This module keeps the ViMax side responsible for story/shot planning while
emitting a payload that ComfyUI and NextAPI can consume directly. It is local
and deterministic by default so the customer toolkit can run without model keys.

TODO(nextapi): Replace the deterministic planner with the real ViMax agent chain:
Screenwriter -> ScriptEnhancer -> CharacterExtractor -> StoryboardArtist.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from typing import Any


AGENT_CHAIN = [
    "screenwriter.develop_story",
    "screenwriter.write_script_based_on_story",
    "script_enhancer.enhance_script",
    "character_extractor.extract_characters",
    "storyboard_artist.design_storyboard",
    "storyboard_artist.decompose_visual_description",
]

QUALITY_TERMS = (
    "cinematic quality, stable face, same character, consistent clothing, "
    "natural body proportions, no distortion, stable camera movement, sharp details"
)

NEGATIVE_PROMPT = (
    "low quality, distorted body, unstable face, inconsistent clothing, extra limbs, "
    "flicker, watermark, text overlay"
)


@dataclass(frozen=True)
class DirectorScene:
    id: str
    index: int
    title: str
    description: str


@dataclass(frozen=True)
class DirectorShot:
    id: str
    scene_id: str
    index: int
    title: str
    duration: int
    aspect_ratio: str
    camera: str
    motion: str
    prompt: str
    negative_prompt: str
    continuity_group: str
    content: list[dict[str, Any]]
    references: dict[str, str]


def build_nextapi_director_plan(
    script_text: str,
    *,
    shot_count: int = 3,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    style: str = "cinematic realistic",
    character_refs: str = "",
    title: str = "",
) -> dict[str, Any]:
    """Return a ViMax-derived plan for NextAPI and ComfyUI workflows.

    `character_refs` accepts newline/comma separated URL or asset:// references.
    Approved `asset://` references are preserved so real-person portrait material
    can flow through the NextAPI asset-library path instead of direct uploads.
    """

    script = _clean(script_text)
    if not script:
        raise ValueError("script_text is empty")
    shot_count = max(1, min(int(shot_count), 24))
    duration = max(4, min(int(duration), 15))
    scenes = _build_scenes(script, shot_count)
    refs = _parse_refs(character_refs)
    shots: list[DirectorShot] = []
    for scene in scenes:
        if len(shots) >= shot_count:
            break
        local_index = len([s for s in shots if s.scene_id == scene.id])
        shot = _build_shot(
            scene=scene,
            global_index=len(shots),
            local_index=local_index,
            duration=duration,
            aspect_ratio=aspect_ratio,
            style=style,
            refs=refs,
        )
        shots.append(shot)

    summary = _summary(script)
    resolved_title = title.strip() or _title(summary)
    plan = {
        "schema": "nextapi.director_plan.v1",
        "source": "vimax.nextapi_director",
        "title": resolved_title,
        "summary": summary,
        "agent_chain": AGENT_CHAIN,
        "scenes": [asdict(scene) for scene in scenes],
        "shots": [asdict(shot) for shot in shots],
    }
    plan["workflow"] = build_comfyui_workflow(plan)
    return plan


def build_comfyui_workflow(plan: dict[str, Any]) -> dict[str, Any]:
    """Emit a compact ComfyUI-style graph for the first planned shot."""

    first_shot = (plan.get("shots") or [{}])[0]
    return {
        "version": 1,
        "name": f"NextAPI Director - {plan.get('title', 'Untitled')}",
        "nodes": [
            {"id": "auth", "type": "NextAPIAuth", "params": {}},
            {
                "id": "director",
                "type": "NextAPIDirectorPlan",
                "params": {
                    "title": plan.get("title", ""),
                    "shot_count": len(plan.get("shots") or []),
                },
            },
            {
                "id": "generate_first_shot",
                "type": "NextAPIGenerateVideo",
                "params": {
                    "prompt": first_shot.get("prompt", ""),
                    "duration": first_shot.get("duration", 5),
                    "aspect_ratio": first_shot.get("aspect_ratio", "16:9"),
                    "negative_prompt": first_shot.get("negative_prompt", NEGATIVE_PROMPT),
                    "camera": first_shot.get("camera", ""),
                    "motion": first_shot.get("motion", ""),
                    "continuity_group": first_shot.get("continuity_group", ""),
                    "shot_id": first_shot.get("id", ""),
                },
            },
            {"id": "poll", "type": "NextAPIPollJob", "params": {}},
            {"id": "download", "type": "NextAPIDownloadResult", "params": {}},
        ],
        "edges": [
            ["auth", "generate_first_shot"],
            ["director", "generate_first_shot"],
            ["generate_first_shot", "poll"],
            ["poll", "download"],
        ],
    }


def plan_to_json(plan: dict[str, Any]) -> str:
    return json.dumps(plan, ensure_ascii=False, indent=2)


def _build_scenes(script: str, shot_count: int) -> list[DirectorScene]:
    parts = _split_script(script)
    if len(parts) > shot_count:
        parts = parts[:shot_count]
    return [
        DirectorScene(
            id=f"scene_{idx + 1:02d}",
            index=idx + 1,
            title=f"Scene {idx + 1}",
            description=part,
        )
        for idx, part in enumerate(parts)
    ]


def _build_shot(
    *,
    scene: DirectorScene,
    global_index: int,
    local_index: int,
    duration: int,
    aspect_ratio: str,
    style: str,
    refs: list[str],
) -> DirectorShot:
    camera = _camera_for(global_index)
    motion = _motion_for(global_index)
    reference_text = _reference_text(refs)
    prompt = ", ".join(
        part
        for part in [
            scene.description,
            f"visual style: {style}",
            camera,
            motion,
            reference_text,
            QUALITY_TERMS,
        ]
        if part
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for ref in refs[:9]:
        content.append({"type": "image_url", "image_url": {"url": ref}, "role": "reference_image"})
    return DirectorShot(
        id=f"{scene.id}_shot_{local_index + 1:02d}",
        scene_id=scene.id,
        index=global_index + 1,
        title=f"{scene.title} Shot {local_index + 1}",
        duration=duration,
        aspect_ratio=aspect_ratio,
        camera=camera,
        motion=motion,
        prompt=prompt,
        negative_prompt=NEGATIVE_PROMPT,
        continuity_group=f"{scene.id}_continuity",
        content=content,
        references=_refs_dict(refs),
    )


def _split_script(script: str) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", script) if p.strip()]
    if len(paragraphs) >= 2:
        return paragraphs
    sentences = [p.strip() for p in re.split(r"(?<=[。！？.!?])\s+", script) if p.strip()]
    if len(sentences) >= 2:
        return sentences
    return [script]


def _parse_refs(value: str) -> list[str]:
    refs = [p.strip() for p in re.split(r"[\n,]+", value or "") if p.strip()]
    return refs[:9]


def _reference_text(refs: list[str]) -> str:
    if not refs:
        return "No direct portrait upload; use NextAPI asset library when real-person identity must be preserved"
    labels = [f"Image {idx + 1}" for idx, _ in enumerate(refs[:9])]
    return "Preserve authorized identity and visual continuity from " + ", ".join(labels)


def _refs_dict(refs: list[str]) -> dict[str, str]:
    keys = ("character_url", "outfit_url", "scene_url", "reference_video_url")
    return {key: refs[idx] for idx, key in enumerate(keys) if idx < len(refs)}


def _camera_for(index: int) -> str:
    cameras = [
        "medium tracking shot",
        "slow push-in close-up",
        "wide establishing shot",
        "over-the-shoulder dialogue shot",
        "low-angle dramatic shot",
    ]
    return cameras[index % len(cameras)]


def _motion_for(index: int) -> str:
    motions = [
        "stable camera, gentle forward movement",
        "character pauses then turns toward camera",
        "smooth lateral pan with controlled pacing",
        "subtle handheld-stable emotional movement",
        "slow dolly-out revealing the environment",
    ]
    return motions[index % len(motions)]


def _summary(script: str) -> str:
    return script[:220].rstrip() + ("..." if len(script) > 220 else "")


def _title(summary: str) -> str:
    text = re.sub(r"\s+", " ", summary).strip()
    return text[:32].rstrip("，。,. ") or "Untitled Director Plan"


def _clean(value: str) -> str:
    return re.sub(r"[ \t]+", " ", (value or "").strip())
