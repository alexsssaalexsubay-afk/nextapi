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
import json
import logging
import time
import uuid
import httpx
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.events import event_bus, Event, EventType
from director_engine.interfaces.models import ProviderConfig, VideoGenerationParams
from director_engine.providers.registry import create_video_provider, list_video_providers, normalize_provider_name

logger = logging.getLogger(__name__)

router = APIRouter()

_generation_jobs: dict[str, dict[str, Any]] = {}


class GenerateRequest(BaseModel):
    shot_id: str
    prompt: str
    negative_prompt: str = ""
    shot_script: str = ""
    constraints: str = ""
    audio_cues: list[str] = Field(default_factory=list)
    reference_instructions: list[str] = Field(default_factory=list)
    duration: int = 5
    quality: str = "720p"
    aspect_ratio: str = "16:9"
    generate_audio: bool = True
    image_urls: list[str] = Field(default_factory=list)
    video_urls: list[str] = Field(default_factory=list)
    audio_urls: list[str] = Field(default_factory=list)
    provider: str = "seedance"
    model: str = ""
    api_key: str = ""
    base_url: str = ""
    template_id: str = ""
    template_version: str = ""
    workflow: str = "text_to_video"
    provider_options: dict[str, Any] = Field(
        default_factory=dict,
        description="Open provider-native options passed through to the adapter after secret/header filtering.",
    )


class BatchGenerateRequest(BaseModel):
    shots: list[GenerateRequest]
    sequential: bool = True


class PreflightFinding(BaseModel):
    shot_id: str
    severity: str
    code: str
    message: str
    suggestion: str = ""


class PreflightResponse(BaseModel):
    status: str
    critical: int
    warning: int
    info: int
    findings: list[PreflightFinding]


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
    preflight = preflight_generation_request(BatchGenerateRequest(shots=[req], sequential=True))
    if preflight.critical:
        raise HTTPException(status_code=422, detail=preflight.model_dump())

    config = _build_provider_config(req)
    params = _build_params(req)

    _generation_jobs[req.shot_id] = _init_job_record(req, params)
    background_tasks.add_task(_run_generation, req.shot_id, config, params)
    return {"shot_id": req.shot_id, "status": "queued"}


@router.post("/batch")
async def batch_generation(req: BatchGenerateRequest, background_tasks: BackgroundTasks):
    """Submit multiple shots for generation (sequential or parallel)."""
    preflight = preflight_generation_request(req)
    if preflight.critical:
        raise HTTPException(status_code=422, detail=preflight.model_dump())

    for shot_req in req.shots:
        params = _build_params(shot_req)
        _generation_jobs[shot_req.shot_id] = _init_job_record(shot_req, params)

    background_tasks.add_task(_run_batch, req.shots, req.sequential)
    return {
        "status": "queued",
        "shots": [s.shot_id for s in req.shots],
        "mode": "sequential" if req.sequential else "parallel",
    }


@router.post("/preflight", response_model=PreflightResponse)
async def generation_preflight(req: BatchGenerateRequest):
    """Validate refs, prompt contracts, and provider limits before generation."""
    return preflight_generation_request(req)


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


@router.get("/providers")
async def generation_providers():
    """List provider adapters available to the generation registry."""
    return {"providers": list_video_providers()}


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
        "provider": req.provider or "seedance",
        "provider_model": params.model,
        "provider_options": _sanitize_upstream_payload(req.provider_options),
        "upstream": {
            "request": {},
            "submit": {},
            "final": {},
        },
        "artifacts": [],
        "started_at": 0.0,
        "completed_at": 0.0,
        "elapsed_ms": 0,
    }


def _build_provider_config(req: GenerateRequest) -> ProviderConfig:
    provider = normalize_provider_name(req.provider or "seedance")
    base_url = req.base_url
    if not base_url and provider in {"seedance", "nextapi"}:
        base_url = settings.nextapi_base_url
    if not base_url and provider == "comfyui":
        base_url = settings.comfyui_url.replace("ws://", "http://").replace("wss://", "https://")
    return ProviderConfig(
        provider=provider,
        model=req.model or ("seedance-2.0-pro" if provider in {"seedance", "nextapi"} else ""),
        api_key=req.api_key or (settings.nextapi_api_key if provider in {"seedance", "nextapi"} else ""),
        base_url=base_url,
        quality=req.quality,
        generate_audio=req.generate_audio,
    )


