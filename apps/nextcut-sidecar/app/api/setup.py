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
from pathlib import Path

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.media_tools import resolve_ffmpeg_exe

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


class LocalRuntimeStatus(BaseModel):
    sidecar: bool = True
    ffmpeg: bool = False
    ffmpeg_path: str = ""
    ffmpeg_source: str = ""
    exports_dir: str = ""
    exports_writable: bool = False
    packaged_video_tools: bool = False


class ProductionLineStatus(BaseModel):
    id: str
    label: str
    provider: str
    category: str
    modalities: list[str] = Field(default_factory=list)
    installed: bool = False
    configured: bool = False
    ready: bool = False
    billing: str = ""
    key_source: str = ""
    endpoint: str = ""
    model_hint: str = ""
    local_resource: str = ""
    blockers: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    notes: str = ""


class SetupStatus(BaseModel):
    first_launch: bool = True
    system: SystemInfo = Field(default_factory=SystemInfo)
    runtime: LocalRuntimeStatus = Field(default_factory=LocalRuntimeStatus)
    ollama: OllamaInfo = Field(default_factory=OllamaInfo)
    comfyui: ComfyUIInfo = Field(default_factory=ComfyUIInfo)
    api_keys: ApiKeyStatus = Field(default_factory=ApiKeyStatus)
    production_lines: list[ProductionLineStatus] = Field(default_factory=list)
    ready: bool = False
    issues: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


@router.get("/detect", response_model=SetupStatus)
async def detect_environment():
    """一键检测全部环境状态，前端首次启动向导使用。"""
    status = SetupStatus()

    status.system = _detect_system()
    status.runtime = _detect_runtime()
    status.ollama = await _detect_ollama()
    status.comfyui = await _detect_comfyui()
    status.api_keys = _detect_api_keys()
    status.production_lines = _build_production_lines(status)

    has_llm = any(
        line.ready and ("text" in line.modalities or "prompt" in line.modalities or line.category == "text_llm")
        for line in status.production_lines
    )
    has_video = any(
        line.ready and any(modality in line.modalities for modality in ("video", "image_to_video", "workflow"))
        for line in status.production_lines
    )
    status.ready = has_llm and has_video and status.runtime.ffmpeg and status.runtime.exports_writable

    if not status.runtime.ffmpeg:
        status.issues.append("ffmpeg_unavailable")
        status.recommendations.append(
            "FFmpeg is required for local preview export. Rebuild the sidecar with imageio-ffmpeg or set NEXTCUT_FFMPEG_PATH."
        )

    if not status.runtime.exports_writable:
        status.issues.append("exports_dir_not_writable")
        status.recommendations.append("The local exports directory must be writable for one-click video export.")

    if not has_llm:
        status.issues.append("no_llm_configured")
        if status.ollama.available:
            status.recommendations.append("Ollama detected. Pull a model: ollama pull qwen2.5:7b")
        else:
            status.recommendations.append("Configure an LLM API key (OpenAI/DeepSeek) or install Ollama")

    if not has_video:
        status.issues.append("no_video_api")
        status.recommendations.append(
            "配置 NextAPI、RunningHub、自定义 HTTP 或本地视频模型中的任一条视频生产线路。"
        )

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
    runninghub_key: str = ""
    runninghub_url: str = ""
    custom_http_key: str = ""
    custom_http_url: str = ""
    local_openai_base_url: str = ""
    local_video_model_dir: str = ""
    local_image_model_dir: str = ""


class SetupActionRequest(BaseModel):
    action: str
    kind: str = "video"
    path: str = ""


