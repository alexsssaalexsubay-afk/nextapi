"""Production bible helpers for the local Director engine.

The product core is not a giant prompt dictionary. It is a compact,
repeatable contract that keeps characters, references, camera grammar,
and render constraints stable from script to timeline.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from director_engine.interfaces.models import Character, DirectorScene, DirectorShot, ReferenceAsset


class CharacterLock(BaseModel):
    name: str
    appearance_anchor: str = ""
    voice_anchor: str = ""
    reference_policy: str = ""


class SceneLock(BaseModel):
    scene_id: str
    palette: str = ""
    location_anchor: str = ""
    continuity_rule: str = ""


class ShotGenerationCard(BaseModel):
    shot_id: str
    prompt_role: str = ""
    motion_contract: str = ""
    camera_contract: str = ""
    reference_contract: str = ""
    risk_flags: list[str] = Field(default_factory=list)
    edit_note: str = ""


class PromptReviewFinding(BaseModel):
    shot_id: str
    severity: str = "info"
    code: str = ""
    message: str = ""
    suggestion: str = ""


class ProductionBible(BaseModel):
    schema_version: str = "nextcut.production_bible.v1"
    title: str = ""
    style_contract: str = ""
    format_contract: str = ""
    reference_policy: str = ""
    character_locks: list[CharacterLock] = Field(default_factory=list)
    scene_locks: list[SceneLock] = Field(default_factory=list)
    prompt_rules: list[str] = Field(default_factory=list)
    render_checks: list[str] = Field(default_factory=list)


def build_production_bible(
    *,
    title: str,
    style: str,
    aspect_ratio: str,
    duration: int,
    scenes: list[DirectorScene],
    characters: list[Character],
    references: list[ReferenceAsset],
) -> ProductionBible:
    """Build a deterministic project contract for downstream agents and UI."""

    has_portrait_refs = any(r.type == "image" for r in references) or any(
        c.reference_images for c in characters
    )
    has_motion_refs = any(r.type == "video" for r in references)
    has_audio_refs = any(r.type == "audio" for r in references)

    reference_policy = "Text-only: prompts must carry all visual identity and scene details."
    if has_portrait_refs:
        reference_policy = (
            "Reference-driven: use approved image assets as identity/style anchors; prompt motion and camera only."
        )
    if has_motion_refs:
        reference_policy += " Reuse video references only for motion trajectory or camera rhythm."
    if has_audio_refs:
        reference_policy += " Audio references can guide rhythm, but must be paired with image or video context."

    prompt_rules = [
        "Describe what should happen; avoid negative phrasing as the main control surface.",
        "One primary subject action and one primary camera movement per shot.",
        "Use concrete physical motion, texture, lighting direction, and spatial positions.",
        "When references exist, call them image 1, video 1, audio 1 in natural language.",
        "For dialogue, include speaker attribution and wrap spoken words in double quotes.",
    ]

    render_checks = [
        "Prompt is specific enough for visual execution, but not a full prose paragraph.",
        "Reference count respects provider limits: images <= 9, videos <= 3, audio <= 3.",
        "Duration stays between 4 and 15 seconds.",
        "Resolution is 480p, 720p, or 1080p.",
        "Character wardrobe and facial anchors do not drift between shots.",
    ]

    return ProductionBible(
        title=title,
        style_contract=f"{style}; {aspect_ratio}; {duration}s shot units; mobile-editable timeline.",
        format_contract=(
            "Storyboard -> shot generation cards -> provider payload -> timeline assembly. "
            "Each shot card must be editable without rewriting the whole project."
        ),
        reference_policy=reference_policy,
        character_locks=[
            CharacterLock(
                name=c.name,
                appearance_anchor=c.appearance,
                voice_anchor=c.voice,
                reference_policy=(
                    "Use the same approved portrait/reference asset in every shot where this character appears."
                    if c.reference_images else
                    "No approved portrait asset yet; keep the full appearance anchor verbatim in every prompt."
                ),
            )
            for c in characters
        ],
        scene_locks=[
            SceneLock(
                scene_id=s.id,
                palette=_guess_palette(style, s.description),
                location_anchor=s.description[:220],
                continuity_rule=(
                    "Keep location, weather, lighting direction, and prop positions stable until the scene changes."
                ),
            )
            for s in scenes
        ],
        prompt_rules=prompt_rules,
        render_checks=render_checks,
    )


def bible_context_for_prompt(bible: ProductionBible, shot: DirectorShot) -> str:
    """Return a compact context block for the prompt optimizer."""

    char_names = [c.name for c in bible.character_locks if c.name.lower() in shot.prompt.lower()]
    char_lines = [
        f"- {c.name}: {c.appearance_anchor}. {c.reference_policy}"
        for c in bible.character_locks
        if not char_names or c.name in char_names
    ]
    scene = next((s for s in bible.scene_locks if s.scene_id == shot.scene_id), None)
    scene_line = (
        f"Scene lock: {scene.location_anchor}. Palette: {scene.palette}. {scene.continuity_rule}"
        if scene else ""
    )
    return "\n".join(
        [
            "=== NEXTCUT PRODUCTION BIBLE ===",
            f"Style contract: {bible.style_contract}",
            f"Reference policy: {bible.reference_policy}",
            scene_line,
            "Character locks:",
            *(char_lines or ["- No named character lock."]),
            "Prompt rules:",
            *[f"- {rule}" for rule in bible.prompt_rules],
        ]
    )


def build_shot_generation_card(shot: DirectorShot, bible: ProductionBible) -> ShotGenerationCard:
    refs = shot.references
    ref_parts = []
    if any(r.type == "image" for r in refs):
        ref_parts.append("image references define character/object identity")
    if any(r.type == "video" for r in refs):
        ref_parts.append("video references define motion/camera rhythm")
    if any(r.type == "audio" for r in refs):
        ref_parts.append("audio references define beat/voice texture")

    return ShotGenerationCard(
        shot_id=shot.id,
        prompt_role="Generation card for a single editable timeline clip.",
        motion_contract=shot.decomposition.motion_desc or "One visible subject action.",
        camera_contract=_compact_join([shot.camera.camera, shot.camera.motion, shot.camera.lens]),
        reference_contract="; ".join(ref_parts) or bible.reference_policy,
        risk_flags=[f.code for f in review_generation_prompt(shot)],
        edit_note=_compact_join([shot.edit.rhythm, shot.edit.transition_type, shot.edit.color_grade]),
    )


def review_generation_prompt(shot: DirectorShot) -> list[PromptReviewFinding]:
    """Fast deterministic review before expensive generation."""

    findings: list[PromptReviewFinding] = []
    prompt = shot.prompt or ""
    words = re.findall(r"\S+", prompt)
    lower = prompt.lower()

    if not prompt.strip():
        findings.append(_finding(shot.id, "critical", "empty_prompt", "Prompt is empty.", "Write a concrete visual action."))
    elif len(words) < 18:
        findings.append(_finding(shot.id, "warning", "thin_prompt", "Prompt may be too thin for text-to-video.", "Add subject, action, camera, lighting, and setting."))
    elif len(words) > 150:
        findings.append(_finding(shot.id, "warning", "overlong_prompt", "Prompt is likely too dense for stable generation.", "Move secondary ideas into separate shots."))

    if "@" in prompt:
        findings.append(_finding(shot.id, "critical", "tag_syntax", "Provider references should not use @ tags.", "Use natural language such as image 1 or video 1."))

    negative_phrases = [" no ", " don't ", " do not ", " without ", "不要", "不能", "没有"]
    padded = f" {lower} "
    if any(p in padded for p in negative_phrases):
        findings.append(_finding(shot.id, "info", "negative_control", "Prompt relies on negative phrasing.", "Rewrite as a positive target behavior."))

    action_verbs = [
        "walk", "runs", "run", "jump", "jumps", "turn", "turns", "grab", "grabs",
        "draw", "draws", "shoot", "shoots", "fall", "falls", "smile", "smiles",
        "raise", "raises", "look", "looks", "push", "pushes",
    ]
    verb_hits = sum(1 for v in action_verbs if re.search(rf"\b{re.escape(v)}\b", lower))
    if verb_hits > 3:
        findings.append(_finding(shot.id, "warning", "verb_bloat", "Shot may contain too many separate actions.", "Split this into multiple timeline clips."))

    if shot.duration < 4 or shot.duration > 15:
        findings.append(_finding(shot.id, "critical", "duration_range", "Duration is outside provider range.", "Use 4 to 15 seconds."))

    if shot.generation_params:
        quality = shot.generation_params.quality
        if quality not in ("480p", "720p", "1080p"):
            findings.append(_finding(shot.id, "critical", "resolution_value", "Resolution is not provider-compatible.", "Use 480p, 720p, or 1080p."))
        if len(shot.generation_params.image_urls) > 9:
            findings.append(_finding(shot.id, "critical", "too_many_images", "Too many image references.", "Keep image references <= 9."))
        if len(shot.generation_params.video_urls) > 3:
            findings.append(_finding(shot.id, "critical", "too_many_videos", "Too many video references.", "Keep video references <= 3."))
        if len(shot.generation_params.audio_urls) > 3:
            findings.append(_finding(shot.id, "critical", "too_many_audio", "Too many audio references.", "Keep audio references <= 3."))

    return findings


def prompt_review_summary(findings: list[PromptReviewFinding]) -> dict[str, Any]:
    return {
        "critical": sum(1 for f in findings if f.severity == "critical"),
        "warning": sum(1 for f in findings if f.severity == "warning"),
        "info": sum(1 for f in findings if f.severity == "info"),
        "findings": [f.model_dump() for f in findings],
    }


def _finding(shot_id: str, severity: str, code: str, message: str, suggestion: str) -> PromptReviewFinding:
    return PromptReviewFinding(
        shot_id=shot_id,
        severity=severity,
        code=code,
        message=message,
        suggestion=suggestion,
    )


def _guess_palette(style: str, description: str) -> str:
    text = f"{style} {description}".lower()
    if any(k in text for k in ["cyber", "neon", "赛博"]):
        return "neon cyan/magenta with wet dark contrast"
    if any(k in text for k in ["noir", "detective", "黑色"]):
        return "low-key monochrome contrast"
    if any(k in text for k in ["anime", "ghibli", "miyazaki", "动画"]):
        return "soft painterly color with clean silhouettes"
    if any(k in text for k in ["commercial", "product", "广告"]):
        return "clean high-key commercial lighting"
    return "cinematic natural contrast with stable lighting direction"


def _compact_join(parts: list[str]) -> str:
    return "; ".join(p.strip() for p in parts if p and p.strip())
