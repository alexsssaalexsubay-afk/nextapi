"""Video generation API — submit shots to Seedance and track progress.

Bridges the gap between a completed DirectorPlan and actual video generation:
1. Accept a shot with generation params
2. Submit to Seedance 2.0 via NextAPI relay
3. Poll for completion
4. Update status via EventBus

RenderJob observability: each job records template, version, key parameters,
failure reasons, and retry counts for debugging and optimization.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.events import event_bus, Event, EventType
from director_engine.interfaces.models import ProviderConfig, VideoGenerationParams
from director_engine.providers.seedance import SeedanceProvider

logger = logging.getLogger(__name__)

router = APIRouter()

_generation_jobs: dict[str, dict[str, Any]] = {}


class GenerateRequest(BaseModel):
    shot_id: str
    prompt: str
    negative_prompt: str = ""
    duration: int = 5
    quality: str = "720p"
    aspect_ratio: str = "16:9"
    generate_audio: bool = True
    image_urls: list[str] = Field(default_factory=list)
    video_urls: list[str] = Field(default_factory=list)
    audio_urls: list[str] = Field(default_factory=list)
    model: str = ""
    api_key: str = ""
    base_url: str = ""
    template_id: str = ""
    template_version: str = ""
    workflow: str = "text_to_video"


class BatchGenerateRequest(BaseModel):
    shots: list[GenerateRequest]
    sequential: bool = True


class RenderJobStats(BaseModel):
    shot_id: str
    status: str
    provider_job_id: str = ""
    model: str = ""
    workflow: str = ""
    template_id: str = ""
    template_version: str = ""
    resolution: str = ""
    duration: int = 0
    ref_image_count: int = 0
    ref_video_count: int = 0
    ref_audio_count: int = 0
    prompt_word_count: int = 0
    retry_count: int = 0
    failure_reason: str = ""
    estimated_cost_cents: int = 0
    started_at: float = 0.0
    completed_at: float = 0.0
    elapsed_ms: int = 0


@router.post("/submit")
async def submit_generation(req: GenerateRequest, background_tasks: BackgroundTasks):
    """Submit a single shot for video generation."""
    config = _build_provider_config(req)
    params = _build_params(req)

    _generation_jobs[req.shot_id] = _init_job_record(req, params)
    background_tasks.add_task(_run_generation, req.shot_id, config, params)
    return {"shot_id": req.shot_id, "status": "queued"}


@router.post("/batch")
async def batch_generation(req: BatchGenerateRequest, background_tasks: BackgroundTasks):
    """Submit multiple shots for generation (sequential or parallel)."""
    for shot_req in req.shots:
        params = _build_params(shot_req)
        _generation_jobs[shot_req.shot_id] = _init_job_record(shot_req, params)

    background_tasks.add_task(_run_batch, req.shots, req.sequential)
    return {
        "status": "queued",
        "shots": [s.shot_id for s in req.shots],
        "mode": "sequential" if req.sequential else "parallel",
    }


@router.get("/status/{shot_id}")
async def generation_status(shot_id: str):
    job = _generation_jobs.get(shot_id)
    if not job:
        return {"error": "not_found"}
    return job


@router.get("/jobs")
async def list_generation_jobs():
    return {"jobs": list(_generation_jobs.values())}


@router.get("/jobs/stats")
async def job_stats():
    """Aggregated RenderJob statistics for observability."""
    jobs = list(_generation_jobs.values())
    total = len(jobs)
    succeeded = sum(1 for j in jobs if j.get("status") == "succeeded")
    failed = sum(1 for j in jobs if j.get("status") == "failed")
    processing = sum(1 for j in jobs if j.get("status") in ("processing", "submitting"))
    total_retries = sum(j.get("retry_count", 0) for j in jobs)
    avg_elapsed = 0
    completed_jobs = [j for j in jobs if j.get("elapsed_ms", 0) > 0]
    if completed_jobs:
        avg_elapsed = sum(j["elapsed_ms"] for j in completed_jobs) // len(completed_jobs)

    failure_reasons: dict[str, int] = {}
    for j in jobs:
        reason = j.get("failure_reason", "")
        if reason:
            failure_reasons[reason] = failure_reasons.get(reason, 0) + 1

    return {
        "total": total,
        "succeeded": succeeded,
        "failed": failed,
        "processing": processing,
        "total_retries": total_retries,
        "avg_elapsed_ms": avg_elapsed,
        "failure_reasons": failure_reasons,
    }


def _init_job_record(req: GenerateRequest, params: VideoGenerationParams) -> dict[str, Any]:
    return {
        "shot_id": req.shot_id,
        "status": "queued",
        "model": params.model,
        "workflow": req.workflow,
        "template_id": req.template_id,
        "template_version": req.template_version,
        "resolution": req.quality,
        "duration": req.duration,
        "ref_image_count": len(req.image_urls),
        "ref_video_count": len(req.video_urls),
        "ref_audio_count": len(req.audio_urls),
        "prompt_word_count": len(req.prompt.split()),
        "retry_count": 0,
        "failure_reason": "",
        "estimated_cost_cents": 0,
        "started_at": 0.0,
        "completed_at": 0.0,
        "elapsed_ms": 0,
    }


def _build_provider_config(req: GenerateRequest) -> ProviderConfig:
    return ProviderConfig(
        provider="seedance",
        model=req.model or "seedance-2.0-pro",
        api_key=req.api_key or settings.nextapi_api_key,
        base_url=req.base_url or settings.nextapi_base_url,
        quality=req.quality,
        generate_audio=req.generate_audio,
    )


def _build_params(req: GenerateRequest) -> VideoGenerationParams:
    return VideoGenerationParams(
        model=req.model or "seedance-2.0-pro",
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        duration=req.duration,
        quality=req.quality,
        aspect_ratio=req.aspect_ratio,
        generate_audio=req.generate_audio,
        image_urls=req.image_urls,
        video_urls=req.video_urls,
        audio_urls=req.audio_urls,
    )


MAX_RETRIES = 2


async def _run_generation(
    shot_id: str, config: ProviderConfig, params: VideoGenerationParams
) -> None:
    provider = SeedanceProvider(config)
    job = _generation_jobs[shot_id]
    job["started_at"] = time.time()

    for attempt in range(MAX_RETRIES + 1):
        try:
            job["status"] = "submitting"
            job["retry_count"] = attempt
            result = await provider.generate(params)
            job_id = result.get("job_id", "")

            job.update({
                "status": "processing",
                "provider_job_id": job_id,
                "estimated_cost_cents": result.get("estimated_cost_cents", 0),
            })

            await event_bus.publish(Event(
                type=EventType.VIDEO_PROGRESS,
                data={
                    "shot_id": shot_id,
                    "status": "processing",
                    "provider_job_id": job_id,
                },
            ))

            final = await provider.wait_for_completion(job_id, timeout=600.0)
            final_status = final.get("status", "")

            if final_status in ("succeeded", "completed"):
                video_url = final.get("video_url", "")
                now = time.time()
                job.update({
                    "status": "succeeded",
                    "video_url": video_url,
                    "failure_reason": "",
                    "completed_at": now,
                    "elapsed_ms": int((now - job["started_at"]) * 1000),
                })
                await event_bus.publish(Event(
                    type=EventType.VIDEO_COMPLETE,
                    data={
                        "shot_id": shot_id,
                        "video_url": video_url,
                        "status": "succeeded",
                        "elapsed_ms": job["elapsed_ms"],
                    },
                ))
                return

            job["failure_reason"] = final_status
            if attempt < MAX_RETRIES:
                logger.warning(
                    "Generation attempt %d failed for %s: %s — retrying",
                    attempt + 1, shot_id, final_status,
                )
                await asyncio.sleep(2 ** attempt)
                continue

            now = time.time()
            job.update({
                "status": "failed",
                "completed_at": now,
                "elapsed_ms": int((now - job["started_at"]) * 1000),
            })
            await event_bus.publish(Event(
                type=EventType.AGENT_ERROR,
                data={
                    "shot_id": shot_id,
                    "status": "failed",
                    "error": final_status,
                    "retry_count": attempt + 1,
                },
            ))
            return

        except Exception as e:
            reason = str(e)[:200]
            job["failure_reason"] = reason
            logger.error(
                "Generation error attempt %d for %s: %s",
                attempt + 1, shot_id, reason,
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)
                continue

            now = time.time()
            job.update({
                "status": "failed",
                "completed_at": now,
                "elapsed_ms": int((now - job["started_at"]) * 1000),
            })
            await event_bus.publish(Event(
                type=EventType.AGENT_ERROR,
                data={
                    "shot_id": shot_id,
                    "status": "failed",
                    "error": "Generation request failed",
                    "retry_count": attempt + 1,
                },
            ))
            return


class ExportRequest(BaseModel):
    shot_ids: list[str]
    format: str = "mp4"
    transition: str = "cut"
    transition_duration_ms: int = 500


@router.post("/export")
async def export_assembly(req: ExportRequest):
    """Assemble multiple shot videos into a single exported video.

    Collects video URLs for the requested shot_ids in order,
    then delegates to ffmpeg (or returns the manifest for client-side assembly).
    """
    urls: list[dict[str, Any]] = []
    missing: list[str] = []
    for sid in req.shot_ids:
        job = _generation_jobs.get(sid)
        if job and job.get("video_url"):
            urls.append({
                "shot_id": sid,
                "video_url": job["video_url"],
                "duration": job.get("duration", 5),
            })
        else:
            missing.append(sid)

    if missing:
        return {
            "status": "incomplete",
            "missing": missing,
            "message": f"{len(missing)} shots not yet generated",
        }

    return {
        "status": "ready",
        "shots": urls,
        "format": req.format,
        "transition": req.transition,
        "transition_duration_ms": req.transition_duration_ms,
        "total_duration": sum(s["duration"] for s in urls),
    }


async def _run_batch(shots: list[GenerateRequest], sequential: bool) -> None:
    if sequential:
        for req in shots:
            config = _build_provider_config(req)
            params = _build_params(req)
            await _run_generation(req.shot_id, config, params)
    else:
        tasks = []
        for req in shots:
            config = _build_provider_config(req)
            params = _build_params(req)
            tasks.append(_run_generation(req.shot_id, config, params))
        await asyncio.gather(*tasks, return_exceptions=True)
