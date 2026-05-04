"""Quick Create API — 一键出片，用户只需输入想法。

核心理念：用户输入一句话或一段描述，系统自动完成：
1. 智能选择最佳模型配置
2. 运行完整的 Director Pipeline
3. 提交视频生成任务
4. 返回实时进度

用户零配置，系统自动基于当前可用资源做最优决策。
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.events import Event, EventType, event_bus
from director_engine.interfaces.models import AgentConfig, LLMProvider, PipelineConfig, ProviderConfig
from director_engine.pipelines.director import DirectorPipeline

router = APIRouter()

_active_jobs: dict[str, dict[str, Any]] = {}

STYLE_PRESETS = {
    "cinematic": {
        "name": "Cinematic Film",
        "name_zh": "电影感",
        "style": "cinematic realistic, film grain, shallow depth of field, Arri Alexa look",
        "aspect_ratio": "16:9",
        "duration": 8,
        "shot_count": 6,
    },
    "anime": {
        "name": "Anime",
        "name_zh": "动漫风",
        "style": "anime style, Studio Ghibli inspired, cel shading, vibrant colors, clean lines",
        "aspect_ratio": "16:9",
        "duration": 5,
        "shot_count": 8,
    },
    "commercial": {
        "name": "Commercial Ad",
        "name_zh": "商业广告",
        "style": "commercial advertisement, clean studio lighting, product focus, high-key, professional",
        "aspect_ratio": "16:9",
        "duration": 5,
        "shot_count": 4,
    },
    "music_video": {
        "name": "Music Video",
        "name_zh": "MV风格",
        "style": "music video aesthetic, dynamic camera, neon lighting, dramatic color grading, fast cuts",
        "aspect_ratio": "9:16",
        "duration": 5,
        "shot_count": 10,
    },
    "documentary": {
        "name": "Documentary",
        "name_zh": "纪录片",
        "style": "documentary style, natural lighting, handheld camera feel, authentic, observational",
        "aspect_ratio": "16:9",
        "duration": 10,
        "shot_count": 6,
    },
    "noir": {
        "name": "Film Noir",
        "name_zh": "黑色电影",
        "style": "film noir, high contrast black and white, dramatic shadows, venetian blinds lighting, moody",
        "aspect_ratio": "21:9",
        "duration": 8,
        "shot_count": 6,
    },
    "dreamy": {
        "name": "Dreamy/Fantasy",
        "name_zh": "梦幻奇幻",
        "style": "ethereal dreamlike, soft focus, pastel color palette, volumetric light, magical particles",
        "aspect_ratio": "16:9",
        "duration": 8,
        "shot_count": 6,
    },
    "social_short": {
        "name": "Social Media Short",
        "name_zh": "社交短视频",
        "style": "eye-catching, bright saturated colors, quick cuts, engaging, trending aesthetic",
        "aspect_ratio": "9:16",
        "duration": 5,
        "shot_count": 6,
    },
    "wuxia": {
        "name": "Wuxia / Chinese Epic",
        "name_zh": "武侠古风",
        "style": "Chinese wuxia epic, flowing silk robes, bamboo forest, ink wash atmosphere, crane shots",
        "aspect_ratio": "21:9",
        "duration": 8,
        "shot_count": 6,
    },
    "cyberpunk": {
        "name": "Cyberpunk",
        "name_zh": "赛博朋克",
        "style": "cyberpunk neon city, rain-slicked streets, holographic displays, blade runner aesthetic",
        "aspect_ratio": "21:9",
        "duration": 8,
        "shot_count": 6,
    },
    "minimal": {
        "name": "Minimalist",
        "name_zh": "极简主义",
        "style": "minimalist clean design, white space, single subject, soft shadows, geometric composition",
        "aspect_ratio": "1:1",
        "duration": 5,
        "shot_count": 4,
    },
    "vintage": {
        "name": "Vintage Film",
        "name_zh": "复古胶片",
        "style": "vintage 8mm film, warm color cast, light leaks, film scratches, nostalgic vignette",
        "aspect_ratio": "4:3",
        "duration": 8,
        "shot_count": 6,
    },
}


class QuickCreateRequest(BaseModel):
    idea: str
    style_preset: str = "cinematic"
    custom_style: str = ""
    shot_count: int | None = None
    duration: int | None = None
    aspect_ratio: str | None = None
    generate_audio: bool = True
    title: str = ""


class QuickCreateResponse(BaseModel):
    job_id: str
    status: str = "started"
    style_used: str = ""
    estimated_steps: int = 9


@router.get("/presets")
async def list_presets():
    """返回所有可用风格预设。"""
    return {"presets": STYLE_PRESETS}


@router.post("/create", response_model=QuickCreateResponse)
async def quick_create(req: QuickCreateRequest, background_tasks: BackgroundTasks):
    """一键出片：输入想法，自动完成全流程。"""
    job_id = f"qc_{uuid.uuid4().hex[:12]}"

    preset = STYLE_PRESETS.get(req.style_preset, STYLE_PRESETS["cinematic"])
    style = req.custom_style or preset["style"]
    shot_count = req.shot_count or preset["shot_count"]
    duration = req.duration or preset["duration"]
    aspect_ratio = req.aspect_ratio or preset["aspect_ratio"]

    _active_jobs[job_id] = {"status": "starting", "progress": 0}
    background_tasks.add_task(
        _run_quick_create, job_id, req.idea, style, shot_count, duration, aspect_ratio, req.generate_audio, req.title
    )
    return QuickCreateResponse(job_id=job_id, style_used=preset.get("name", style))


@router.get("/status/{job_id}")
async def quick_create_status(job_id: str):
    job = _active_jobs.get(job_id)
    if not job:
        return {"error": "not_found"}
    return job


async def _run_quick_create(
    job_id: str, idea: str, style: str, shot_count: int, duration: int, aspect_ratio: str, generate_audio: bool, title: str,
):
    config = _build_smart_config(generate_audio)

    async def on_progress(agent: str, status: str, progress: float, data: dict[str, Any]):
        _active_jobs[job_id] = {"status": f"{agent}:{status}", "progress": round(progress * 100)}
        await event_bus.publish(Event(
            type=EventType.AGENT_PROGRESS,
            data={"job_id": job_id, "agent": agent, "status": status, "progress": progress, **data},
        ))

    try:
        pipeline = DirectorPipeline(config, on_progress=on_progress)
        plan = await pipeline.run(
            idea, shot_count=shot_count, duration=duration, aspect_ratio=aspect_ratio, style=style, title=title,
        )
        _active_jobs[job_id] = {
            "status": "completed",
            "progress": 100,
            "plan": plan.model_dump(),
        }
        await event_bus.publish(Event(
            type=EventType.AGENT_PROGRESS,
            data={"job_id": job_id, "agent": "pipeline", "status": "complete", "progress": 1.0, "title": plan.title},
        ))
    except Exception as e:
        _active_jobs[job_id] = {"status": "failed", "progress": 0, "error": str(e)}
        await event_bus.publish(Event(
            type=EventType.SYSTEM_STATUS,
            data={"job_id": job_id, "status": "failed", "error": str(e)},
        ))


def _build_smart_config(generate_audio: bool = True) -> PipelineConfig:
    """基于当前环境自动构建最优 Pipeline 配置。"""
    agent_config = AgentConfig()

    if settings.openai_api_key:
        agent_config.provider = LLMProvider.OPENAI
        agent_config.model = settings.openai_model or "gpt-4o"
        agent_config.api_key = settings.openai_api_key
        if settings.openai_base_url:
            agent_config.base_url = settings.openai_base_url
    else:
        deepseek_key = settings.__dict__.get("deepseek_api_key") or ""
        if deepseek_key:
            agent_config.provider = LLMProvider.DEEPSEEK
            agent_config.model = "deepseek-chat"
            agent_config.api_key = deepseek_key
        else:
            agent_config.provider = LLMProvider.OLLAMA
            agent_config.model = "qwen2.5:7b"
            agent_config.base_url = settings.ollama_url + "/v1"

    video_config = ProviderConfig(
        provider="seedance",
        model="seedance-2.0-reference-to-video",
        api_key=settings.nextapi_api_key,
        base_url=settings.nextapi_base_url + "/v1" if not settings.nextapi_base_url.endswith("/v1") else settings.nextapi_base_url,
        generate_audio=generate_audio,
    )

    config = PipelineConfig(video_provider=video_config)
    config.set_all_agents(agent_config)
    return config
