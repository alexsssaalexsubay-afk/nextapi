import logging
import uuid

from fastapi import APIRouter
from pydantic import BaseModel, Field

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
        "name": "生成服务推荐",
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
        "name": "剪辑建议",
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


class GeneratedImageAsset(BaseModel):
    id: str
    url: str
    role: str
    description: str
    prompt: str


class ImageAssetFailure(BaseModel):
    role: str
    message: str


class CharacterAssetRequest(BaseModel):
    character_id: str
    name: str
    appearance: str
    personality: str = ""
    voice: str = ""
    style: str = "photorealistic commercial film"
    modes: list[str] = Field(default_factory=lambda: ["turnaround", "expressions", "outfits", "poses"])


class StoryboardAssetRequest(BaseModel):
    shot_id: str
    title: str = ""
    prompt: str
    shot_script: str = ""
    first_frame_desc: str = ""
    last_frame_desc: str = ""
    motion_desc: str = ""
    style: str = "cinematic realistic"
    aspect_ratio: str = "16:9"
    modes: list[str] = Field(default_factory=lambda: ["storyboard_keyframe", "first_frame", "last_frame"])


@router.post("/generate-portrait")
async def generate_portrait(req: PortraitRequest):
    """Generate a character reference portrait using AI image generation.

    Uses DALL-E 3 via OpenAI API to ensure high-quality character references
    for identity anchoring in Seedance.
    """
    try:
        from app.core.config import settings
        from openai import AsyncOpenAI
        
        client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url or None)
        
        prompt = (
            f"A high-quality character reference sheet for {req.name}. "
            f"Appearance: {req.appearance}. "
            f"Style: {req.style}. "
            f"The character is facing forward, standing against a pure white background, studio lighting. "
            f"Perfect for character consistency reference."
        )

        response = await client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )

        return {"image_url": response.data[0].url, "status": "ok"}
    except Exception as e:
        logger.error("Portrait generation failed: %s", e)
        return {"image_url": "", "status": "error", "message": "Generation failed"}


@router.post("/generate-character-assets")
async def generate_character_assets(req: CharacterAssetRequest):
    """Generate a real identity asset pack: turnaround, expressions, outfits, poses."""
    assets: list[GeneratedImageAsset] = []
    failures: list[ImageAssetFailure] = []

    for mode in req.modes:
        prompt = _character_asset_prompt(req, mode)
        try:
            url = await _generate_image(prompt, aspect_ratio="1:1")
            assets.append(GeneratedImageAsset(
                id=f"{req.character_id}-{mode}-{uuid.uuid4().hex[:8]}",
                url=url,
                role=f"character_{mode}",
                description=_character_asset_description(mode),
                prompt=prompt,
            ))
        except Exception as e:
            logger.error("Character asset generation failed for %s/%s: %s", req.character_id, mode, e)
            failures.append(ImageAssetFailure(role=mode, message="Generation failed"))

    return {
        "status": "ok" if assets and not failures else "partial" if assets else "error",
        "assets": [asset.model_dump() for asset in assets],
        "failures": [failure.model_dump() for failure in failures],
    }


@router.post("/generate-storyboard-assets")
async def generate_storyboard_assets(req: StoryboardAssetRequest):
    """Generate storyboard keyframes and first/last frame images for a shot."""
    assets: list[GeneratedImageAsset] = []
    failures: list[ImageAssetFailure] = []

    for mode in req.modes:
        prompt = _storyboard_asset_prompt(req, mode)
        try:
            url = await _generate_image(prompt, aspect_ratio=req.aspect_ratio)
            assets.append(GeneratedImageAsset(
                id=f"{req.shot_id}-{mode}-{uuid.uuid4().hex[:8]}",
                url=url,
                role=mode,
                description=_storyboard_asset_description(mode),
                prompt=prompt,
            ))
        except Exception as e:
            logger.error("Storyboard asset generation failed for %s/%s: %s", req.shot_id, mode, e)
            failures.append(ImageAssetFailure(role=mode, message="Generation failed"))

    return {
        "status": "ok" if assets and not failures else "partial" if assets else "error",
        "assets": [asset.model_dump() for asset in assets],
        "failures": [failure.model_dump() for failure in failures],
    }


async def _generate_image(prompt: str, aspect_ratio: str = "1:1") -> str:
    from app.core.config import settings
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url or None)
    response = await client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size=_image_size_for_ratio(aspect_ratio),
        quality="standard",
        n=1,
    )
    return response.data[0].url or ""


def _image_size_for_ratio(aspect_ratio: str) -> str:
    if aspect_ratio in {"16:9", "21:9", "4:3"}:
        return "1792x1024"
    if aspect_ratio == "9:16":
        return "1024x1792"
    return "1024x1024"


def _character_asset_prompt(req: CharacterAssetRequest, mode: str) -> str:
    base = (
        f"Create a clean production-ready character asset sheet for {req.name}. "
        f"Appearance anchor: {req.appearance}. "
        f"Personality: {req.personality or 'not specified'}. "
        f"Style: {req.style}. White or very light neutral background, consistent face, consistent body proportions, "
        "no text labels, no watermark, high detail, useful as an AI video identity reference."
    )
    if mode == "turnaround":
        return base + " Show the same character as a three-view turnaround: front view, side profile, and back view, full body, neutral pose."
    if mode == "expressions":
        return base + " Show six consistent head-and-shoulders expressions: neutral, smile, focused, surprised, worried, determined."
    if mode == "outfits":
        return base + " Show three outfit variations that preserve identity: hero outfit, casual outfit, production-safe alternate outfit."
    if mode == "poses":
        return base + " Show four action poses that preserve identity: standing, walking, reaching, looking back, cinematic natural posture."
    return base + f" Create a {mode} reference image that preserves identity."


def _character_asset_description(mode: str) -> str:
    return {
        "turnaround": "三视图身份锚点：正面、侧面、背面。",
        "expressions": "表情集：用于跨镜头面部一致性。",
        "outfits": "服装集：用于换装但保持身份。",
        "poses": "姿态集：用于动作镜头垫图。",
    }.get(mode, f"角色参考资产：{mode}")


def _storyboard_asset_prompt(req: StoryboardAssetRequest, mode: str) -> str:
    context = req.shot_script or req.prompt
    base = (
        f"Create a professional video storyboard frame for shot {req.shot_id} {req.title}. "
        f"Style: {req.style}. Aspect ratio intent: {req.aspect_ratio}. "
        f"Shot prompt: {req.prompt}. Shot script: {context}. Camera motion: {req.motion_desc or 'natural cinematic camera movement'}. "
        "No text overlay, no watermark, clear composition, production storyboard quality."
    )
    if mode == "first_frame":
        return base + f" This is the FIRST FRAME. Visual requirement: {req.first_frame_desc or 'establish the subject, environment, and starting camera composition clearly'}."
    if mode == "last_frame":
        return base + f" This is the LAST FRAME. Visual requirement: {req.last_frame_desc or 'show the resolved end pose and final camera composition clearly'}."
    return base + " This is the main storyboard keyframe that best represents the shot."


def _storyboard_asset_description(mode: str) -> str:
    return {
        "storyboard_keyframe": "分镜关键帧：用于缩略图和画面确认。",
        "first_frame": "首帧垫图：用于 image-to-video 起点约束。",
        "last_frame": "尾帧垫图：用于镜头结束构图与下一镜头连续性。",
    }.get(mode, f"分镜资产：{mode}")
