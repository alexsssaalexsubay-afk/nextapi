"""Cinematography shot agent for NextAPI Director plans.

The Director Engine storyboard agent decomposes shots into first frame, last
frame, and motion. This agent adds a production-workbench layer on top:
camera language, edit intent, model-ready prompt text, and UI timeline notes.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


SYSTEM_PROMPT = """
[Role]
You are a senior cinematographer and AI video prompt director.

[Task]
Refine one storyboard shot into production-ready camera language for a short
video generation workflow. Preserve the storyboard content, but make the shot
more useful for a node canvas, a timeline editor, and Seedance-style video
generation.

[Output]
{format_instructions}

[Guidelines]
- Keep the output language aligned with the input.
- Use concrete camera grammar: shot size, angle, lens feel, movement, pacing.
- Add continuity notes for character identity, wardrobe, props, and scene logic.
- Do not mention internal model names, provider keys, upstream projects, or API
  base URLs.
- Avoid negative-prompt keyword stuffing in the positive prompt.
"""

HUMAN_PROMPT = """
<STYLE>
{style}
</STYLE>

<SCENE>
{scene}
</SCENE>

<SHOT>
{shot}
</SHOT>

<CHARACTERS>
{characters}
</CHARACTERS>
"""


class CinematographyPlan(BaseModel):
    camera: str = Field(description="Camera language for the shot.")
    motion: str = Field(description="Motion and pacing direction.")
    composition: str = Field(description="Composition and visual hierarchy.")
    continuity: str = Field(description="Identity, wardrobe, prop, and setting continuity.")
    edit_intent: str = Field(description="Why this shot exists in the timeline.")
    prompt: str = Field(description="A video-generation prompt ready for Seedance-style APIs.")


class CinematographyShotAgent:
    def __init__(self, chat_model: Any):
        self.chat_model = chat_model

    async def refine_shot(
        self,
        *,
        shot: Any,
        scene: str,
        characters: list[Any],
        style: str,
    ) -> CinematographyPlan:
        from langchain_core.output_parsers import PydanticOutputParser
        from langchain_core.prompts import ChatPromptTemplate

        parser = PydanticOutputParser(pydantic_object=CinematographyPlan)
        prompt_template = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                ("human", HUMAN_PROMPT),
            ]
        )
        chain = prompt_template | self.chat_model | parser
        return await chain.ainvoke(
            {
                "format_instructions": parser.get_format_instructions(),
                "style": style,
                "scene": scene,
                "shot": _stringify_shot(shot),
                "characters": _stringify_characters(characters),
            }
        )


def deterministic_cinematography_plan(
    *,
    visual: str,
    motion: str,
    scene: str,
    characters: list[Any],
    style: str,
    shot_index: int,
) -> CinematographyPlan:
    camera = _camera_for(shot_index, motion)
    refined_motion = motion.strip() or _motion_for(shot_index)
    continuity = _continuity(characters)
    composition = _composition_for(shot_index)
    edit_intent = _edit_intent_for(shot_index)
    prompt = ", ".join(
        part
        for part in [
            visual.strip(),
            f"scene context: {scene.strip()}" if scene.strip() else "",
            f"visual style: {style.strip()}" if style.strip() else "",
            camera,
            refined_motion,
            composition,
            continuity,
        ]
        if part
    )
    return CinematographyPlan(
        camera=camera,
        motion=refined_motion,
        composition=composition,
        continuity=continuity,
        edit_intent=edit_intent,
        prompt=prompt,
    )


def _stringify_shot(shot: Any) -> str:
    fields = [
        ("visual", getattr(shot, "visual_desc", "")),
        ("first_frame", getattr(shot, "ff_desc", "")),
        ("last_frame", getattr(shot, "lf_desc", "")),
        ("motion", getattr(shot, "motion_desc", "")),
        ("audio", getattr(shot, "audio_desc", "")),
        ("variation", getattr(shot, "variation_type", "")),
    ]
    return "\n".join(f"{key}: {value}" for key, value in fields if str(value).strip())


def _stringify_characters(characters: list[Any]) -> str:
    lines = []
    for index, character in enumerate(characters):
        name = getattr(character, "identifier_in_scene", "") or getattr(character, "name", "") or f"Character {index + 1}"
        static = getattr(character, "static_features", "") or getattr(character, "description", "")
        dynamic = getattr(character, "dynamic_features", "")
        lines.append(f"{index + 1}. {name}: {static} {dynamic}".strip())
    return "\n".join(lines)


def _camera_for(index: int, motion: str) -> str:
    lowered = motion.lower()
    if "close" in lowered or "push" in lowered:
        return "slow push-in close-up, eye-level, shallow depth of field"
    if "wide" in lowered or index == 0:
        return "wide establishing shot, eye-level, stable horizon"
    cameras = [
        "medium tracking shot, eye-level, controlled handheld-stable feel",
        "over-the-shoulder dialogue shot, soft foreground framing",
        "low-angle medium shot, subtle dolly-in for emphasis",
        "profile two-shot, slow lateral pan",
    ]
    return cameras[index % len(cameras)]


def _motion_for(index: int) -> str:
    motions = [
        "stable opening hold, then a restrained forward move",
        "slow push-in as emotion becomes clearer",
        "smooth lateral pan following the subject",
        "brief pause, then a controlled turn toward the camera",
    ]
    return motions[index % len(motions)]


def _composition_for(index: int) -> str:
    values = [
        "clear foreground, subject in the middle third, readable environment",
        "subject face remains unobstructed, background simplified for identity lock",
        "leading lines guide attention toward the key action",
        "negative space leaves room for motion without cropping limbs",
    ]
    return values[index % len(values)]


def _edit_intent_for(index: int) -> str:
    values = [
        "establish the world and the main subject",
        "tighten emotional focus and reveal intent",
        "connect action across the timeline",
        "create a strong endpoint for the next shot",
    ]
    return values[index % len(values)]


def _continuity(characters: list[Any]) -> str:
    fragments = []
    for character in characters[:6]:
        name = getattr(character, "identifier_in_scene", "") or getattr(character, "name", "")
        static = getattr(character, "static_features", "") or getattr(character, "description", "")
        dynamic = getattr(character, "dynamic_features", "")
        if name:
            fragments.append(f"{name}: {static} {dynamic}".strip())
    if not fragments:
        return "keep character identity, wardrobe, props, and scene lighting consistent"
    return "continuity lock: " + "; ".join(fragments)
