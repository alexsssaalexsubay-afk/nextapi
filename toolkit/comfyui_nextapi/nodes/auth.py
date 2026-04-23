"""NextAPIAuth — bundles base_url + api_key for downstream nodes."""

from __future__ import annotations

import os

from ._client import AuthBundle


class NextAPIAuth:
    """Output a NextAPI auth bundle. Required upstream for every other node."""

    CATEGORY = "NextAPI"
    RETURN_TYPES = ("NEXTAPI_AUTH",)
    RETURN_NAMES = ("auth",)
    FUNCTION = "configure"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "base_url": (
                    "STRING",
                    {"default": os.getenv("NEXTAPI_BASE_URL", "https://api.nextapi.top"), "multiline": False},
                ),
                "api_key": (
                    "STRING",
                    {"default": os.getenv("NEXTAPI_KEY", ""), "multiline": False},
                ),
                "request_timeout_seconds": ("FLOAT", {"default": 30.0, "min": 5.0, "max": 180.0, "step": 1.0}),
                "max_retries": ("INT", {"default": 4, "min": 0, "max": 10, "step": 1}),
            }
        }

    def configure(self, base_url: str, api_key: str, request_timeout_seconds: float, max_retries: int):
        if not api_key.strip():
            raise ValueError(
                "NextAPIAuth: api_key is empty. Paste your sk_live_… key, or set NEXTAPI_KEY in the environment."
            )
        bundle = AuthBundle(
            base_url=base_url.strip(),
            api_key=api_key.strip(),
            request_timeout_seconds=request_timeout_seconds,
            max_retries=max_retries,
        )
        return (bundle,)
