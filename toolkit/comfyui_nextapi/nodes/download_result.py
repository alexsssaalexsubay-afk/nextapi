"""NextAPIDownloadResult — stream a finished video to ComfyUI's output dir."""

from __future__ import annotations

import os
import time
from pathlib import Path

from ._client import download_video


def _comfy_output_dir() -> str:
    """Best-effort lookup for ComfyUI's configured output dir.

    Falls back to ``./output`` next to the package if folder_paths isn't
    importable (unit tests, dev shell)."""
    try:
        import folder_paths  # type: ignore
        return folder_paths.get_output_directory()
    except Exception:
        return os.path.abspath("./output")


class NextAPIDownloadResult:
    CATEGORY = "NextAPI"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("local_file_path",)
    FUNCTION = "download"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video_url": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {
                "filename_prefix": ("STRING", {"default": "nextapi", "multiline": False}),
                "shot_id": ("STRING", {"default": "", "multiline": False}),
                "output_subdir": ("STRING", {"default": "nextapi", "multiline": False}),
            },
        }

    def download(
        self,
        video_url: str,
        filename_prefix: str = "nextapi",
        shot_id: str = "",
        output_subdir: str = "nextapi",
    ):
        if not video_url.strip():
            return ("",)

        out_dir = Path(_comfy_output_dir()) / (output_subdir or "nextapi")
        out_dir.mkdir(parents=True, exist_ok=True)

        ts = time.strftime("%Y%m%d_%H%M%S")
        safe_shot = "".join(c for c in shot_id if c.isalnum() or c in "-_") or "shot"
        name = f"{filename_prefix}_{safe_shot}_{ts}.mp4"
        dest = out_dir / name

        download_video(video_url.strip(), str(dest))
        return (str(dest),)
