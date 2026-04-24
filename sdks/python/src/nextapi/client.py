from __future__ import annotations

import time
from typing import Any, Optional

import httpx

TERMINAL_STATUSES = {"succeeded", "failed", "canceled", "cancelled", "completed", "error"}


class NextAPIError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 0):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.status_code = status_code


class Client:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.nextapi.top",
        timeout: float = 60.0,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._http = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def _request(self, method: str, path: str, json: Optional[dict] = None) -> dict:
        resp = self._http.request(method, path, json=json)
        try:
            data = resp.json()
        except Exception:
            data = {}
        if resp.status_code >= 400:
            err = (data or {}).get("error") or {}
            raise NextAPIError(
                code=err.get("code", f"http_{resp.status_code}"),
                message=err.get("message", resp.text or "request failed"),
                status_code=resp.status_code,
            )
        return data

    def generate(
        self,
        prompt: str,
        model: str = "seedance-v2-pro",
        image_url: Optional[str] = None,
        duration_seconds: int = 5,
        resolution: str = "1080p",
        mode: str = "normal",
    ) -> dict:
        input_payload: dict[str, Any] = {
            "prompt": prompt,
            "duration_seconds": duration_seconds,
            "resolution": resolution,
            "mode": mode,
        }
        if image_url is not None:
            input_payload["image_url"] = image_url
        return self._request("POST", "/v1/videos", json={"model": model, "input": input_payload})

    def get_video(self, video_id: str) -> dict:
        return self._request("GET", f"/v1/videos/{video_id}")

    def get_job(self, job_id: str) -> dict:
        return self.get_video(job_id)

    def wait(self, job_id: str, timeout: float = 600, poll_interval: float = 5) -> dict:
        deadline = time.monotonic() + timeout
        while True:
            job = self.get_video(job_id)
            status = str(job.get("status", "")).lower()
            if status in TERMINAL_STATUSES:
                return job
            if time.monotonic() >= deadline:
                raise NextAPIError("timeout", f"job {job_id} did not finish within {timeout}s")
            time.sleep(poll_interval)