class SetupActionResponse(BaseModel):
    status: str
    message: str
    path: str = ""
    url: str = ""


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
    if req.runninghub_key:
        settings.runninghub_api_key = req.runninghub_key
        os.environ["NEXTCUT_RUNNINGHUB_API_KEY"] = req.runninghub_key
    if req.runninghub_url:
        settings.runninghub_base_url = req.runninghub_url
        os.environ["NEXTCUT_RUNNINGHUB_BASE_URL"] = req.runninghub_url
    if req.custom_http_key:
        settings.custom_http_api_key = req.custom_http_key
        os.environ["NEXTCUT_CUSTOM_HTTP_API_KEY"] = req.custom_http_key
    if req.custom_http_url:
        settings.custom_http_base_url = req.custom_http_url
        os.environ["NEXTCUT_CUSTOM_HTTP_BASE_URL"] = req.custom_http_url
    if req.local_openai_base_url:
        settings.local_openai_base_url = req.local_openai_base_url
        os.environ["NEXTCUT_LOCAL_OPENAI_BASE_URL"] = req.local_openai_base_url
    if req.local_video_model_dir:
        settings.local_video_model_dir = req.local_video_model_dir
        os.environ["NEXTCUT_LOCAL_VIDEO_MODEL_DIR"] = req.local_video_model_dir
    if req.local_image_model_dir:
        settings.local_image_model_dir = req.local_image_model_dir
        os.environ["NEXTCUT_LOCAL_IMAGE_MODEL_DIR"] = req.local_image_model_dir

    return {"status": "ok", "message": "Keys saved for this session"}


