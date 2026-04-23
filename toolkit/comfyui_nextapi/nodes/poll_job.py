"""NextAPIPollJob — block until a job is terminal, return the video URL."""

from __future__ import annotations

import time

from ._client import AuthBundle, NextAPIError, request_with_retry


class NextAPIPollJob:
    CATEGORY = "NextAPI"
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("status", "video_url", "error_code", "error_message")
    FUNCTION = "poll"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "auth": ("NEXTAPI_AUTH",),
                "job_id": ("STRING", {"default": "", "multiline": False}),
                "polling_interval_seconds": ("FLOAT", {"default": 4.0, "min": 1.0, "max": 30.0, "step": 0.5}),
                "max_wait_minutes": ("INT", {"default": 15, "min": 1, "max": 60, "step": 1}),
            },
        }

    def poll(
        self,
        auth: AuthBundle,
        job_id: str,
        polling_interval_seconds: float,
        max_wait_minutes: int,
    ):
        if not job_id.strip():
            raise ValueError("NextAPIPollJob: job_id is empty")

        deadline = time.time() + max_wait_minutes * 60
        last_status = ""
        while time.time() < deadline:
            data = request_with_retry(
                "GET",
                auth.url(f"/v1/jobs/{job_id.strip()}"),
                auth=auth,
            )
            status = str(data.get("status", ""))
            if status != last_status:
                last_status = status
            if status in {"succeeded", "failed"}:
                return (
                    status,
                    str(data.get("video_url") or ""),
                    str(data.get("error_code") or ""),
                    str(data.get("error_message") or ""),
                )
            time.sleep(polling_interval_seconds)

        raise NextAPIError(
            f"job {job_id} did not finish within {max_wait_minutes} minutes"
        )
