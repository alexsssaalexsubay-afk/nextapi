"""Local media tool resolution for packaged NextAPI Studio local engine builds."""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def resolve_ffmpeg_exe() -> str:
    """Return a usable ffmpeg executable path.

    Resolution order is designed for packaged desktop builds:
    1. NEXTCUT_FFMPEG_PATH override for developers or enterprise images.
    2. imageio-ffmpeg's bundled binary, packaged into the PyInstaller local engine.
    3. System PATH fallback for development machines.
    """

    configured = os.getenv("NEXTCUT_FFMPEG_PATH", "").strip()
    if configured:
        candidate = Path(configured).expanduser()
        if candidate.exists():
            return str(candidate)

    try:
        import imageio_ffmpeg

        vendored = imageio_ffmpeg.get_ffmpeg_exe()
        if vendored and Path(vendored).exists():
            return vendored
    except Exception:
        pass

    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg

    raise RuntimeError(
        "FFmpeg is not available. Rebuild the NextAPI Studio local engine with imageio-ffmpeg "
        "or set NEXTCUT_FFMPEG_PATH to a local ffmpeg binary."
    )