def _build_params(req: GenerateRequest) -> VideoGenerationParams:
    provider = normalize_provider_name(req.provider or "seedance")
    return VideoGenerationParams(
        model=req.model or ("seedance-2.0-pro" if provider in {"seedance", "nextapi"} else ""),
        prompt=_compose_generation_prompt(req),
        negative_prompt=req.negative_prompt,
        duration=req.duration,
        quality=req.quality,
        aspect_ratio=req.aspect_ratio,
        generate_audio=req.generate_audio,
        reference_instructions=req.reference_instructions,
        image_urls=req.image_urls,
        video_urls=req.video_urls,
        audio_urls=req.audio_urls,
        provider_options=req.provider_options,
    )


def _compose_generation_prompt(req: GenerateRequest) -> str:
    """Make optimizer sidecar fields actionable for providers that only accept prompt text."""
    sections = [req.prompt.strip()]
    if req.shot_script.strip():
        sections.append(f"Shot script:\n{req.shot_script.strip()}")
    if req.reference_instructions:
        sections.append("Reference instructions:\n" + "\n".join(f"- {item}" for item in req.reference_instructions if item.strip()))
    if req.audio_cues:
        sections.append("Audio cues:\n" + "\n".join(f"- {item}" for item in req.audio_cues if item.strip()))
    if req.constraints.strip():
        sections.append(f"Generation constraints:\n{req.constraints.strip()}")
    return "\n\n".join(section for section in sections if section.strip())


