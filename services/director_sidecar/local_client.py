from __future__ import annotations

import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(prefix="/client/api", tags=["local-client"])


class LocalDirectorRunRequest(BaseModel):
    api_key: str = Field(min_length=1)
    story: str = Field(min_length=1)
    engine: str = "advanced"
    genre: str = "short drama"
    style: str = "cinematic realistic"
    scene: str = ""
    shot_count: int = Field(default=3, ge=1, le=12)
    duration_per_shot: int = Field(default=5, ge=4, le=15)
    ratio: str = "9:16"
    resolution: str = "720p"
    model: str = "seedance-2.0-pro"
    generate_audio: bool = True
    run_workflow: bool = False
    generate_images: bool = False
    merge: bool = True
    references: list[str] = Field(default_factory=list)


class PromptRefineRequest(BaseModel):
    prompt: str = Field(min_length=1)
    mode: str = "director"
    style: str = "cinematic realistic"
    ratio: str = "9:16"
    duration: int = Field(default=5, ge=4, le=15)
    references: list[str] = Field(default_factory=list)


class PromptRefineResponse(BaseModel):
    refined_prompt: str
    negative_prompt: str
    checklist: list[str]
    structured: dict[str, str]


@router.post("/director/run")
async def run_director(request: LocalDirectorRunRequest) -> dict[str, Any]:
    if not request.api_key.strip():
        raise HTTPException(status_code=400, detail="NextAPI API key is required")
    if not request.story.strip():
        raise HTTPException(status_code=400, detail="Story is required")

    payload = {
        "engine": request.engine,
        "story": request.story.strip(),
        "genre": request.genre,
        "style": request.style,
        "scene": request.scene,
        "shot_count": request.shot_count,
        "duration_per_shot": request.duration_per_shot,
        "ratio": request.ratio,
        "resolution": request.resolution,
        "model": request.model,
        "generate_audio": request.generate_audio,
        "run_workflow": request.run_workflow,
        "generate_images": request.generate_images,
        "merge": request.merge,
        "references": request.references,
    }
    base_url = os.getenv("NEXTAPI_PUBLIC_API_BASE", "https://api.nextapi.top").rstrip("/")
    timeout = httpx.Timeout(connect=10.0, read=120.0, write=20.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(
                f"{base_url}/v1/director/mode/run",
                headers={
                    "Authorization": f"Bearer {request.api_key.strip()}",
                    "Content-Type": "application/json",
                    "User-Agent": "NextAPI-Director-Studio/0.1",
                },
                json=payload,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"NextAPI request failed: {exc}") from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_safe_error_detail(response))

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="NextAPI returned a non-JSON response") from exc


@router.post("/prompt/refine", response_model=PromptRefineResponse)
async def refine_prompt_endpoint(request: PromptRefineRequest) -> PromptRefineResponse:
    return refine_prompt(request)


def refine_prompt(request: PromptRefineRequest) -> PromptRefineResponse:
    prompt = _compact_space(request.prompt)
    subject = _extract_subject(prompt)
    action = _extract_action(prompt)
    scene = _extract_scene(prompt)
    camera = _extract_camera(prompt)
    reference = _reference_policy(request.references)
    continuity = (
        "Maintain the same identity, wardrobe, body proportions, lighting direction, and emotional arc "
        "across the whole shot."
    )
    quality = (
        "cinematic quality, stable footage, clear facial features, natural motion, sharp details, "
        "no flickering, no ghosting, no warped hands, no face deformation"
    )
    audio = "Generate natural ambience and restrained dialogue only when it supports the scene."
    negative = (
        "cartoon, anime, fake face, plastic skin, oversmoothed skin, facial distortion, face deformation, "
        "unstable identity, extra fingers, blurry, low quality, watermark, subtitles, text overlays"
    )

    refined = (
        f"{subject}. {action}. {scene}. Visual style: {request.style}. "
        f"Camera: {camera}. Duration: {request.duration}s, aspect ratio: {request.ratio}. "
        f"{reference} {continuity} {audio} Quality guardrails: {quality}."
    )
    checklist = [
        "Subject and action are explicit",
        "Scene, lighting, and style are named",
        "Camera movement is specified",
        "Continuity and face/body stability are locked",
        "Reference policy avoids direct provider-key or local-file exposure",
    ]
    structured = {
        "subject": subject,
        "action": action,
        "scene": scene,
        "camera": camera,
        "continuity": continuity,
        "reference_policy": reference,
        "quality_terms": quality,
        "audio_cue": audio,
    }
    return PromptRefineResponse(
        refined_prompt=refined,
        negative_prompt=negative,
        checklist=checklist,
        structured=structured,
    )


def _safe_error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        text = response.text.strip()
        return text[:300] if text else f"NextAPI returned HTTP {response.status_code}"

    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            message = error.get("message") or error.get("code")
            if message:
                return str(message)
        detail = body.get("detail") or body.get("message")
        if isinstance(detail, str):
            return detail
        if isinstance(detail, dict):
            message = detail.get("message") or detail.get("code")
            if message:
                return str(message)
    return f"NextAPI returned HTTP {response.status_code}"


def _compact_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _extract_subject(prompt: str) -> str:
    lower = prompt.lower()
    if "product" in lower or "perfume" in lower or "phone" in lower:
        return "A hero product is presented as the central subject"
    if "city" in lower or "street" in lower:
        return "A main character moves through an urban scene"
    if "woman" in lower or "girl" in lower or "man" in lower or "person" in lower:
        return "The referenced person is the central character"
    return f"Main subject: {prompt[:120]}"


def _extract_action(prompt: str) -> str:
    lower = prompt.lower()
    if "walk" in lower or "走" in prompt:
        return "The subject walks with controlled, natural movement"
    if "turn" in lower or "转" in prompt:
        return "The subject turns slowly while keeping identity stable"
    if "replace" in lower or "替换" in prompt:
        return "Replace the requested element while preserving camera movement and scene continuity"
    if "dance" in lower or "跳舞" in prompt:
        return "The subject performs a smooth, physically plausible movement sequence"
    return "The action follows the user's prompt with clear beginning, middle, and end beats"


def _extract_scene(prompt: str) -> str:
    lower = prompt.lower()
    if "night" in lower or "夜" in prompt:
        return "Night setting with motivated practical lights and controlled contrast"
    if "forest" in lower or "森林" in prompt:
        return "Forest setting with soft natural light and layered depth"
    if "beach" in lower or "海边" in prompt:
        return "Beach setting with wind, water movement, and warm ambient light"
    if "studio" in lower or "棚" in prompt:
        return "Studio setting with clean background separation and polished lighting"
    return "Setting and lighting are derived from the prompt with cinematic spatial depth"


def _extract_camera(prompt: str) -> str:
    lower = prompt.lower()
    if "close" in lower or "特写" in prompt:
        return "medium close-up, slow push-in, stable framing"
    if "drone" in lower or "航拍" in prompt:
        return "wide aerial tracking shot with smooth forward motion"
    if "orbit" in lower or "环绕" in prompt:
        return "half-orbit camera move with stable subject lock"
    if "handheld" in lower or "手持" in prompt:
        return "handheld-stable movement with subtle natural sway"
    return "medium shot, slow push-in, smooth camera movement"


def _reference_policy(references: list[str]) -> str:
    count = len([item for item in references if item.strip()])
    if count <= 0:
        return "No external media reference is required for this pass."
    return (
        f"Use {count} approved NextAPI asset reference(s) in order as Image 1, Image 2, etc.; "
        "do not use arbitrary local paths or provider-side uploads."
    )