@router.post("/actions", response_model=SetupActionResponse)
async def run_setup_action(req: SetupActionRequest):
    """Run safe one-click setup actions used by the desktop onboarding flow."""
    action = req.action.strip()
    if action == "prepare_exports":
        exports_dir = Path("exports").resolve()
        exports_dir.mkdir(parents=True, exist_ok=True)
        return SetupActionResponse(
            status="ok",
            message="已创建本地导出目录，后续剪辑与导出会写入这里。",
            path=str(exports_dir),
        )

    if action == "prepare_ffmpeg":
        try:
            ffmpeg = resolve_ffmpeg_exe()
            os.environ["NEXTCUT_FFMPEG_PATH"] = ffmpeg
            return SetupActionResponse(
                status="ok",
                message="已启用可用的 FFmpeg。后续本地剪辑、拼接和导出会使用这个二进制。",
                path=ffmpeg,
            )
        except Exception:
            return SetupActionResponse(
                status="open_url",
                message="未发现可用 FFmpeg。请安装 FFmpeg，或使用打包版 NextCut 内置 FFmpeg。",
                url="https://ffmpeg.org/download.html",
            )

    if action == "prepare_model_dir":
        kind = req.kind if req.kind in {"video", "image", "audio", "llm"} else "video"
        target = Path(req.path).expanduser() if req.path else Path("models") / kind
        target = target.resolve()
        target.mkdir(parents=True, exist_ok=True)
        readme = target / "README.nextcut.md"
        if not readme.exists():
            readme.write_text(
                "\n".join(
                    [
                        "# NextCut model pack directory",
                        "",
                        "Put local model files here when using local production lines.",
                        "Supported extensions: .safetensors, .ckpt, .pt, .pth, .bin, .gguf, .onnx.",
                        "Large model weights are intentionally not bundled in the default installer.",
                        "",
                        "Image pipeline:",
                        "- Put SDXL / Flux / LoRA / ControlNet files here when using ComfyUI.",
                        "- NextCut will use ComfyUI or RunningHub as the execution service.",
                    ]
                ),
                encoding="utf-8",
            )
        if kind == "video":
            settings.local_video_model_dir = str(target)
            os.environ["NEXTCUT_LOCAL_VIDEO_MODEL_DIR"] = str(target)
        if kind == "image":
            settings.local_image_model_dir = str(target)
            os.environ["NEXTCUT_LOCAL_IMAGE_MODEL_DIR"] = str(target)
        return SetupActionResponse(
            status="ok",
            message=f"已准备 {kind} 模型目录。模型包下载完成后放入该目录即可被检测。",
            path=str(target),
        )

    if action in {"prepare_image_pipeline", "prepare_image_gen"}:
        image_dir = Path(req.path).expanduser() if req.path else Path("models") / "image"
        image_dir = image_dir.resolve()
        image_dir.mkdir(parents=True, exist_ok=True)
        readme = image_dir / "README.nextcut.md"
        if not readme.exists():
            readme.write_text(
                "\n".join(
                    [
                        "# NextCut image pipeline model directory",
                        "",
                        "This directory is for local image pipeline assets used by ComfyUI workflows.",
                        "Recommended layout:",
                        "- checkpoints/: SDXL / Flux / base models",
                        "- loras/: identity/style LoRA files",
                        "- controlnet/: pose/depth/control models",
                        "- vae/: optional VAE files",
                        "",
                        "Cloud image workflows can use RunningHub with the user's own key.",
                    ]
                ),
                encoding="utf-8",
            )
        for child in ("checkpoints", "loras", "controlnet", "vae", "workflows"):
            (image_dir / child).mkdir(exist_ok=True)
        settings.local_image_model_dir = str(image_dir)
        os.environ["NEXTCUT_LOCAL_IMAGE_MODEL_DIR"] = str(image_dir)
        settings.comfyui_url = settings.comfyui_url or "ws://localhost:8188"
        settings.runninghub_base_url = settings.runninghub_base_url or "https://www.runninghub.cn"
        os.environ["NEXTCUT_COMFYUI_URL"] = settings.comfyui_url
        os.environ["NEXTCUT_RUNNINGHUB_BASE_URL"] = settings.runninghub_base_url
        return SetupActionResponse(
            status="ok",
            message="已准备生图线路：图片模型目录、ComfyUI 默认端点和 RunningHub 默认端点已配置。启动 ComfyUI 或填写 RunningHub Key 后即可生产分镜图、角色资产和垫图。",
            path=str(image_dir),
        )

    if action == "prepare_local_factory":
        Path("exports").resolve().mkdir(parents=True, exist_ok=True)
        for kind in ("video", "image"):
            target = (Path("models") / kind).resolve()
            target.mkdir(parents=True, exist_ok=True)
        settings.local_video_model_dir = str((Path("models") / "video").resolve())
        settings.local_image_model_dir = str((Path("models") / "image").resolve())
        os.environ["NEXTCUT_LOCAL_VIDEO_MODEL_DIR"] = settings.local_video_model_dir
        os.environ["NEXTCUT_LOCAL_IMAGE_MODEL_DIR"] = settings.local_image_model_dir
        settings.comfyui_url = settings.comfyui_url or "ws://localhost:8188"
        settings.ollama_url = settings.ollama_url or "http://localhost:11434"
        settings.runninghub_base_url = settings.runninghub_base_url or "https://www.runninghub.cn"
        settings.local_openai_base_url = settings.local_openai_base_url or "http://localhost:8000/v1"
        os.environ["NEXTCUT_COMFYUI_URL"] = settings.comfyui_url
        os.environ["NEXTCUT_OLLAMA_URL"] = settings.ollama_url
        os.environ["NEXTCUT_RUNNINGHUB_BASE_URL"] = settings.runninghub_base_url
        os.environ["NEXTCUT_LOCAL_OPENAI_BASE_URL"] = settings.local_openai_base_url
        try:
            os.environ["NEXTCUT_FFMPEG_PATH"] = resolve_ffmpeg_exe()
        except Exception:
            pass
        return SetupActionResponse(
            status="ok",
            message="已一键准备本地工厂：导出目录、视频模型目录、图片模型目录、默认端点和可用 FFmpeg 检测已完成。",
            path=str(Path("models").resolve()),
        )

    if action == "apply_default_routes":
        settings.comfyui_url = settings.comfyui_url or "ws://localhost:8188"
        settings.ollama_url = settings.ollama_url or "http://localhost:11434"
        settings.runninghub_base_url = settings.runninghub_base_url or "https://www.runninghub.cn"
        settings.local_openai_base_url = settings.local_openai_base_url or "http://localhost:8000/v1"
        os.environ["NEXTCUT_COMFYUI_URL"] = settings.comfyui_url
        os.environ["NEXTCUT_OLLAMA_URL"] = settings.ollama_url
        os.environ["NEXTCUT_RUNNINGHUB_BASE_URL"] = settings.runninghub_base_url
        os.environ["NEXTCUT_LOCAL_OPENAI_BASE_URL"] = settings.local_openai_base_url
        return SetupActionResponse(
            status="ok",
            message="已套用本地常用默认端点：Ollama、ComfyUI、RunningHub、本地 OpenAI-compatible。",
        )

    action_urls = {
        "open_nextapi_key": "https://app.nextapi.top",
        "open_comfyui": "https://github.com/comfyanonymous/ComfyUI",
        "open_ffmpeg_download": "https://ffmpeg.org/download.html",
        "open_ollama": "https://ollama.com/download",
        "open_runninghub": "https://www.runninghub.cn",
    }
    if action in action_urls:
        return SetupActionResponse(
            status="open_url",
            message="请在打开的页面完成下载或 Key 配置，回到 NextCut 后重新检测。",
            url=action_urls[action],
        )

    return SetupActionResponse(status="error", message=f"Unknown setup action: {action}")


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


