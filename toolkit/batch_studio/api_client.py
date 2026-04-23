"""Async HTTP client for the NextAPI video generation API.

Wraps:
  POST /v1/video/generations  → submit a job (returns id + estimated_credits)
  GET  /v1/jobs/{id}          → poll status

All public methods retry transient failures (HTTP 429 + 5xx) with
exponential backoff and surface unrecoverable errors as ``NextAPIError``.
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from typing import Any, Optional

import aiohttp


log = logging.getLogger("nextapi.client")


@dataclass(frozen=True)
class ClientConfig:
    base_url: str
    api_key: str
    request_timeout_seconds: float = 30.0
    max_retries: int = 4
    backoff_base_seconds: float = 1.5


class NextAPIError(RuntimeError):
    """Raised when the API returns a non-retryable error or retries are exhausted."""

    def __init__(self, message: str, *, status: int = 0, code: str = "", body: Any = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.body = body


class NextAPIClient:
    """Thin async wrapper that owns one shared aiohttp.ClientSession."""

    def __init__(self, cfg: ClientConfig):
        self.cfg = cfg
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self) -> "NextAPIClient":
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=self.cfg.request_timeout_seconds),
            headers={
                "Authorization": f"Bearer {self.cfg.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "NextAPI-BatchStudio/0.1",
            },
        )
        return self

    async def __aexit__(self, *_exc: Any) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None

    @property
    def session(self) -> aiohttp.ClientSession:
        if self._session is None:
            raise RuntimeError("NextAPIClient must be used as an async context manager")
        return self._session

    async def submit_generation(self, payload: dict) -> dict:
        """POST /v1/video/generations. Returns the parsed response body."""
        url = self._url("/v1/video/generations")
        return await self._request_with_retry("POST", url, json=payload)

    async def get_job(self, job_id: str) -> dict:
        """GET /v1/jobs/{id}. Returns the parsed response body."""
        url = self._url(f"/v1/jobs/{job_id}")
        return await self._request_with_retry("GET", url)

    async def download(self, video_url: str, dest_path: str, chunk_size: int = 1 << 16) -> None:
        """Stream a finished video to disk. Uses a fresh session unscoped from
        the API auth so it works with any storage URL (R2, S3, signed URL)."""
        timeout = aiohttp.ClientTimeout(total=self.cfg.request_timeout_seconds * 6)
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.get(video_url) as resp:
                if resp.status >= 400:
                    raise NextAPIError(
                        f"download failed: HTTP {resp.status}",
                        status=resp.status,
                    )
                with open(dest_path, "wb") as f:
                    async for chunk in resp.content.iter_chunked(chunk_size):
                        f.write(chunk)

    # --- internals ---

    def _url(self, path: str) -> str:
        return f"{self.cfg.base_url.rstrip('/')}{path}"

    async def _request_with_retry(self, method: str, url: str, **kwargs: Any) -> dict:
        attempt = 0
        last_exc: Optional[Exception] = None
        while attempt <= self.cfg.max_retries:
            try:
                async with self.session.request(method, url, **kwargs) as resp:
                    body_text = await resp.text()
                    if resp.status == 429 or 500 <= resp.status < 600:
                        log.warning(
                            "transient %s on %s (attempt %d/%d): %s",
                            resp.status, url, attempt + 1, self.cfg.max_retries + 1, body_text[:200],
                        )
                        await self._sleep_backoff(attempt)
                        attempt += 1
                        continue
                    if resp.status >= 400:
                        body = self._safe_json(body_text)
                        err = (body or {}).get("error") or {}
                        raise NextAPIError(
                            err.get("message") or f"HTTP {resp.status}",
                            status=resp.status,
                            code=err.get("code", ""),
                            body=body,
                        )
                    return self._safe_json(body_text) or {}
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exc = exc
                log.warning(
                    "network error on %s (attempt %d/%d): %s",
                    url, attempt + 1, self.cfg.max_retries + 1, exc,
                )
                await self._sleep_backoff(attempt)
                attempt += 1

        raise NextAPIError(
            f"exhausted retries calling {method} {url}: {last_exc!r}"
        )

    async def _sleep_backoff(self, attempt: int) -> None:
        # Exponential backoff with jitter: e.g. 1.5, 3, 6, 12 seconds (+/- 30%)
        base = self.cfg.backoff_base_seconds * (2 ** attempt)
        jitter = base * 0.3 * (random.random() * 2 - 1)
        await asyncio.sleep(max(0.1, base + jitter))

    @staticmethod
    def _safe_json(text: str) -> Optional[dict]:
        import json
        try:
            return json.loads(text)
        except Exception:
            return None
