"""NextAPIDirectorPlan — plan shots with the vendored ViMax adapter."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any


class NextAPIDirectorPlan:
    CATEGORY = "NextAPI"
    RETURN_TYPES = ("STRING", "STRING", "STRING", "INT", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
        "plan_json",
        "workflow_json",
        "prompt",
        "duration",
        "aspect_ratio",
        "negative_prompt",
        "character_url",
        "camera",
        "motion",
        "shot_id",
    )
    FUNCTION = "plan"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "script_text": ("STRING", {"default": "", "multiline": True}),
                "shot_count": ("INT", {"default": 3, "min": 1, "max": 24, "step": 1}),
                "duration": ("INT", {"default": 5, "min": 4, "max": 15, "step": 1}),
                "aspect_ratio": (["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"], {"default": "16:9"}),
                "style": ("STRING", {"default": "cinematic realistic", "multiline": False}),
            },
            "optional": {
                "character_refs": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                    },
                ),
                "title": ("STRING", {"default": "", "multiline": False}),
                "vimax_root": (
                    "STRING",
                    {
                        "default": os.getenv("NEXTAPI_VIMAX_ROOT", ""),
                        "multiline": False,
                    },
                ),
            },
        }

    def plan(
        self,
        script_text: str,
        shot_count: int,
        duration: int,
        aspect_ratio: str,
        style: str,
        character_refs: str = "",
        title: str = "",
        vimax_root: str = "",
    ):
        director = _load_director_module(vimax_root)
        plan: dict[str, Any] = director.build_nextapi_director_plan(
            script_text,
            shot_count=shot_count,
            duration=duration,
            aspect_ratio=aspect_ratio,
            style=style,
            character_refs=character_refs,
            title=title,
        )
        first = (plan.get("shots") or [{}])[0]
        refs = first.get("references") or {}
        plan_json = json.dumps(plan, ensure_ascii=False, indent=2)
        workflow_json = json.dumps(plan.get("workflow") or {}, ensure_ascii=False, indent=2)
        return (
            plan_json,
            workflow_json,
            str(first.get("prompt") or ""),
            int(first.get("duration") or duration),
            str(first.get("aspect_ratio") or aspect_ratio),
            str(first.get("negative_prompt") or ""),
            str(refs.get("character_url") or ""),
            str(first.get("camera") or ""),
            str(first.get("motion") or ""),
            str(first.get("id") or ""),
        )


def _load_director_module(vimax_root: str):
    candidates = []
    if vimax_root.strip():
        candidates.append(Path(vimax_root.strip()))
    here = Path(__file__).resolve()
    candidates.extend(
        [
            here.parents[3] / "third_party" / "vimax",
            here.parents[4] / "third_party" / "vimax",
        ]
    )
    for root in candidates:
        module_path = root / "nextapi_director.py"
        if module_path.exists():
            return _load_module(module_path)
    searched = ", ".join(str(p) for p in candidates)
    raise RuntimeError(
        "NextAPIDirectorPlan could not find ViMax nextapi_director.py. "
        f"Set NEXTAPI_VIMAX_ROOT or vimax_root. Searched: {searched}"
    )


def _load_module(path: Path):
    spec = importlib.util.spec_from_file_location("_nextapi_vimax_director", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load ViMax director module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module