def preflight_generation_request(req: BatchGenerateRequest) -> PreflightResponse:
    findings: list[PreflightFinding] = []

    if not req.shots:
        findings.append(_finding("", "critical", "empty_batch", "没有可生成的镜头。", "先选择至少一个镜头。"))

    for shot in req.shots:
        provider_name = normalize_provider_name(shot.provider or "seedance")
        prompt = _compose_generation_prompt(shot)
        refs = {
            "image": shot.image_urls,
            "video": shot.video_urls,
            "audio": shot.audio_urls,
        }

        if not shot.prompt.strip():
            findings.append(_finding(shot.shot_id, "critical", "empty_prompt", "镜头 prompt 为空。", "补充主体、动作、场景和镜头运动。"))
        elif len(prompt.split()) < 10 and len(prompt) < 80:
            findings.append(_finding(shot.shot_id, "warning", "thin_prompt", "镜头 prompt 信息量偏低，可能导致画面漂移。", "补充主体、动作、场景、光线、运镜和参考说明。"))

        if provider_name in {"seedance", "nextapi"} and (shot.duration < 4 or shot.duration > 15):
            findings.append(_finding(shot.shot_id, "critical", "duration_range", "Seedance 单镜头时长必须在 4-15 秒之间。", "把镜头时长调整到 4-15 秒。"))

        if provider_name in {"seedance", "nextapi"} and shot.quality not in {"480p", "720p", "1080p"}:
            findings.append(_finding(shot.shot_id, "critical", "resolution_value", "当前清晰度不在 provider 支持范围内。", "使用 480p、720p 或 1080p。"))

        if provider_name in {"seedance", "nextapi"} and len(shot.image_urls) > 9:
            findings.append(_finding(shot.shot_id, "critical", "too_many_images", "Seedance 最多接收 9 张 image reference。", "减少垫图数量，保留主角色、首帧、尾帧和关键参考。"))
        if provider_name in {"seedance", "nextapi"} and len(shot.video_urls) > 3:
            findings.append(_finding(shot.shot_id, "critical", "too_many_videos", "Seedance 最多接收 3 个 video reference。", "减少视频参考数量。"))
        if provider_name in {"seedance", "nextapi"} and len(shot.audio_urls) > 3:
            findings.append(_finding(shot.shot_id, "critical", "too_many_audio", "Seedance 最多接收 3 个 audio reference。", "减少音频参考数量。"))

        if shot.workflow == "image_to_video" and not shot.image_urls:
            findings.append(_finding(shot.shot_id, "critical", "missing_image_reference", "image_to_video 工作流缺少 image_urls。", "生成或上传首帧/产品图/角色图后再提交。"))

        for media_kind, urls in refs.items():
            for url in urls:
                if _is_local_only_url(url):
                    findings.append(_finding(
                        shot.shot_id,
                        "critical",
                        f"local_{media_kind}_reference",
                        f"{media_kind}_urls 中包含 provider 无法访问的本地地址。",
                        "先上传到素材库或换成可被服务端访问的 https/asset URL。",
                    ))

        lowered_prompt = prompt.lower()
        if ("image 1" in lowered_prompt or "first frame" in lowered_prompt or "last frame" in lowered_prompt) and not shot.image_urls:
            findings.append(_finding(shot.shot_id, "critical", "referenced_image_missing", "prompt 引用了图像参考，但 payload 没有 image_urls。", "把角色图、分镜图、首帧或尾帧写入 generationParams.image_urls。"))
        if "video 1" in lowered_prompt and not shot.video_urls:
            findings.append(_finding(shot.shot_id, "critical", "referenced_video_missing", "prompt 引用了视频参考，但 payload 没有 video_urls。", "把参考视频写入 generationParams.video_urls。"))
        if "audio 1" in lowered_prompt and not shot.audio_urls:
            findings.append(_finding(shot.shot_id, "critical", "referenced_audio_missing", "prompt 引用了音频参考，但 payload 没有 audio_urls。", "把参考音频写入 generationParams.audio_urls。"))

        if shot.reference_instructions and not any(refs.values()):
            findings.append(_finding(shot.shot_id, "warning", "reference_contract_without_assets", "存在 reference instructions，但没有真实 reference 资产。", "补齐 image/video/audio refs，或删除无效引用说明。"))

    critical = sum(1 for item in findings if item.severity == "critical")
    warning = sum(1 for item in findings if item.severity == "warning")
    info = sum(1 for item in findings if item.severity == "info")
    return PreflightResponse(
        status="blocked" if critical else "allowed",
        critical=critical,
        warning=warning,
        info=info,
        findings=findings,
    )


def _finding(shot_id: str, severity: str, code: str, message: str, suggestion: str = "") -> PreflightFinding:
    return PreflightFinding(
        shot_id=shot_id,
        severity=severity,
        code=code,
        message=message,
        suggestion=suggestion,
    )


def _is_local_only_url(url: str) -> bool:
    normalized = url.strip().lower()
    return normalized.startswith(("asset:", "blob:", "file:", "http://localhost", "http://127.0.0.1", "https://localhost", "https://127.0.0.1"))


SENSITIVE_UPSTREAM_KEYS = {
    "api_key",
    "apikey",
    "authorization",
    "auth",
    "bearer",
    "token",
    "access_token",
    "access-token",
    "accesstoken",
    "refresh_token",
    "refresh-token",
    "refreshtoken",
    "secret",
    "password",
    "x-api-key",
    "xapikey",
}
MAX_UPSTREAM_DEPTH = 8
MAX_UPSTREAM_ITEMS = 80
MAX_UPSTREAM_STRING = 4000


