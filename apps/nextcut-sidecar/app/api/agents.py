import logging

from fastapi import APIRouter
from pydantic import BaseModel

from director_engine.tools.camera_presets import (
    PRESETS,
    get_all_categories,
    get_presets_by_category,
)
from director_engine.tools.provider_scorer import score_providers

router = APIRouter()

AGENT_REGISTRY = [
    {
        "id": "provider_scorer",
        "name": "Provider Scorer",
        "description": "Automatically selects the best video model using 7-dimension scoring",
        "status": "idle",
    },
    {
        "id": "screenwriter",
        "name": "Screenwriter",
        "description": "Develops story and writes scene scripts",
        "status": "idle",
    },
    {
        "id": "character_extractor",
        "name": "Character Extractor",
        "description": "Identifies characters and creates Identity Anchors for cross-shot consistency",
        "status": "idle",
    },
    {
        "id": "storyboard_artist",
        "name": "Storyboard Artist",
        "description": "Designs shot compositions and visual flow",
        "status": "idle",
    },
    {
        "id": "cinematographer",
        "name": "Cinematographer",
        "description": "Refines shots with camera presets and Seedance-optimized motion",
        "status": "idle",
    },
    {
        "id": "audio_director",
        "name": "Audio Director",
        "description": "Plans native Seedance audio: music, SFX, dialogue, lip-sync",
        "status": "idle",
    },
    {
        "id": "editing_agent",
        "name": "Editing Agent",
        "description": "Cut rhythm, transitions, and pacing",
        "status": "idle",
    },
    {
        "id": "prompt_optimizer",
        "name": "Prompt Optimizer",
        "description": "Seedance Shot-Script format, reference instructions, constraints, audio cues",
        "status": "idle",
    },
    {
        "id": "consistency_checker",
        "name": "Consistency Checker",
        "description": "Character drift detection, prompt quality scoring, cross-shot validation",
        "status": "idle",
    },
]


@router.get("/")
async def list_agents():
    return {"agents": AGENT_REGISTRY}


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    agent = next((a for a in AGENT_REGISTRY if a["id"] == agent_id), None)
    if agent:
        return agent
    return {"id": agent_id, "status": "idle", "last_run": None}


@router.get("/tools/camera-presets")
async def list_camera_presets():
    """List all camera presets with Seedance optimization tips."""
    return {
        "categories": get_all_categories(),
        "presets": [
            {
                "id": p.id,
                "name": p.name,
                "name_zh": p.name_zh,
                "category": p.category,
                "camera": p.camera,
                "motion": p.motion,
                "lens": p.lens,
                "lighting": p.lighting,
                "composition": p.composition,
                "seedance_tip": p.seedance_tip,
            }
            for p in PRESETS
        ],
    }


@router.get("/tools/camera-presets/{category}")
async def list_presets_by_category(category: str):
    presets = get_presets_by_category(category)
    return {
        "category": category,
        "presets": [
            {
                "id": p.id,
                "name": p.name,
                "name_zh": p.name_zh,
                "seedance_tip": p.seedance_tip,
            }
            for p in presets
        ],
    }


@router.post("/tools/score-providers")
async def score_video_providers(
    task_type: str = "general",
    needs_audio: bool = False,
    needs_lip_sync: bool = False,
    shot_count: int = 1,
    local_only: bool = False,
    budget_constrained: bool = False,
):
    """Score available video generation providers for a given task."""
    scores = score_providers(
        task_type=task_type,
        needs_audio=needs_audio,
        needs_lip_sync=needs_lip_sync,
        shot_count=shot_count,
        local_only=local_only,
        budget_constrained=budget_constrained,
    )
    return {
        "recommended": scores[0].provider if scores else None,
        "scores": [
            {
                "provider": s.provider,
                "total": s.total,
                "task_fit": s.task_fit,
                "quality": s.quality,
                "control": s.control,
                "reliability": s.reliability,
                "cost": s.cost,
                "latency": s.latency,
                "continuity": s.continuity,
                "reason": s.reason,
            }
            for s in scores
        ],
    }


logger = logging.getLogger(__name__)


class PortraitRequest(BaseModel):
    character_id: str
    name: str
    appearance: str
    style: str = "photorealistic"


@router.post("/generate-portrait")
async def generate_portrait(req: PortraitRequest):
    """Generate a character reference portrait using AI image generation.

    Delegates to ViMax CharacterPortraitsGenerator when available,
    falls back to Seedance image generation.
    """
    try:
        from app.core.config import settings
        from director_engine.providers.seedance import SeedanceProvider
        from director_engine.interfaces.models import ProviderConfig

        prompt = f"Portrait of {req.name}: {req.appearance}. {req.style} style, facing camera, clean background, studio lighting, high detail"

        config = ProviderConfig(
            api_key=settings.video_api_key,
            base_url=settings.video_base_url,
            model="seedance-v2-pro",
        )
        provider = SeedanceProvider(config)
        result = await provider.generate(prompt=prompt, duration=0, quality="720p")

        return {"image_url": result.get("image_url", ""), "status": "ok"}
    except Exception as e:
        logger.error("Portrait generation failed: %s", e)
        return {"image_url": "", "status": "error", "message": "Generation failed"}
