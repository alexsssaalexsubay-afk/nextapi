"""Base video generation provider protocol."""

from __future__ import annotations

from typing import Any, Protocol

from director_engine.interfaces.models import VideoGenerationParams


class VideoProvider(Protocol):
    async def generate(self, params: VideoGenerationParams) -> dict[str, Any]: ...
    async def poll_status(self, job_id: str) -> dict[str, Any]: ...
    async def wait_for_completion(
        self, job_id: str, timeout: float = 300.0, interval: float = 5.0
    ) -> dict[str, Any]: ...
    async def cancel(self, job_id: str) -> bool: ...
