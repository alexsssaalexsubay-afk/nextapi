from __future__ import annotations

import httpx
from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()

# Mirrors `backend/internal/gateway/models.go` when live GET /v1/models is unavailable.
NEXTAPI_VIDEO_MODELS_FALLBACK = [
    {
        "id": "seedance-2.0-pro",
        "name": "Seedance 2.0 Pro — multimodal / references",
        "provider": "nextapi",
        "type": "api",
        "source": "static_fallback",
        "family": "seedance",
        "max_duration_seconds": 15,
        "supported_resolutions": ["480p", "720p", "1080p"],
        "supports_audio_output": True,
        "best_for": "Director multi-shot, reference images/videos, consistency",
    },
    {
        "id": "seedance-2.0-fast",
        "name": "Seedance 2.0 Fast",
        "provider": "nextapi",
        "type": "api",
        "source": "static_fallback",
        "family": "seedance",
        "max_duration_seconds": 15,
        "supported_resolutions": ["480p", "720p", "1080p"],
        "supports_audio_output": True,
        "best_for": "Faster iteration, lighter multimodal",
    },
]


def _nextapi_v1_base() -> str:
    b = (settings.nextapi_base_url or "").strip().rstrip("/")
    if not b:
        b = "https://api.nextapi.top"
    return b if b.endswith("/v1") else f"{b}/v1"


async def _fetch_nextapi_catalog() -> tuple[list[dict], str]:
    key = (settings.nextapi_api_key or "").strip()
    if not key:
        return list(NEXTAPI_VIDEO_MODELS_FALLBACK), "fallback_no_key"
    url = f"{_nextapi_v1_base()}/models"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {key}"},
            )
            resp.raise_for_status()
            body = resp.json()
            rows = body.get("data") or []
            out: list[dict] = []
            for m in rows:
                mid = m.get("id")
                if not mid:
                    continue
                out.append(
                    {
                        "id": mid,
                        "name": m.get("description") or mid,
                        "provider": "nextapi",
                        "type": "api",
                        "source": "api.nextapi.top",
                        "family": m.get("family"),
                        "max_duration_seconds": m.get("max_duration_seconds"),
                        "min_duration_seconds": m.get("min_duration_seconds"),
                        "supported_resolutions": m.get("supported_resolutions"),
                        "supported_aspect_ratios": m.get("supported_aspect_ratios"),
                        "supports_audio_output": m.get("supports_audio_output"),
                        "modality_support": m.get("modality_support"),
                        "status": m.get("status"),
                    }
                )
            if out:
                return out, "live"
    except Exception:
        pass
    return list(NEXTAPI_VIDEO_MODELS_FALLBACK), "fallback_error"


@router.get("/")
async def list_models():
    """Local Ollama models + NextAPI video catalogue (live when key is set)."""
    models: list[dict] = []

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                for m in data.get("models", []):
                    models.append(
                        {
                            "id": f"ollama/{m['name']}",
                            "name": m["name"],
                            "provider": "ollama",
                            "type": "local",
                            "source": "ollama",
                            "size": m.get("size", 0),
                        }
                    )
    except Exception:
        pass

    api_rows, catalogue_origin = await _fetch_nextapi_catalog()
    models.extend(api_rows)

    return {"models": models, "catalogue_origin": catalogue_origin}


@router.get("/ollama/status")
async def ollama_status():
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            return {"connected": resp.status_code == 200}
    except Exception:
        return {"connected": False}


@router.get("/seedance/capabilities")
async def seedance_capabilities():
    """Return detailed Seedance 2.0 capabilities and best practices."""
    return {
        "public_model_ids": ["seedance-2.0-pro", "seedance-2.0-fast"],
        "openapi": "https://api.nextapi.top/v1 (see repo backend/api/openapi.yaml)",
        "input_modes": ["text", "image", "video", "audio"],
        "max_references": {
            "images": 9,
            "videos": 3,
            "audio": 3,
            "total": 12,
        },
        "reference_system": {
            "syntax": "Natural language in prompt (NO @Tag syntax)",
            "note": "References are passed via image_urls/video_urls/audio_urls arrays. Use 'image 1', 'video 1', 'audio 1' in prompt text to describe each reference's role.",
            "usage_patterns": {
                "character_identity": "image 1 as the character's face and outfit",
                "camera_movement": "video 1 for camera movement reference",
                "motion_reference": "character moves with the rhythm of video 1",
                "audio_rhythm": "audio 1 as the soundtrack, sync cuts to beat drops",
                "style_reference": "image 2 for visual style and color palette",
                "first_last_frame": "image 1 as the first frame and image 2 as the last frame",
            },
        },
        "audio_generation": {
            "native": True,
            "lip_sync_languages": ["en", "zh", "es", "ru", "ja", "ko", "fr", "pt"],
            "triggers": {
                "sfx": "Describe sounds naturally in prompt",
                "dialogue": 'Put in double quotes: She speaks: "Hello"',
                "ambient": "Describe environment sounds",
                "music": "Describe mood/genre in prompt",
            },
        },
        "prompt_best_practices": {
            "optimal_length": "30-80 words",
            "structure": "[Shot type] + [Subject] + [Action] + [Camera] + [Style]",
            "key_rules": [
                "ONE action per shot",
                "ONE camera movement per shot",
                "SVO sentence structure",
                "Physical descriptions > abstract concepts",
                "First instruction carries most weight",
                "Fold avoid-list into prompt as a Constraints line (no separate negative field in /v1/videos input)",
            ],
            "shot_script_format": "[00:00-00:05] Shot 1: Description...",
        },
        "consistency": {
            "summary": "Use seedance-2.0-pro with reference images + explicit character lines in prompts; keep wardrobe/lighting verbs repeated shot-to-shot.",
            "director": "Lock continuity_group and reuse reference URLs across shots in the same scene.",
        },
        "strengths_vs_competitors": {
            "vs_kling": "Better multi-shot consistency, native audio; Kling better for motion control",
            "vs_sora": "Better reference control, faster iteration; Sora better for cinematic atmosphere",
            "vs_ltx": "Higher quality, native audio; LTX is free and local",
        },
    }
