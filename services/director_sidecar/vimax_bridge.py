from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

from .nextapi_provider import NextAPIChatModel


class PipelineUnavailable(RuntimeError):
    pass


class ManagedDirectorBridge:
    """Runs the vendored director/storyboard flow through NextAPI providers."""

    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root
        self.vendor_root = repo_root / "third_party" / "vimax"

    async def run(self, request: Any) -> dict[str, Any]:
        if not request.policy.no_external_keys:
            raise PipelineUnavailable("external keys are not allowed")
        components = self._load_components()
        chat_model = NextAPIChatModel(
            callback_base_url=request.callback.base_url,
            callback_token=request.callback.token,
            provider_id=request.text_provider_id,
        )
        user_requirement = _build_user_requirement(request)
        screenwriter = components["Screenwriter"](chat_model)
        story = await screenwriter.develop_story(request.story, user_requirement)
        scripts = await screenwriter.write_script_based_on_story(story, user_requirement)
        if not scripts:
            scripts = [story]
        script_text = "\n\n".join(scripts)
        characters = await components["CharacterExtractor"](chat_model).extract_characters(script_text)
        storyboard_artist = components["StoryboardArtist"](chat_model)
        shots: list[dict[str, Any]] = []
        per_scene_limit = max(1, request.shot_count)
        for scene_index, script in enumerate(scripts):
            if len(shots) >= request.shot_count:
                break
            remaining = request.shot_count - len(shots)
            scene_requirement = f"{user_requirement}\nThis scene should contribute no more than {min(per_scene_limit, remaining)} shots."
            scene_shots = await storyboard_artist.design_storyboard(script, characters, scene_requirement)
            for raw_shot in scene_shots:
                if len(shots) >= request.shot_count:
                    break
                shots.append(_map_shot(raw_shot, len(shots), scene_index, request, characters))
        if not shots:
            raise PipelineUnavailable("director pipeline returned no shots")
        return {
            "storyboard": {
                "title": _derive_title(story),
                "summary": _derive_summary(story),
                "shots": shots,
            },
            "audit": {
                "source": "vendored_director_pipeline",
                "reusable_modules": [
                    "screenwriter.develop_story",
                    "screenwriter.write_script_based_on_story",
                    "character_extractor.extract_characters",
                    "storyboard_artist.design_storyboard",
                ],
                "replaced_model_exits": [
                    "chat_model.ainvoke -> NextAPI textProvider",
                    "image_generator -> NextAPI imageProvider (deferred)",
                    "video_generator -> NextAPI createVideoTask/workflow",
                ],
                "blocked_direct_keys": [
                    "direct LLM api_key",
                    "direct image api_key",
                    "direct video api_key",
                ],
                "workflow_destination": "nextapi.director.storyboard.v1",
            },
        }

    def _load_components(self) -> dict[str, Any]:
        if not self.vendor_root.exists():
            raise PipelineUnavailable("vendored director source is missing")
        vendor = str(self.vendor_root)
        if vendor not in sys.path:
            sys.path.insert(0, vendor)
        return {
            "Screenwriter": _load_class(self.vendor_root / "agents" / "screenwriter.py", "Screenwriter"),
            "CharacterExtractor": _load_class(self.vendor_root / "agents" / "character_extractor.py", "CharacterExtractor"),
            "StoryboardArtist": _load_class(self.vendor_root / "agents" / "storyboard_artist.py", "StoryboardArtist"),
        }


def _load_class(path: Path, class_name: str) -> Any:
    if not path.exists():
        raise PipelineUnavailable(f"missing pipeline module: {path.name}")
    module_name = f"_nextapi_director_{path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise PipelineUnavailable(f"cannot load pipeline module: {path.name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, class_name)


def _build_user_requirement(request: Any) -> str:
    parts = [
        "You are operating inside NextAPI Director. Do not mention upstream project names, vendors, API keys, base URLs, or implementation internals.",
        "Output values should follow the user's language.",
        "Maintain consistent characters, costumes, setting continuity, and emotional progression.",
        f"Target shot count: {request.shot_count}.",
        f"Duration per shot: {request.duration_per_shot} seconds.",
    ]
    if request.genre:
        parts.append(f"Genre: {request.genre}.")
    if request.style:
        parts.append(f"Visual style: {request.style}.")
    if request.scene:
        parts.append(f"Scene constraints: {request.scene}.")
    if request.characters:
        parts.append("Existing character constraints:")
        for character in request.characters:
            parts.append(f"- {character.name}: {character.description}")
    return "\n".join(parts)


def _map_shot(raw_shot: Any, index: int, scene_index: int, request: Any, characters: list[Any]) -> dict[str, Any]:
    visual = str(getattr(raw_shot, "visual_desc", "") or "").strip()
    audio = str(getattr(raw_shot, "audio_desc", "") or "").strip()
    camera_idx = getattr(raw_shot, "cam_idx", None)
    camera = f"camera {camera_idx}" if camera_idx is not None else "cinematic camera"
    continuity = _character_continuity(characters)
    prompt_parts = [
        visual,
        audio,
        continuity,
        "cinematic quality, stable face, same character, consistent clothing, natural body proportions, no distortion, stable camera movement",
    ]
    image_parts = [
        visual,
        continuity,
        "high quality cinematic keyframe, clean composition, consistent character design",
    ]
    return {
        "shotIndex": index + 1,
        "title": f"Scene {scene_index + 1} Shot {index + 1}",
        "duration": request.duration_per_shot,
        "scene": f"Scene {scene_index + 1}",
        "camera": camera,
        "emotion": _infer_emotion(audio),
        "action": visual,
        "videoPrompt": ", ".join(p for p in prompt_parts if p),
        "imagePrompt": ", ".join(p for p in image_parts if p),
        "negativePrompt": "low quality, distorted body, unstable face, inconsistent clothing, extra limbs, flicker, watermark, text overlay",
        "referenceAssets": [],
    }


def _character_continuity(characters: list[Any]) -> str:
    fragments: list[str] = []
    for character in characters[:6]:
        name = str(getattr(character, "identifier_in_scene", "") or "").strip()
        static_features = str(getattr(character, "static_features", "") or "").strip()
        dynamic_features = str(getattr(character, "dynamic_features", "") or "").strip()
        if name:
            fragments.append(f"{name}: {static_features} {dynamic_features}".strip())
    if not fragments:
        return ""
    return "Character continuity: " + "; ".join(fragments)


def _infer_emotion(audio: str) -> str:
    lowered = audio.lower()
    for token in ["happy", "sad", "angry", "fear", "calm", "tense", "surprised"]:
        if token in lowered:
            return token
    return "cinematic"


def _derive_title(story: str) -> str:
    for line in story.splitlines():
        line = line.strip(" #：:*-")
        if line:
            return line[:80]
    return "NextAPI Director Plan"


def _derive_summary(story: str) -> str:
    compact = " ".join(part.strip() for part in story.split())
    return compact[:500]