def _detect_runtime() -> LocalRuntimeStatus:
    status = LocalRuntimeStatus()

    exports_dir = Path("exports").resolve()
    status.exports_dir = str(exports_dir)
    try:
        exports_dir.mkdir(exist_ok=True)
        probe = exports_dir / ".nextcut_write_probe"
        probe.write_text("ok")
        probe.unlink(missing_ok=True)
        status.exports_writable = True
    except Exception:
        status.exports_writable = False

    try:
        ffmpeg = resolve_ffmpeg_exe()
        status.ffmpeg = True
        status.ffmpeg_path = ffmpeg
        status.packaged_video_tools = "imageio_ffmpeg" in ffmpeg or "imageio-ffmpeg" in ffmpeg
        if os.getenv("NEXTCUT_FFMPEG_PATH"):
            status.ffmpeg_source = "env"
        elif status.packaged_video_tools:
            status.ffmpeg_source = "bundled"
        else:
            status.ffmpeg_source = "system"
    except Exception:
        status.ffmpeg = False

    return status


def _nextapi_v1_base() -> str:
    base = (settings.nextapi_base_url or "").strip().rstrip("/")
    if not base:
        base = "https://api.nextapi.top"
    return base if base.endswith("/v1") else f"{base}/v1"


def _build_production_lines(status: SetupStatus) -> list[ProductionLineStatus]:
    local_video_installed, local_video_dir = _detect_local_model_dir(
        settings.local_video_model_dir,
        "video",
    )
    local_image_installed, local_image_dir = _detect_local_model_dir(
        settings.local_image_model_dir,
        "image",
    )
    runninghub_key = bool(settings.runninghub_api_key or os.environ.get("RUNNINGHUB_API_KEY"))
    custom_http_configured = bool(settings.custom_http_base_url)
    local_openai_configured = bool(
        settings.local_openai_base_url and os.environ.get("NEXTCUT_LOCAL_OPENAI_BASE_URL")
    )
    has_local_llm = status.ollama.available or bool(settings.openai_base_url) or local_openai_configured
    has_llm_key = status.api_keys.openai or status.api_keys.deepseek or status.api_keys.google or status.api_keys.anthropic
    local_video_blockers: list[str] = []
    if not local_video_installed:
        local_video_blockers.append("local_video_model_pack_missing")
    if not status.runtime.ffmpeg:
        local_video_blockers.append("ffmpeg_unavailable")

    return [
        ProductionLineStatus(
            id="nextapi-video",
            label="NextAPI 托管视频",
            provider="nextapi",
            category="cloud_video",
            modalities=["video", "image_refs", "audio_refs"],
            installed=True,
            configured=status.api_keys.nextapi,
            ready=status.api_keys.nextapi,
            billing="team_credits",
            key_source="NextAPI team dashboard key",
            endpoint=_nextapi_v1_base(),
            model_hint="seedance-2.0-pro / seedance-2.0-fast",
            blockers=[] if status.api_keys.nextapi else ["missing_nextapi_key"],
            capabilities=["Seedance 视频生成", "参考图/参考视频/音频垫参", "团队余额扣点"],
            notes="适合正式视频生成和团队统一结算。",
        ),
        ProductionLineStatus(
            id="comfyui-image",
            label="ComfyUI 本地生图",
            provider="comfyui",
            category="local_image",
            modalities=["image", "storyboard_keyframe", "character_assets"],
            installed=status.comfyui.available,
            configured=status.comfyui.available,
            ready=status.comfyui.available,
            billing="local_or_user_key",
            key_source="local service",
            endpoint=status.comfyui.url,
            model_hint="由 ComfyUI 工作流选择 checkpoint / LoRA",
            local_resource=f"{'已发现模型包' if local_image_installed else '模型目录已预留'} · {local_image_dir}",
            blockers=[] if status.comfyui.available else ["comfyui_not_running"],
            capabilities=["角色三视图/表情/服装资产", "分镜图/首帧/尾帧", "本地工作流可控"],
            notes="用户自己的本地服务，不扣 NextAPI 团队点数。",
        ),
        ProductionLineStatus(
            id="runninghub-workflow",
            label="RunningHub 工作流",
            provider="runninghub",
            category="cloud_workflow",
            modalities=["image", "video", "workflow"],
            installed=True,
            configured=runninghub_key,
            ready=runninghub_key,
            billing="user_provider_key",
            key_source="user RunningHub key",
            endpoint=settings.runninghub_base_url,
            model_hint="由 RunningHub workflow/template 决定",
            blockers=[] if runninghub_key else ["missing_runninghub_key"],
            capabilities=["云端 Comfy 工作流", "复杂节点编排", "图像/视频生产链"],
            notes="走用户自己的 RunningHub Key，不扣 NextAPI 团队点数。",
        ),
        ProductionLineStatus(
            id="local-video-model",
            label="本地视频模型",
            provider="local-video-engine",
            category="local_video",
            modalities=["video", "image_to_video"],
            installed=local_video_installed,
            configured=local_video_installed,
            ready=local_video_installed and status.runtime.ffmpeg,
            billing="local_resource",
            key_source="not_required",
            endpoint=local_video_dir,
            model_hint="LTX / Wan / AnimateDiff 等本地模型包",
            local_resource=f"{status.system.gpu_backend or 'cpu'} / {status.system.ram_gb:g} GB RAM",
            blockers=local_video_blockers,
            capabilities=["离线/本地视频生成", "不上传素材", "不扣团队点数"],
            notes="模型包体积大，不默认打进客户端；需要模型中心下载和校验。",
        ),
        ProductionLineStatus(
            id="local-openai-compatible",
            label="本地 / 自带 LLM",
            provider="local-openai-compatible",
            category="text_llm",
            modalities=["text", "prompt", "agent_planning"],
            installed=status.ollama.available or bool(settings.local_openai_base_url),
            configured=has_local_llm or has_llm_key,
            ready=has_local_llm or has_llm_key,
            billing="local_or_user_key",
            key_source="local service / user api key",
            endpoint=status.ollama.url if status.ollama.available else settings.local_openai_base_url,
            model_hint=status.ollama.recommended_model or settings.openai_model,
            blockers=[] if (has_local_llm or has_llm_key) else ["missing_llm_source"],
            capabilities=["AI 导演", "分镜拆解", "提示词优化", "生成前检查"],
            notes="用于文字规划，不直接生成图片或视频。",
        ),
        ProductionLineStatus(
            id="custom-http",
            label="自定义 HTTP Provider",
            provider="custom-http",
            category="custom",
            modalities=["text", "image", "video", "audio"],
            installed=True,
            configured=custom_http_configured,
            ready=custom_http_configured,
            billing="external",
            key_source="user custom key",
            endpoint=settings.custom_http_base_url,
            model_hint="由自定义请求体和 provider_options 决定",
            blockers=[] if custom_http_configured else ["missing_custom_http_endpoint"],
            capabilities=["开放上游字段", "透传 envelope", "接入私有网关/本地服务"],
            notes="适合未来新模型，不把字段写死在客户端。",
        ),
    ]


def _detect_local_model_dir(configured_dir: str, kind: str) -> tuple[bool, str]:
    candidate = Path(configured_dir).expanduser() if configured_dir else Path("models") / kind
    candidate = candidate.resolve()
    if not candidate.exists() or not candidate.is_dir():
        return False, str(candidate)
    model_suffixes = {".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".onnx"}
    try:
        installed = any(path.is_file() and path.suffix.lower() in model_suffixes for path in candidate.rglob("*"))
    except Exception:
        installed = False
    return installed, str(candidate)


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