def _sanitize_upstream_payload(value: Any, depth: int = 0) -> Any:
    """Expose provider-native payloads while redacting secrets and capping size."""
    if depth > MAX_UPSTREAM_DEPTH:
        return "[truncated:depth]"
    if isinstance(value, BaseModel):
        value = value.model_dump()
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= MAX_UPSTREAM_ITEMS:
                sanitized["__truncated__"] = f"{len(value) - MAX_UPSTREAM_ITEMS} keys omitted"
                break
            key_text = str(key)
            if _is_sensitive_upstream_key(key_text):
                sanitized[key_text] = "[redacted]"
            else:
                sanitized[key_text] = _sanitize_upstream_payload(item, depth + 1)
        return sanitized
    if isinstance(value, (list, tuple, set)):
        items = list(value)
        sanitized_items = [_sanitize_upstream_payload(item, depth + 1) for item in items[:MAX_UPSTREAM_ITEMS]]
        if len(items) > MAX_UPSTREAM_ITEMS:
            sanitized_items.append(f"[truncated:{len(items) - MAX_UPSTREAM_ITEMS} items omitted]")
        return sanitized_items
    if isinstance(value, str):
        if len(value) > MAX_UPSTREAM_STRING:
            return value[:MAX_UPSTREAM_STRING] + f"...[truncated:{len(value) - MAX_UPSTREAM_STRING} chars]"
        return value
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)


def _is_sensitive_upstream_key(key: str) -> bool:
    normalized = key.strip().lower().replace("_", "-")
    compact = normalized.replace("-", "")
    return normalized in SENSITIVE_UPSTREAM_KEYS or compact in SENSITIVE_UPSTREAM_KEYS


def _extract_provider_artifacts(payload: Any) -> list[dict[str, Any]]:
    """Build a normalized artifact list from arbitrary upstream response shapes."""
    artifacts: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(kind: str, url: str, source: str, meta: dict[str, Any] | None = None) -> None:
        clean_url = url.strip()
        if not clean_url:
            return
        artifact_type = kind or _infer_artifact_type(source, clean_url)
        key = (artifact_type, clean_url)
        if key in seen:
            return
        seen.add(key)
        artifacts.append({
            "type": artifact_type,
            "url": clean_url,
            "source": source,
            "metadata": _sanitize_upstream_payload(meta or {}),
        })

    def scan(value: Any, path: str) -> None:
        if isinstance(value, str):
            parsed = _parse_jsonish(value)
            if parsed is not None:
                scan(parsed, path)
            elif _looks_like_media_url(value):
                add(_infer_artifact_type(path, value), value, path)
            return
        if isinstance(value, dict):
            url_key = next(
                (key for key in ("url", "video_url", "image_url", "audio_url") if isinstance(value.get(key), str)),
                "",
            )
            url = value.get(url_key) if url_key else ""
            if isinstance(url, str):
                kind = str(value.get("type") or value.get("kind") or value.get("media_type") or _infer_artifact_type(url_key or path, url))
                add(kind, url, path, value)
            for key, item in value.items():
                key_text = str(key)
                if isinstance(item, str) and (_looks_like_media_url(item) or (_is_urlish(item) and _key_suggests_artifact(key_text))):
                    add(_infer_artifact_type(key_text, item), item, f"{path}.{key_text}" if path else key_text)
                else:
                    scan(item, f"{path}.{key_text}" if path else key_text)
            return
        if isinstance(value, (list, tuple)):
            for index, item in enumerate(value):
                scan(item, f"{path}[{index}]")

    scan(payload, "")
    return artifacts


