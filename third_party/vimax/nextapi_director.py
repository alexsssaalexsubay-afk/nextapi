"""NextAPI-facing director adapter for the vendored ViMax project.

This module keeps the ViMax side responsible for story/shot planning while
emitting a payload that ComfyUI and NextAPI can consume directly. It can run the
real ViMax agent chain when a LangChain-compatible chat model is provided, and
keeps a deterministic fallback for offline ComfyUI/client use.
"""

from __future__ import annotations

import json
import re
import importlib.util
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

try:
    from agents.cinematography_shot_agent import deterministic_cinematography_plan
except ModuleNotFoundError:
    _cinema_path = Path(__file__).resolve().parent / "agents" / "cinematography_shot_agent.py"
    _cinema_spec = importlib.util.spec_from_file_location("_nextapi_vimax_cinematography", _cinema_path)
    if _cinema_spec is None or _cinema_spec.loader is None:
        raise
    _cinema_module = importlib.util.module_from_spec(_cinema_spec)
    _cinema_spec.loader.exec_module(_cinema_module)
    deterministic_cinematography_plan = _cinema_module.deterministic_cinematography_plan


AGENT_CHAIN = [
    "screenwriter.develop_story",
    "screenwriter.write_script_based_on_story",
    "script_enhancer.enhance_script",
    "character_extractor.extract_characters",
    "storyboard_artist.design_storyboard",
    "storyboard_artist.decompose_visual_description",
    "cinematography_shot_agent.refine_shot",
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
    composition: str
    edit_intent: str
    prompt: str
    negative_prompt: str
    continuity_group: str
    content: list[dict[str, Any]]
    references: dict[str, str]
    timeline: dict[str, Any]


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
    plan["workbench"] = build_workbench_payload(plan)
    return plan


async def build_nextapi_director_plan_with_agents(
    chat_model: Any,
    script_text: str,
    *,
    shot_count: int = 3,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    style: str = "cinematic realistic",
    character_refs: str = "",
    title: str = "",
    user_requirement: str = "",
) -> dict[str, Any]:
    """Run the real ViMax director agents and emit the shared NextAPI plan.

    This is the production-facing path used by the sidecar/client runtime. The
    sync `build_nextapi_director_plan` remains as a no-key local fallback.
    """

    script = _clean(script_text)
    if not script:
        raise ValueError("script_text is empty")
    shot_count = max(1, min(int(shot_count), 24))
    duration = max(4, min(int(duration), 15))

    from agents.character_extractor import CharacterExtractor
    from agents.cinematography_shot_agent import CinematographyShotAgent
    from agents.screenwriter import Screenwriter
    from agents.script_enhancer import ScriptEnhancer
    from agents.storyboard_artist import StoryboardArtist

    requirement = _agent_requirement(
        shot_count=shot_count,
        duration=duration,
        aspect_ratio=aspect_ratio,
        style=style,
        user_requirement=user_requirement,
    )
    screenwriter = Screenwriter(chat_model)
    story = await screenwriter.develop_story(script, requirement)
    scene_scripts = await screenwriter.write_script_based_on_story(story, requirement)
    if not scene_scripts:
        scene_scripts = [story]

    script_enhancer = ScriptEnhancer.__new__(ScriptEnhancer)
    script_enhancer.chat_model = chat_model
    enhanced_scripts: list[str] = []
    for scene_script in scene_scripts:
        enhanced = await script_enhancer.enhance_script(scene_script)
        enhanced_scripts.append(str(enhanced).strip() or scene_script)
    scene_scripts = enhanced_scripts or scene_scripts

    full_script = "\n\n".join(scene_scripts)
    characters = await CharacterExtractor(chat_model).extract_characters(full_script)
    storyboard_artist = StoryboardArtist(chat_model)
    cinematographer = CinematographyShotAgent(chat_model)
    refs = _parse_refs(character_refs)

    scenes: list[DirectorScene] = []
    shots: list[DirectorShot] = []
    for scene_index, scene_script in enumerate(scene_scripts):
        if len(shots) >= shot_count:
            break
        scene = DirectorScene(
            id=f"scene_{scene_index + 1:02d}",
            index=scene_index + 1,
            title=f"Scene {scene_index + 1}",
            description=scene_script,
        )
        scenes.append(scene)
        remaining = shot_count - len(shots)
        scene_requirement = f"{requirement}\nPlan no more than {remaining} remaining shots."
        brief_shots = await storyboard_artist.design_storyboard(scene_script, characters, scene_requirement)
        for brief in brief_shots:
            if len(shots) >= shot_count:
                break
            decomposed = await storyboard_artist.decompose_visual_description(brief, characters)
            try:
                cinema = await cinematographer.refine_shot(
                    shot=decomposed,
                    scene=scene_script,
                    characters=characters,
                    style=style,
                )
            except Exception:
                cinema = deterministic_cinematography_plan(
                    visual=str(getattr(decomposed, "visual_desc", "") or ""),
                    motion=str(getattr(decomposed, "motion_desc", "") or ""),
                    scene=scene_script,
                    characters=characters,
                    style=style,
                    shot_index=len(shots),
                )
            shots.append(
                _build_shot_from_agent(
                    scene=scene,
                    raw_shot=decomposed,
                    cinema=cinema,
                    global_index=len(shots),
                    local_index=len([s for s in shots if s.scene_id == scene.id]),
                    duration=duration,
                    aspect_ratio=aspect_ratio,
                    refs=refs,
                )
            )

    if not shots:
        return build_nextapi_director_plan(
            script,
            shot_count=shot_count,
            duration=duration,
            aspect_ratio=aspect_ratio,
            style=style,
            character_refs=character_refs,
            title=title,
        )

    summary = _summary(story)
    resolved_title = title.strip() or _title(summary)
    plan = {
        "schema": "nextapi.director_plan.v1",
        "source": "vimax.agent_chain",
        "title": resolved_title,
        "summary": summary,
        "agent_chain": AGENT_CHAIN,
        "scenes": [asdict(scene) for scene in scenes],
        "shots": [asdict(shot) for shot in shots],
    }
    plan["workflow"] = build_comfyui_workflow(plan)
    plan["workbench"] = build_workbench_payload(plan)
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


def build_workbench_payload(plan: dict[str, Any]) -> dict[str, Any]:
    """Emit a compact client-workbench model beside the ComfyUI graph."""

    shots = plan.get("shots") or []
    return {
        "schema": "nextapi.director_workbench.v1",
        "selected_shot_id": shots[0].get("id", "") if shots else "",
        "timeline": [
            {
                "id": shot.get("id", ""),
                "scene_id": shot.get("scene_id", ""),
                "title": shot.get("title", ""),
                "duration": shot.get("duration", 5),
                "camera": shot.get("camera", ""),
                "motion": shot.get("motion", ""),
                "edit_intent": shot.get("edit_intent", ""),
                "prompt": shot.get("prompt", ""),
            }
            for shot in shots
        ],
        "canvas_nodes": [
            {
                "id": shot.get("id", ""),
                "type": "seedance_video",
                "label": shot.get("title", ""),
                "selected": index == 0,
                "params": {
                    "prompt": shot.get("prompt", ""),
                    "duration": shot.get("duration", 5),
                    "aspect_ratio": shot.get("aspect_ratio", "16:9"),
                    "references": shot.get("references", {}),
                },
            }
            for index, shot in enumerate(shots)
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
    cinema = deterministic_cinematography_plan(
        visual=scene.description,
        motion="",
        scene=scene.description,
        characters=[],
        style=style,
        shot_index=global_index,
    )
    camera = cinema.camera
    motion = cinema.motion
    reference_text = _reference_text(refs)
    prompt = ", ".join(
        part
        for part in [
            cinema.prompt,
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
        composition=cinema.composition,
        edit_intent=cinema.edit_intent,
        prompt=prompt,
        negative_prompt=NEGATIVE_PROMPT,
        continuity_group=f"{scene.id}_continuity",
        content=content,
        references=_refs_dict(refs),
        timeline={
            "start": global_index * duration,
            "end": (global_index + 1) * duration,
            "edit_intent": cinema.edit_intent,
        },
    )


def _build_shot_from_agent(
    *,
    scene: DirectorScene,
    raw_shot: Any,
    cinema: Any,
    global_index: int,
    local_index: int,
    duration: int,
    aspect_ratio: str,
    refs: list[str],
) -> DirectorShot:
    visual = str(getattr(raw_shot, "visual_desc", "") or "").strip()
    audio = str(getattr(raw_shot, "audio_desc", "") or "").strip()
    first_frame = str(getattr(raw_shot, "ff_desc", "") or "").strip()
    last_frame = str(getattr(raw_shot, "lf_desc", "") or "").strip()
    camera = str(getattr(cinema, "camera", "") or "").strip()
    motion = str(getattr(cinema, "motion", "") or "").strip()
    composition = str(getattr(cinema, "composition", "") or "").strip()
    edit_intent = str(getattr(cinema, "edit_intent", "") or "").strip()
    base_prompt = str(getattr(cinema, "prompt", "") or visual).strip()
    reference_text = _reference_text(refs)
    prompt = ", ".join(
        part
        for part in [
            base_prompt,
            f"first frame: {first_frame}" if first_frame else "",
            f"last frame: {last_frame}" if last_frame else "",
            f"audio cue: {audio}" if audio else "",
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
        composition=composition,
        edit_intent=edit_intent,
        prompt=prompt,
        negative_prompt=NEGATIVE_PROMPT,
        continuity_group=f"{scene.id}_continuity",
        content=content,
        references=_refs_dict(refs),
        timeline={
            "start": global_index * duration,
            "end": (global_index + 1) * duration,
            "edit_intent": edit_intent,
            "first_frame": first_frame,
            "last_frame": last_frame,
        },
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


def _agent_requirement(
    *,
    shot_count: int,
    duration: int,
    aspect_ratio: str,
    style: str,
    user_requirement: str,
) -> str:
    parts = [
        "Create a production-ready AI video director plan.",
        f"Target shots: {shot_count}.",
        f"Duration per shot: {duration}s.",
        f"Aspect ratio: {aspect_ratio}.",
        f"Visual style: {style}.",
        "Optimize for a node canvas, timeline editor, and Seedance-compatible content[] requests.",
        "Preserve character identity, wardrobe, props, and scene continuity.",
    ]
    if user_requirement.strip():
        parts.append(user_requirement.strip())
    return "\n".join(parts)
