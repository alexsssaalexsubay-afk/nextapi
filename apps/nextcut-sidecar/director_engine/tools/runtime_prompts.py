"""Runtime-editable system prompts for Director Engine agents."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class PromptEntry:
    id: str
    label: str
    role: str
    default_prompt: str
    prompt: str


_PROMPTS: dict[str, PromptEntry] = {}
_DEFAULT_TO_ID: dict[str, str] = {}
_CONFIG_PATH = Path(os.environ.get("NEXTCUT_RUNTIME_PROMPTS_FILE", Path.home() / ".nextcut" / "runtime-prompts.json"))
_OVERRIDES_LOADED = False
_OVERRIDES: dict[str, str] = {}


def register_prompt(prompt_id: str, label: str, role: str, default_prompt: str) -> None:
    _load_overrides()
    existing = _PROMPTS.get(prompt_id)
    prompt = existing.prompt if existing else _OVERRIDES.get(prompt_id, default_prompt)
    _PROMPTS[prompt_id] = PromptEntry(
        id=prompt_id,
        label=label,
        role=role,
        default_prompt=default_prompt,
        prompt=prompt,
    )
    _DEFAULT_TO_ID[default_prompt] = prompt_id


def list_prompts() -> list[PromptEntry]:
    return list(_PROMPTS.values())


def update_prompt(prompt_id: str, prompt: str) -> PromptEntry:
    if prompt_id not in _PROMPTS:
        raise KeyError(prompt_id)
    entry = _PROMPTS[prompt_id]
    entry.prompt = prompt
    _OVERRIDES[prompt_id] = prompt
    _save_overrides()
    return entry


def reset_prompt(prompt_id: str) -> PromptEntry:
    if prompt_id not in _PROMPTS:
        raise KeyError(prompt_id)
    entry = _PROMPTS[prompt_id]
    entry.prompt = entry.default_prompt
    _OVERRIDES.pop(prompt_id, None)
    _save_overrides()
    return entry


def resolve_system_prompt(system_prompt: str) -> str:
    prompt_id = _DEFAULT_TO_ID.get(system_prompt)
    if not prompt_id:
        return system_prompt
    return _PROMPTS[prompt_id].prompt


def _load_overrides() -> None:
    global _OVERRIDES_LOADED, _OVERRIDES
    if _OVERRIDES_LOADED:
        return
    _OVERRIDES_LOADED = True
    if not _CONFIG_PATH.exists():
        return
    try:
        data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            _OVERRIDES = {str(key): str(value) for key, value in data.items() if isinstance(value, str)}
    except (OSError, json.JSONDecodeError):
        _OVERRIDES = {}


def _save_overrides() -> None:
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(json.dumps(_OVERRIDES, ensure_ascii=False, indent=2), encoding="utf-8")