def _merge_artifacts(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for group in groups:
        for artifact in group:
            url = str(artifact.get("url") or "")
            kind = str(artifact.get("type") or "file")
            if not url or (kind, url) in seen:
                continue
            seen.add((kind, url))
            merged.append(artifact)
    return merged


def _parse_jsonish(value: str) -> Any | None:
    stripped = value.strip()
    if not stripped or stripped[0] not in "[{":
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


def _looks_like_media_url(value: str) -> bool:
    lowered = value.strip().lower()
    if not _is_urlish(lowered):
        return False
    return any(
        marker in lowered
        for marker in (
            ".mp4",
            ".mov",
            ".webm",
            ".m4v",
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".gif",
            ".wav",
            ".mp3",
            ".m4a",
            ".aac",
        )
    )


def _is_urlish(value: str) -> bool:
    return value.strip().lower().startswith(("http://", "https://", "asset:"))


def _key_suggests_artifact(key: str) -> bool:
    lowered = key.strip().lower()
    return lowered.endswith("_url") or lowered.endswith("url") or lowered in {"output", "file", "asset"}


def _infer_artifact_type(source: str, url: str) -> str:
    value = f"{source} {url}".lower()
    if any(marker in value for marker in ("audio", ".wav", ".mp3", ".m4a", ".aac")):
        return "audio"
    if any(marker in value for marker in ("image", "thumbnail", "first_frame", "last_frame", ".png", ".jpg", ".jpeg", ".webp", ".gif")):
        return "image"
    if any(marker in value for marker in ("video", ".mp4", ".mov", ".webm", ".m4v")):
        return "video"
    return "file"


MAX_RETRIES = 2


async def _run_generation(
    shot_id: str, config: ProviderConfig, params: VideoGenerationParams
) -> None:
    provider = create_video_provider(config)
    job = _generation_jobs[shot_id]
    job["started_at"] = time.time()

    for attempt in range(MAX_RETRIES + 1):
        try:
            job["status"] = "submitting"
            job["retry_count"] = attempt
            result = await provider.generate(params)
            job_id = result.get("job_id", "")
            submit_upstream = result.get("upstream_response", result)
            submit_artifacts = _extract_provider_artifacts(submit_upstream)

            job.update({
                "status": "processing",
                "provider_job_id": job_id,
                "estimated_cost_cents": result.get("estimated_cost_cents", 0),
                "provider": result.get("provider", config.provider),
                "provider_model": result.get("provider_model", params.model),
                "upstream": {
                    **job.get("upstream", {}),
                    "request": _sanitize_upstream_payload(result.get("request_payload", {})),
                    "submit": _sanitize_upstream_payload(submit_upstream),
                },
                "artifacts": _merge_artifacts(job.get("artifacts", []), submit_artifacts),
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
            final_artifacts = _extract_provider_artifacts(final)
            job["upstream"] = {
                **job.get("upstream", {}),
                "final": _sanitize_upstream_payload(final),
            }
            job["artifacts"] = _merge_artifacts(job.get("artifacts", []), final_artifacts)

            if final_status in ("succeeded", "completed"):
                video_url = final.get("video_url", "")
                if video_url:
                    job["artifacts"] = _merge_artifacts(
                        [{"type": "video", "url": video_url, "source": "normalized.video_url", "metadata": {}}],
                        job.get("artifacts", []),
                    )
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
    """Assemble multiple shot videos into a single exported video using FFmpeg."""
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
        
    export_dir = Path("exports")
    export_dir.mkdir(exist_ok=True)
    export_id = str(uuid.uuid4())[:8]
    output_filename = f"export_{export_id}.mp4"
    output_path = export_dir / output_filename
    
    async def download_video(url: str, index: int) -> Path:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=60.0)
            filepath = export_dir / f"temp_{export_id}_{index}.mp4"
            filepath.write_bytes(resp.content)
            return filepath

    try:
        # 1. Download all videos in parallel
        tasks = [download_video(s["video_url"], i) for i, s in enumerate(urls)]
        temp_files = await asyncio.gather(*tasks)
        
        # 2. Create concat manifest for ffmpeg
        concat_file = export_dir / f"concat_{export_id}.txt"
        with open(concat_file, "w") as f:
            for tf in temp_files:
                f.write(f"file '{tf.name}'\n")
                
        # 3. Run FFmpeg to concatenate videos
        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", 
            "-i", concat_file.name, 
            "-c", "copy", output_filename
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(export_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            logger.error(f"FFmpeg error: {stderr.decode()}")
            return {"status": "error", "message": "Failed to compile video with FFmpeg"}
            
        # 4. Clean up temporary files
        concat_file.unlink(missing_ok=True)
        for tf in temp_files:
            tf.unlink(missing_ok=True)
            
        export_url = f"http://127.0.0.1:8765/exports/{output_filename}"
            
        return {
            "status": "ready",
            "shots": urls,
            "format": req.format,
            "transition": req.transition,
            "export_url": export_url,
            "total_duration": sum(s["duration"] for s in urls),
        }
    except Exception as e:
        logger.error(f"Export error: {e}")
        return {"status": "error", "message": str(e)}


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
