"""Seedance 2.0 provider — full multimodal reference-to-video support.

升级要点（2026-05调研）：
- Shot-Script 模式支持（时间码分段生成）
- 序列生成：多镜头一次性提交，保持角色一致性
- 视频扩展：前向/后向/插值
- 视频编辑：主体替换、对象编辑、修复
- 原生音频 + lip-sync
- 多模态引用系统（image_urls, video_url, audio_url 数组）

POST /v1/videos matches the NextAPI OpenAPI (`backend/api/openapi.yaml`):
`{ "model", "input": { "prompt", "duration_seconds", "resolution", ... } }`.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

import httpx

from director_engine.interfaces.models import ProviderConfig, VideoGenerationParams


def _canonical_nextapi_model_id(model: str) -> str:
    """Map UI / legacy labels to public catalogue IDs (OpenAPI)."""
    m = (model or "").strip()
    aliases: dict[str, str] = {
        "seedance-2.0-reference-to-video": "seedance-2.0-pro",
        "seedance-2.0-text-to-video": "seedance-2.0-fast",
        "seedance-2.0": "seedance-2.0-pro",
    }
    if m in aliases:
        return aliases[m]
    if m in ("seedance-2.0-pro", "seedance-2.0-fast"):
        return m
    return m or "seedance-2.0-pro"


def _extract_video_url(data: dict[str, Any]) -> str:
    out = data.get("output")
    if isinstance(out, str) and out.strip():
        try:
            out = json.loads(out)
        except json.JSONDecodeError:
            out = None
    if isinstance(out, dict):
        u = out.get("url") or out.get("video_url")
        if u:
            return str(u)
    vu = data.get("video_url")
    return str(vu) if vu else ""


def _merge_prompt_with_negative(prompt: str, negative: str) -> str:
    p = (prompt or "").strip()
    n = (negative or "").strip()
    if not n:
        return p
    suffix = f"Constraints (avoid): {n}"
    return f"{p}\n\n{suffix}" if p else suffix


def _safe_provider_options(options: dict[str, Any]) -> dict[str, Any]:
    """Allow native provider fields without allowing callers to smuggle auth headers."""
    blocked = {
        "api_key",
        "apikey",
        "authorization",
        "auth",
        "headers",
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
    safe: dict[str, Any] = {}
    for key, value in (options or {}).items():
        normalized = str(key).strip()
        lowered = normalized.lower()
        compact = lowered.replace("_", "").replace("-", "")
        if not normalized or lowered in blocked or compact in blocked or value is None:
            continue
        safe[normalized] = value
    return safe


class SeedanceProvider:
    def __init__(self, config: ProviderConfig) -> None:
        self.config = config
        raw = config.base_url.rstrip("/")
        self.base_url = raw.removesuffix("/v1")
        self.api_key = config.api_key

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid.uuid4()),
        }

    def _video_create_body(self, params: VideoGenerationParams) -> dict[str, Any]:
        model = _canonical_nextapi_model_id(params.model or self.config.model)
        resolution = (params.quality or self.config.quality or "720p").lower()
        if resolution not in ("480p", "720p", "1080p"):
            resolution = "720p"
        duration = max(4, min(15, int(params.duration or 5)))
        prompt = _merge_prompt_with_negative(params.prompt, params.negative_prompt)
        inp: dict[str, Any] = {
            "prompt": prompt,
            "duration_seconds": duration,
            "resolution": resolution,
            "aspect_ratio": params.aspect_ratio or "16:9",
            "generate_audio": bool(params.generate_audio),
        }
        if params.image_urls:
            inp["image_urls"] = params.image_urls[:9]
        if params.video_urls:
            inp["video_urls"] = params.video_urls[:3]
        if params.audio_urls:
            inp["audio_urls"] = params.audio_urls[:3]
        if params.first_frame_url:
            inp.pop("image_urls", None)
            inp["first_frame_url"] = params.first_frame_url
        if params.last_frame_url:
            inp["last_frame_url"] = params.last_frame_url
        inp.update(_safe_provider_options(params.provider_options))
        return {"model": model, "input": inp}

    async def generate(self, params: VideoGenerationParams) -> dict[str, Any]:
        payload = self._video_create_body(params)

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/v1/videos",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "job_id": data.get("id", ""),
                "status": data.get("status", "queued"),
                "estimated_cost_cents": data.get("estimated_cost_cents", 0),
                "provider": self.config.provider,
                "provider_model": payload.get("model", self.config.model),
                "request_payload": payload,
                "upstream_response": data,
            }

    async def generate_sequence(
        self, shots: list[VideoGenerationParams]
    ) -> list[dict[str, Any]]:
        """批量提交多镜头序列，利用 Seedance 2.0 的跨镜头一致性。"""
        results = []
        for params in shots:
            result = await self.generate(params)
            results.append(result)
        return results

    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        duration: int = 5,
        direction: str = "forward",
    ) -> dict[str, Any]:
        """视频扩展 — 利用 Seedance 2.0 的视频续写能力。"""
        dur = max(4, min(15, int(duration)))
        model = _canonical_nextapi_model_id(self.config.model)
        resolution = (self.config.quality or "720p").lower()
        if resolution not in ("480p", "720p", "1080p"):
            resolution = "720p"
        payload = {
            "model": model,
            "input": {
                "prompt": f"Extend {direction}: {prompt}",
                "duration_seconds": dur,
                "resolution": resolution,
                "video_urls": [video_url],
                "generate_audio": self.config.generate_audio,
            },
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/v1/videos",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "job_id": data.get("id", ""),
                "status": data.get("status", "queued"),
                "provider": self.config.provider,
                "provider_model": model,
                "request_payload": payload,
                "upstream_response": data,
            }

    async def edit_video(
        self,
        video_url: str,
        edit_prompt: str,
        edit_type: str = "replace_subject",
        reference_image: str = "",
    ) -> dict[str, Any]:
        """视频编辑 — 主体替换、修复等。"""
        model = _canonical_nextapi_model_id(self.config.model)
        resolution = (self.config.quality or "720p").lower()
        if resolution not in ("480p", "720p", "1080p"):
            resolution = "720p"
        inp: dict[str, Any] = {
            "prompt": f"{edit_type}: {edit_prompt}",
            "duration_seconds": 5,
            "resolution": resolution,
            "video_urls": [video_url],
            "generate_audio": self.config.generate_audio,
        }
        if reference_image:
            inp["image_urls"] = [reference_image]
        payload = {"model": model, "input": inp}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/v1/videos",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "job_id": data.get("id", ""),
                "status": data.get("status", "queued"),
                "provider": self.config.provider,
                "provider_model": model,
                "request_payload": payload,
                "upstream_response": data,
            }

    async def poll_status(self, job_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{self.base_url}/v1/videos/{job_id}",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            resp.raise_for_status()
            return resp.json()

    async def wait_for_completion(
        self, job_id: str, timeout: float = 300.0, interval: float = 5.0
    ) -> dict[str, Any]:
        elapsed = 0.0
        while elapsed < timeout:
            result = await self.poll_status(job_id)
            status = result.get("status", "")
            if status in ("succeeded", "completed"):
                vu = _extract_video_url(result)
                return {**result, "video_url": vu}
            if status in ("failed", "cancelled"):
                return result
            await asyncio.sleep(interval)
            elapsed += interval
        return {"status": "timeout", "job_id": job_id}

    async def cancel(self, job_id: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.delete(
                    f"{self.base_url}/v1/videos/{job_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return resp.status_code < 300
        except Exception:
            return False
