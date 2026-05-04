import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()


class ProjectCreateRequest(BaseModel):
    name: str
    description: str = ""


class ProjectManifest(BaseModel):
    id: str
    name: str
    description: str
    created_at: str
    updated_at: str
    shots: list[dict] = []
    settings: dict = {}


def _projects_root() -> Path:
    root = Path(settings.project_dir) if settings.project_dir else Path.home() / ".nextcut" / "projects"
    root.mkdir(parents=True, exist_ok=True)
    return root


@router.get("/")
async def list_projects():
    root = _projects_root()
    projects = []
    for p in root.iterdir():
        manifest_path = p / "manifest.json"
        if manifest_path.exists():
            with open(manifest_path) as f:
                projects.append(json.load(f))
    projects.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return {"projects": projects}


@router.post("/")
async def create_project(request: ProjectCreateRequest):
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    manifest = ProjectManifest(
        id=project_id,
        name=request.name,
        description=request.description,
        created_at=now,
        updated_at=now,
    )
    project_dir = _projects_root() / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "assets").mkdir(exist_ok=True)
    (project_dir / "cache").mkdir(exist_ok=True)
    with open(project_dir / "manifest.json", "w") as f:
        json.dump(manifest.model_dump(), f, indent=2)
    return manifest.model_dump()


@router.get("/{project_id}")
async def get_project(project_id: str):
    manifest_path = _projects_root() / project_id / "manifest.json"
    if not manifest_path.exists():
        return {"error": "Project not found"}
    with open(manifest_path) as f:
        return json.load(f)


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    import shutil

    project_dir = _projects_root() / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir)
        return {"status": "deleted"}
    return {"error": "Project not found"}
