"""Synchronous HTTP helpers for the ComfyUI nodes.

ComfyUI executes nodes on a single worker thread by default, so we use
``requests`` (synchronous) rather than aiohttp here. Retries on 429 / 5xx
with exponential backoff and jitter.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from typing import Any, Optional

import requests


log = logging.getLogger("comfyui.nextapi")


class NextAPIError(RuntimeError):
    def __init__(self, message: str, *, status: int = 0, code: str = "", body: Any = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.body = body


@dataclass(frozen=True)
class AuthBundle:
    """Returned by NextAPIAuth and threaded into every downstream node."""

    base_url: str
    api_key: str
    request_timeout_seconds: float = 30.0
    max_retries: int = 4
    backoff_base_seconds: float = 1.5

    def headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ComfyUI-NextAPI/0.1",
        }

    def url(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}{path}"


def request_with_retry(
    method: str,
    url: str,
    *,
    auth: AuthBundle,
    json_body: Optional[dict] = None,
) -> dict:
    attempt = 0
    last_exc: Optional[Exception] = None
    while attempt <= auth.max_retries:
        try:
            resp = requests.request(
                method,
                url,
                json=json_body,
                headers=auth.headers(),
                timeout=auth.request_timeout_seconds,
            )
            text = resp.text
            if resp.status_code == 429 or 500 <= resp.status_code < 600:
                log.warning(
                    "transient %s on %s (attempt %d/%d): %s",
                    resp.status_code, url, attempt + 1, auth.max_retries + 1, text[:200],
                )
                _sleep_backoff(attempt, auth.backoff_base_seconds)
                attempt += 1
                continue
            if resp.status_code >= 400:
                body = _safe_json(text)
                err = (body or {}).get("error") or {}
                raise NextAPIError(
                    err.get("message") or f"HTTP {resp.status_code}",
                    status=resp.status_code,
                    code=err.get("code", ""),
                    body=body,
                )
            return _safe_json(text) or {}
        except requests.RequestException as exc:
            last_exc = exc
            log.warning("network error on %s (attempt %d): %s", url, attempt + 1, exc)
            _sleep_backoff(attempt, auth.backoff_base_seconds)
            attempt += 1

    raise NextAPIError(f"exhausted retries calling {method} {url}: {last_exc!r}")


def download_video(url: str, dest_path: str, *, timeout_seconds: float = 180.0) -> None:
    with requests.get(url, stream=True, timeout=timeout_seconds) as resp:
        if resp.status_code >= 400:
            raise NextAPIError(f"download failed: HTTP {resp.status_code}", status=resp.status_code)
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                if chunk:
                    f.write(chunk)


def _sleep_backoff(attempt: int, base: float) -> None:
    delay = base * (2 ** attempt)
    jitter = delay * 0.3 * (random.random() * 2 - 1)
    time.sleep(max(0.1, delay + jitter))


def _safe_json(text: str) -> Optional[dict]:
    import json
    try:
        return json.loads(text)
    except Exception:
        return None
