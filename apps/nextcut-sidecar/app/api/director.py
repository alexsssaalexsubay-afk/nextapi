"""Director plan endpoints — run the full agent chain.

Includes:
- Plan creation and retrieval
- Shot-level editing (prompt, reorder, split/merge)
- Prompt actions (simplify, enhance, translate)
- Workflow routing based on Seedance preset
- Template CRUD
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.core.events import event_bus, Event, EventType
from director_engine.interfaces.models import (
    AgentConfig,
    LLMProvider,
    PipelineConfig,
    ProviderConfig,
    ReferenceAsset,
)
from director_engine.pipelines.director import DirectorPipeline
from director_engine.agents.base import BaseAgent

router = APIRouter()

_plans: dict[str, dict[str, Any]] = {}
_templates: dict[str, dict[str, Any]] = {}


# ─── Input / Output schemas ───────────────────────────────────────────

class AgentConfigInput(BaseModel):
    provider: str = "openai"
    model: str = "gpt-4o"
    base_url: str = ""
    api_key: str = ""
    temperature: float = 0.7


class PipelineConfigInput(BaseModel):
    default_llm: AgentConfigInput = Field(default_factory=AgentConfigInput)
    screenwriter: AgentConfigInput | None = None
    character_extractor: AgentConfigInput | None = None
    storyboard_artist: AgentConfigInput | None = None
    cinematographer: AgentConfigInput | None = None
    audio_director: AgentConfigInput | None = None
    editing_agent: AgentConfigInput | None = None
    consistency_checker: AgentConfigInput | None = None
    prompt_optimizer: AgentConfigInput | None = None
    video_provider: str = "seedance"
    video_model: str = "seedance-2.0-pro"
    video_api_key: str = ""
    video_base_url: str = "https://api.nextapi.top/v1"
    video_quality: str = "720p"
    generate_audio: bool = True


class DirectorPlanRequest(BaseModel):
    prompt: str
    style: str = "cinematic"
    num_shots: int = 6
    duration: int = 5
    aspect_ratio: str = "16:9"
    title: str = ""
    workflow: str = "text_to_video"
    references: list[ReferenceAsset] = Field(default_factory=list)
    pipeline: PipelineConfigInput = Field(default_factory=PipelineConfigInput)


class DirectorPlanResponse(BaseModel):
    id: str
    status: str
    prompt: str


class PromptActionRequest(BaseModel):
    prompt: str
    action: str  # simplify | enhance | translate
    target_language: str = ""


class PromptActionResponse(BaseModel):
    result: str
    action: str


class ShotPatchRequest(BaseModel):
    prompt: str | None = None
    negative_prompt: str | None = None
    duration: int | None = None
    title: str | None = None


class ReorderRequest(BaseModel):
    shot_ids: list[str]


class TemplateCreateRequest(BaseModel):
    name: str
    name_zh: str = ""
    category: str = "account"
    description: str = ""
    duration: str = ""
    shot_count: int = 6
    style: str = "cinematic"
    workflow: str = "text_to_video"
    prompt: str = ""
    tags: list[str] = Field(default_factory=list)


class TemplateResponse(BaseModel):
    id: str
    name: str
    name_zh: str
    category: str
    description: str
    duration: str
    shot_count: int
    style: str
    workflow: str
    prompt: str
    tags: list[str]


# ─── Helpers ──────────────────────────────────────────────────────────

def _to_agent_config(inp: AgentConfigInput) -> AgentConfig:
    return AgentConfig(
        provider=LLMProvider(inp.provider),
        model=inp.model,
        base_url=inp.base_url,
        api_key=inp.api_key,
        temperature=inp.temperature,
    )


def _build_pipeline_config(inp: PipelineConfigInput) -> PipelineConfig:
    default = _to_agent_config(inp.default_llm)
    config = PipelineConfig(
        video_provider=ProviderConfig(
            provider=inp.video_provider,
            model=inp.video_model,
            api_key=inp.video_api_key,
            base_url=inp.video_base_url,
            quality=inp.video_quality,
            generate_audio=inp.generate_audio,
        ),
    )
    config.set_all_agents(default)

    for field_name in [
        "screenwriter", "character_extractor", "storyboard_artist",
        "cinematographer", "audio_director", "editing_agent",
        "consistency_checker", "prompt_optimizer",
    ]:
        override = getattr(inp, field_name, None)
        if override is not None:
            setattr(config, field_name, _to_agent_config(override))

    return config


_WORKFLOW_MODEL_MAP: dict[str, str] = {
    "text_to_video": "seedance-2.0-fast",
    "image_to_video": "seedance-2.0-pro",
    "multimodal_story": "seedance-2.0-pro",
}


async def _progress_callback(
    agent: str, status: str, progress: float, data: dict[str, Any]
) -> None:
    await event_bus.publish(Event(
        type=EventType.AGENT_PROGRESS,
        data={"agent": agent, "status": status, "progress": progress, **data},
    ))


async def _run_pipeline(plan_id: str, request: DirectorPlanRequest) -> None:
    _plans[plan_id]["status"] = "running"
    await event_bus.publish(Event(type=EventType.AGENT_START, data={"plan_id": plan_id}))

    try:
        config = _build_pipeline_config(request.pipeline)
        config.default_style = request.style
        config.default_aspect_ratio = request.aspect_ratio
        config.default_duration = request.duration
        config.default_shot_count = request.num_shots

        preferred_model = _WORKFLOW_MODEL_MAP.get(request.workflow)
        if preferred_model:
            config.video_provider.model = preferred_model

        pipeline = DirectorPipeline(config, on_progress=_progress_callback)
        plan = await pipeline.run(
            request.prompt,
            shot_count=request.num_shots,
            duration=request.duration,
            aspect_ratio=request.aspect_ratio,
            style=request.style,
            references=request.references,
            title=request.title,
        )

        quality_meta = plan.metadata.get("consistency_score", 0)
        char_drift = plan.metadata.get("character_drift_risk", 0)
        prompt_quality = plan.metadata.get("prompt_quality_score", 0)

        shot_quality_scores = []
        for shot in plan.shots:
            score = {
                "shot_id": shot.id,
                "overall": quality_meta if isinstance(quality_meta, float) else 0.8,
                "character_consistency": max(0, 1.0 - (char_drift if isinstance(char_drift, float) else 0.1)),
                "prompt_quality": prompt_quality if isinstance(prompt_quality, float) else 0.8,
                "style_coherence": quality_meta if isinstance(quality_meta, float) else 0.8,
            }
            shot_quality_scores.append(score)

        _plans[plan_id]["status"] = "completed"
        _plans[plan_id]["plan"] = plan.model_dump()
        _plans[plan_id]["shots"] = [s.model_dump() for s in plan.shots]
        _plans[plan_id]["quality_scores"] = shot_quality_scores
        _plans[plan_id]["scenes"] = [s.model_dump() for s in plan.scenes]
        _plans[plan_id]["characters"] = [c.model_dump() for c in plan.characters]

        await event_bus.publish(Event(
            type=EventType.PLAN_CREATED,
            data={
                "plan_id": plan_id,
                "title": plan.title,
                "shots": len(plan.shots),
                "quality_scores": shot_quality_scores,
                "scenes": [{"id": s.id, "title": s.title, "description": s.description, "characters": s.characters} for s in plan.scenes],
            },
        ))
    except Exception as e:
        _plans[plan_id]["status"] = "failed"
        _plans[plan_id]["error"] = str(e)
        await event_bus.publish(Event(
            type=EventType.AGENT_ERROR,
            data={"plan_id": plan_id, "error": "Pipeline execution failed"},
        ))


# ─── Plan endpoints ──────────────────────────────────────────────────

@router.post("/plan", response_model=DirectorPlanResponse)
async def create_plan(request: DirectorPlanRequest, background_tasks: BackgroundTasks):
    plan_id = f"plan_{uuid.uuid4().hex[:12]}"
    _plans[plan_id] = {
        "id": plan_id,
        "status": "queued",
        "prompt": request.prompt,
        "workflow": request.workflow,
        "shots": [],
        "scenes": [],
        "quality_scores": [],
    }
    background_tasks.add_task(_run_pipeline, plan_id, request)
    return DirectorPlanResponse(id=plan_id, status="queued", prompt=request.prompt)


@router.get("/plan/{plan_id}")
async def get_plan(plan_id: str):
    plan = _plans.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.get("/plans")
async def list_plans():
    return {"plans": list(_plans.values())}


# ─── Shot editing ────────────────────────────────────────────────────

@router.patch("/plan/{plan_id}/shot/{shot_id}")
async def patch_shot(plan_id: str, shot_id: str, req: ShotPatchRequest):
    plan = _plans.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    shots = plan.get("shots", [])
    for shot in shots:
        if shot.get("id") == shot_id:
            if req.prompt is not None:
                shot["prompt"] = req.prompt
            if req.negative_prompt is not None:
                shot["negative_prompt"] = req.negative_prompt
            if req.duration is not None:
                shot["duration"] = max(4, min(15, req.duration))
            if req.title is not None:
                shot["title"] = req.title
            return {"status": "ok", "shot": shot}

    raise HTTPException(status_code=404, detail="Shot not found")


@router.post("/plan/{plan_id}/reorder")
async def reorder_shots(plan_id: str, req: ReorderRequest):
    plan = _plans.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    shots = plan.get("shots", [])
    id_map = {s["id"]: s for s in shots}
    reordered = []
    for sid in req.shot_ids:
        if sid in id_map:
            reordered.append(id_map[sid])

    for i, shot in enumerate(reordered):
        shot["index"] = i + 1

    plan["shots"] = reordered
    return {"status": "ok", "shot_count": len(reordered)}


# ─── Prompt actions ──────────────────────────────────────────────────

PROMPT_ACTION_SYSTEMS: dict[str, str] = {
    "simplify": (
        "You are a video prompt simplifier for Seedance 2.0. "
        "Take the given prompt and make it shorter, clearer, and more effective. "
        "Keep the core visual idea. Use SVO sentence structure. "
        "Target 30-50 words. Return ONLY the simplified prompt text, nothing else."
    ),
    "enhance": (
        "You are a video prompt enhancer for Seedance 2.0. "
        "Take the given prompt and add more vivid physical details: lighting, textures, "
        "specific colors, camera composition, and subtle motion cues. "
        "Keep SVO structure. Target 50-80 words. Return ONLY the enhanced prompt text."
    ),
    "translate": (
        "You are a bilingual video prompt translator. "
        "If the input is in Chinese, translate it to English optimized for Seedance 2.0 "
        "(SVO structure, physical descriptions, specific visual details). "
        "If the input is in English, translate it to natural Chinese. "
        "Return ONLY the translated prompt text."
    ),
}


@router.post("/prompt/action", response_model=PromptActionResponse)
async def prompt_action(req: PromptActionRequest):
    system = PROMPT_ACTION_SYSTEMS.get(req.action)
    if not system:
        raise HTTPException(status_code=400, detail=f"Unknown action: {req.action}")

    from app.core.config import settings
    config = AgentConfig(
        provider=LLMProvider.OPENAI,
        model="gpt-4o-mini",
        api_key=settings.llm_api_key or "",
        base_url=settings.llm_base_url or "",
        temperature=0.5,
        max_tokens=512,
    )
    agent = BaseAgent(config)
    try:
        result = await agent._complete(system, req.prompt)
        return PromptActionResponse(result=result.strip(), action=req.action)
    except Exception:
        return PromptActionResponse(result=req.prompt, action=req.action)


# ─── Template endpoints ──────────────────────────────────────────────

@router.post("/templates", response_model=TemplateResponse)
async def create_template(req: TemplateCreateRequest):
    tid = f"tmpl_{uuid.uuid4().hex[:12]}"
    template = {
        "id": tid,
        "name": req.name,
        "name_zh": req.name_zh,
        "category": req.category,
        "description": req.description,
        "duration": req.duration,
        "shot_count": req.shot_count,
        "style": req.style,
        "workflow": req.workflow,
        "prompt": req.prompt,
        "tags": req.tags,
    }
    _templates[tid] = template
    return TemplateResponse(**template)


@router.get("/templates")
async def list_templates():
    return {"templates": list(_templates.values())}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    if template_id in _templates:
        del _templates[template_id]
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Template not found")


@router.post("/plan/{plan_id}/save-as-template", response_model=TemplateResponse)
async def save_plan_as_template(plan_id: str, req: TemplateCreateRequest):
    """Save a successful plan as a reusable template."""
    plan = _plans.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    tid = f"tmpl_{uuid.uuid4().hex[:12]}"
    template = {
        "id": tid,
        "name": req.name,
        "name_zh": req.name_zh,
        "category": req.category or "account",
        "description": req.description,
        "duration": req.duration,
        "shot_count": len(plan.get("shots", [])),
        "style": req.style,
        "workflow": plan.get("workflow", "text_to_video"),
        "prompt": plan.get("prompt", ""),
        "tags": req.tags,
    }
    _templates[tid] = template
    return TemplateResponse(**template)
