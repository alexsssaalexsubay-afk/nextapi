# NextCut Sidecar

The checked-in macOS arm64 sidecar binary is intentionally larger than the
earlier Python-only build because packaged desktop exports need a bundled
FFmpeg runtime. The build collects `imageio_ffmpeg` data so local preview and
assembly can work without requiring users to install FFmpeg separately.

Keep this binary under GitHub's 100 MB file limit. If it grows materially
again, first check whether new bundled runtime data is required, then rebuild
with PyInstaller compression/stripping before committing.
