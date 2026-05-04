"""Setup & Auto-Detection API — 首次启动零摩擦体验的后端支撑。

自动检测：
- Ollama 是否运行 + 已安装模型列表
- GPU 信息（CUDA/Metal/ROCm）
- ComfyUI 是否可连接
- 系统资源（RAM/VRAM/CPU）
- 已配置的 API Keys 状态
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter()


class SystemInfo(BaseModel):
    os: str = ""
    arch: str = ""
    cpu_count: int = 0
    ram_gb: float = 0.0
    gpu_name: str = ""
    gpu_vram_gb: float = 0.0
    gpu_backend: str = ""
    python_version: str = ""


class OllamaInfo(BaseModel):
    available: bool = False
    url: str = ""
    models: list[dict] = Field(default_factory=list)
    recommended_model: str = ""


class ComfyUIInfo(BaseModel):
    available: bool = False
    url: str = ""


class ApiKeyStatus(BaseModel):
    nextapi: bool = False
    openai: bool = False
    anthropic: bool = False
    deepseek: bool = False
    google: bool = False


class SetupStatus(BaseModel):
    first_launch: bool = True
    system: SystemInfo = Field(default_factory=SystemInfo)
    ollama: OllamaInfo = Field(default_factory=OllamaInfo)
    comfyui: ComfyUIInfo = Field(default_factory=ComfyUIInfo)
    api_keys: ApiKeyStatus = Field(default_factory=ApiKeyStatus)
    ready: bool = False
    issues: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


@router.get("/detect", response_model=SetupStatus)
async def detect_environment():
    """一键检测全部环境状态，前端首次启动向导使用。"""
    status = SetupStatus()

    status.system = _detect_system()
    status.ollama = await _detect_ollama()
    status.comfyui = await _detect_comfyui()
    status.api_keys = _detect_api_keys()

    has_llm = status.ollama.available or status.api_keys.openai or status.api_keys.deepseek
    has_video = status.api_keys.nextapi
    status.ready = has_llm and has_video

    if not has_llm:
        status.issues.append("no_llm_configured")
        if status.ollama.available:
            status.recommendations.append("Ollama detected. Pull a model: ollama pull qwen2.5:7b")
        else:
            status.recommendations.append("Configure an LLM API key (OpenAI/DeepSeek) or install Ollama")

    if not has_video:
        status.issues.append("no_video_api")
        status.recommendations.append("Enter your NextAPI key to enable Seedance 2.0 video generation")

    if status.ollama.available and not status.ollama.models:
        status.issues.append("ollama_no_models")
        status.recommendations.append("Pull a model: ollama pull qwen2.5:7b")

    if status.system.gpu_backend:
        status.recommendations.append(f"GPU detected: {status.system.gpu_name} ({status.system.gpu_backend})")

    status.first_launch = not status.ready
    return status


class SaveKeysRequest(BaseModel):
    nextapi_key: str = ""
    openai_key: str = ""
    openai_base_url: str = ""
    openai_model: str = ""
    deepseek_key: str = ""
    anthropic_key: str = ""
    google_key: str = ""
    ollama_url: str = ""
    comfyui_url: str = ""


@router.post("/keys")
async def save_keys(req: SaveKeysRequest):
    """保存 API Keys 到环境变量（运行时生效）。"""
    if req.nextapi_key:
        settings.nextapi_api_key = req.nextapi_key
        os.environ["NEXTCUT_NEXTAPI_API_KEY"] = req.nextapi_key
    if req.openai_key:
        settings.openai_api_key = req.openai_key
        os.environ["NEXTCUT_OPENAI_API_KEY"] = req.openai_key
    if req.openai_base_url:
        settings.openai_base_url = req.openai_base_url
        os.environ["NEXTCUT_OPENAI_BASE_URL"] = req.openai_base_url
    if req.openai_model:
        settings.openai_model = req.openai_model
        os.environ["NEXTCUT_OPENAI_MODEL"] = req.openai_model
    if req.ollama_url:
        settings.ollama_url = req.ollama_url
        os.environ["NEXTCUT_OLLAMA_URL"] = req.ollama_url
    if req.comfyui_url:
        settings.comfyui_url = req.comfyui_url
        os.environ["NEXTCUT_COMFYUI_URL"] = req.comfyui_url

    return {"status": "ok", "message": "Keys saved for this session"}


def _detect_system() -> SystemInfo:
    info = SystemInfo()
    info.os = platform.system()
    info.arch = platform.machine()
    info.cpu_count = os.cpu_count() or 0
    info.python_version = platform.python_version()

    try:
        import psutil
        info.ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    except ImportError:
        pass

    info.gpu_name, info.gpu_vram_gb, info.gpu_backend = _detect_gpu()
    return info


def _detect_gpu() -> tuple[str, float, str]:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split(",")
            name = parts[0].strip()
            vram = float(parts[1].strip()) / 1024 if len(parts) > 1 else 0
            return name, round(vram, 1), "cuda"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    if platform.system() == "Darwin" and platform.machine() == "arm64":
        try:
            result = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0:
                total = int(result.stdout.strip())
                unified = round(total / (1024 ** 3), 1)
                return "Apple Silicon (Unified Memory)", unified, "metal"
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    if shutil.which("rocm-smi"):
        return "AMD GPU (ROCm)", 0, "rocm"

    return "", 0, ""


async def _detect_ollama() -> OllamaInfo:
    info = OllamaInfo(url=settings.ollama_url)
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            if resp.status_code == 200:
                info.available = True
                data = resp.json()
                models = data.get("models", [])
                info.models = [
                    {"name": m["name"], "size": m.get("size", 0), "family": m.get("details", {}).get("family", "")}
                    for m in models
                ]
                for m in models:
                    name = m["name"].lower()
                    if any(q in name for q in ["qwen", "deepseek", "llama"]):
                        info.recommended_model = m["name"]
                        break
                if not info.recommended_model and models:
                    info.recommended_model = models[0]["name"]
    except Exception:
        pass
    return info


async def _detect_comfyui() -> ComfyUIInfo:
    info = ComfyUIInfo(url=settings.comfyui_url)
    http_url = settings.comfyui_url.replace("ws://", "http://").replace("wss://", "https://")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{http_url}/system_stats")
            info.available = resp.status_code == 200
    except Exception:
        pass
    return info


def _detect_api_keys() -> ApiKeyStatus:
    return ApiKeyStatus(
        nextapi=bool(settings.nextapi_api_key),
        openai=bool(settings.openai_api_key or os.environ.get("OPENAI_API_KEY")),
        anthropic=bool(os.environ.get("ANTHROPIC_API_KEY")),
        deepseek=bool(os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("NEXTCUT_DEEPSEEK_API_KEY")),
        google=bool(os.environ.get("GOOGLE_API_KEY") or os.environ.get("NEXTCUT_GOOGLE_API_KEY")),
    )
