"""Build script for NextCut sidecar binary via PyInstaller."""

import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent


def get_target_name() -> str:
    machine = platform.machine().lower()
    system = platform.system().lower()
    arch_map = {"x86_64": "x86_64", "amd64": "x86_64", "aarch64": "aarch64", "arm64": "aarch64"}
    arch = arch_map.get(machine, machine)
    os_map = {"darwin": "apple-darwin", "linux": "unknown-linux-gnu", "windows": "pc-windows-msvc"}
    os_suffix = os_map.get(system, system)
    return f"nextcut-sidecar-{arch}-{os_suffix}"


def build():
    target_name = get_target_name()
    print(f"Building sidecar: {target_name}")

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--name",
        target_name,
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.loops",
        "--hidden-import",
        "uvicorn.loops.auto",
        "--hidden-import",
        "uvicorn.protocols",
        "--hidden-import",
        "uvicorn.protocols.http",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.protocols.websockets",
        "--hidden-import",
        "uvicorn.protocols.websockets.auto",
        "--hidden-import",
        "uvicorn.lifespan",
        "--hidden-import",
        "uvicorn.lifespan.on",
        "--collect-submodules",
        "langchain",
        "--collect-submodules",
        "langchain_openai",
        "--collect-submodules",
        "langchain_community",
        str(ROOT / "app" / "main.py"),
    ]

    subprocess.run(cmd, check=True, cwd=str(ROOT))

    print(f"Built: dist/{target_name}")
    print("Copy to apps/nextcut/src-tauri/binaries/ for Tauri bundling")


if __name__ == "__main__":
    build()
