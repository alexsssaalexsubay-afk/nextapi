"""NextAPIAssetResolver — turn local paths or upload-style refs into URLs.

The NextAPI video API expects fully-qualified `*_image_url` / `*_video_url`
fields. This node either:

  - passes through an existing https URL untouched, or
  - uploads a local file via a configurable upload_url (POST multipart),
    expecting a JSON body like `{"url": "https://..."}`.

If neither path applies, the node passes the value through unchanged so a
user can wire in their own upload step (R2, S3, etc.).
"""

from __future__ import annotations

import os
from typing import Optional

import requests


class NextAPIAssetResolver:
    """Resolve a character / outfit / scene / video reference into a URL."""

    CATEGORY = "NextAPI"
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("character_url", "outfit_url", "scene_url", "reference_video_url")
    FUNCTION = "resolve"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "character_ref": ("STRING", {"default": "", "multiline": False}),
                "outfit_ref": ("STRING", {"default": "", "multiline": False}),
                "scene_ref": ("STRING", {"default": "", "multiline": False}),
                "reference_video": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {
                "upload_url": (
                    "STRING",
                    {
                        "default": os.getenv("NEXTAPI_UPLOAD_URL", ""),
                        "multiline": False,
                    },
                ),
                "upload_api_key": (
                    "STRING",
                    {"default": os.getenv("NEXTAPI_UPLOAD_KEY", ""), "multiline": False},
                ),
            },
        }

    def resolve(
        self,
        character_ref: str,
        outfit_ref: str,
        scene_ref: str,
        reference_video: str,
        upload_url: str = "",
        upload_api_key: str = "",
    ):
        return tuple(
            self._one(v, upload_url, upload_api_key)
            for v in (character_ref, outfit_ref, scene_ref, reference_video)
        )

    @staticmethod
    def _one(ref: str, upload_url: str, upload_api_key: str) -> str:
        ref = (ref or "").strip()
        if not ref:
            return ""
        if ref.startswith(("http://", "https://")):
            return ref
        if os.path.isfile(ref):
            if upload_url:
                return _upload(ref, upload_url, upload_api_key)
            # No upload endpoint configured — return the path so users can wire
            # their own upload step before NextAPIGenerateVideo.
            return ref
        return ref


def _upload(path: str, upload_url: str, api_key: str) -> str:
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    with open(path, "rb") as f:
        resp = requests.post(
            upload_url,
            files={"file": (os.path.basename(path), f)},
            headers=headers,
            timeout=120,
        )
    resp.raise_for_status()
    body = resp.json()
    url: Optional[str] = body.get("url") or body.get("location")
    if not url:
        raise RuntimeError(f"upload endpoint did not return a url field: {body}")
    return url
