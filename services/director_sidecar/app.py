from __future__ import annotations

import hmac
import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .local_client import router as local_client_router
from .vimax_bridge import ManagedDirectorBridge, PipelineUnavailable


class CharacterInput(BaseModel):
    name: str = ""
    description: str = ""
    asset_id: str = ""
    reference_images: list[str] = Field(default_factory=list)


class ProviderPolicy(BaseModel):
    no_external_keys: bool = True
    allowed_model_exits: list[str] = Field(default_factory=list)
    storage_mode: str = "nextapi_assets"
    task_status_mode: str = "nextapi_workflow_jobs"
    billing_mode: str = "nextapi_billing"
    product_brand: str = "NextAPI Director"
    do_not_expose_upstream: bool = True
    workflow_output_schema: str = "nextapi.director.storyboard.v1"


class CallbackConfig(BaseModel):
    base_url: str = ""
    token: str = ""
    text_endpoint: str = "/text"
    image_endpoint: str = "/image"


class StoryboardRequest(BaseModel):
    engine: str = "nextapi-director"
    story: str
    genre: str = ""
    style: str = ""
    scene: str = ""
    org_id: str = ""
    shot_count: int = 3
    duration_per_shot: int = 4
    characters: list[CharacterInput] = Field(default_factory=list)
    text_provider_id: str = ""
    image_provider_id: str = ""
    callback: CallbackConfig = Field(default_factory=CallbackConfig)
    policy: ProviderPolicy = Field(default_factory=ProviderPolicy)


app = FastAPI(title="NextAPI Director Runtime", version="0.1.0")
app.include_router(local_client_router)

_CLIENT_DIR = Path(__file__).resolve().parent / "client"
app.mount("/client/assets", StaticFiles(directory=_CLIENT_DIR), name="director-studio-assets")


@app.get("/client", include_in_schema=False)
async def local_client() -> FileResponse:
    return FileResponse(_CLIENT_DIR / "index.html")


@app.get("/health")
async def health(x_director_sidecar_token: str | None = Header(default=None)) -> dict[str, object]:
    _require_sidecar_token(x_director_sidecar_token)
    try:
        return ManagedDirectorBridge(_repo_root()).healthcheck()
    except PipelineUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/v1/director/storyboard")
async def storyboard(
    request: StoryboardRequest,
    x_director_sidecar_token: str | None = Header(default=None),
) -> dict:
    _require_sidecar_token(x_director_sidecar_token)
    request = _with_env_callback(request)
    if not request.story.strip():
        raise HTTPException(status_code=400, detail="story is required")
    if request.shot_count <= 0 or request.shot_count > 12:
        raise HTTPException(status_code=400, detail="shot_count must be between 1 and 12")
    bridge = ManagedDirectorBridge(_repo_root())
    try:
        return await bridge.run(request)
    except PipelineUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _require_sidecar_token(actual: str | None) -> None:
    expected = os.getenv("DIRECTOR_SIDECAR_TOKEN", "").strip()
    if expected and not hmac.compare_digest(actual or "", expected):
        raise HTTPException(status_code=401, detail="unauthorized")


def _with_env_callback(request: StoryboardRequest) -> StoryboardRequest:
    if not request.callback.base_url:
        request.callback.base_url = os.getenv(
            "DIRECTOR_RUNTIME_CALLBACK_URL",
            "http://127.0.0.1:8080/v1/internal/director-runtime",
        )
    if not request.callback.token:
        request.callback.token = os.getenv("DIRECTOR_RUNTIME_TOKEN", "")
    return request


def _repo_root() -> Path:
    configured = os.getenv("NEXTAPI_REPO_ROOT", "").strip()
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[2]
