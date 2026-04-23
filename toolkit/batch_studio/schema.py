"""Pydantic schemas for shot manifest rows and job tracking.

Keep these models in sync with ``sample_data/shot_manifest.csv``. Schema
changes should always:
  1. add new optional fields with sane defaults (never break import of older CSVs);
  2. update ``REQUIRED_COLUMNS`` and ``validate_dataframe()`` below.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

import pandas as pd
from pydantic import BaseModel, Field, field_validator


REQUIRED_COLUMNS: List[str] = [
    "shot_id",
    "prompt_en",
    "duration",
    "aspect_ratio",
]

OPTIONAL_COLUMNS: List[str] = [
    "episode",
    "scene_id",
    "continuity_group",
    "character_id",
    "outfit_id",
    "scene_ref",
    "prompt_cn",
    "camera",
    "motion",
    "mood",
    "negative_prompt",
    "character_ref",
    "outfit_ref",
    "reference_video",
]

VALID_ASPECT_RATIOS = {"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}

# Human-readable column descriptions for validation messages.
_COL_LABEL: dict[str, str] = {
    "shot_id": "Shot ID",
    "prompt_en": "English prompt",
    "duration": "Duration (seconds)",
    "aspect_ratio": "Aspect ratio",
    "continuity_group": "Continuity group",
    "character_ref": "Character reference",
    "outfit_ref": "Outfit reference",
    "scene_ref": "Scene reference",
}


class JobStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    RETRYING = "retrying"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DOWNLOADED = "downloaded"

    def label(self) -> str:
        """Short display label for the UI."""
        return {
            "pending": "⏳ Pending",
            "queued": "📤 Queued",
            "running": "🎬 Rendering",
            "retrying": "🔄 Retrying",
            "succeeded": "✅ Succeeded",
            "failed": "❌ Failed",
            "downloaded": "💾 Downloaded",
        }.get(self.value, self.value)

    def color(self) -> str:
        """Hex color for status badge."""
        return {
            "pending":    "#94a3b8",
            "queued":     "#60a5fa",
            "running":    "#f59e0b",
            "retrying":   "#a78bfa",
            "succeeded":  "#34d399",
            "failed":     "#f87171",
            "downloaded": "#10b981",
        }.get(self.value, "#94a3b8")

    @property
    def is_terminal(self) -> bool:
        return self in {JobStatus.DOWNLOADED, JobStatus.FAILED}

    @property
    def is_active(self) -> bool:
        return self in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.RETRYING, JobStatus.PENDING}


class ShotRow(BaseModel):
    """A single row in shot_manifest.csv after validation."""

    shot_id: str = Field(min_length=1)
    prompt_en: str = Field(min_length=4)
    duration: int = Field(ge=2, le=12, default=5)
    aspect_ratio: str = Field(default="16:9")

    episode: Optional[str] = None
    scene_id: Optional[str] = None
    continuity_group: Optional[str] = None
    character_id: Optional[str] = None
    outfit_id: Optional[str] = None
    scene_ref: Optional[str] = None
    prompt_cn: Optional[str] = None
    camera: Optional[str] = None
    motion: Optional[str] = None
    mood: Optional[str] = None
    negative_prompt: Optional[str] = None
    character_ref: Optional[str] = None
    outfit_ref: Optional[str] = None
    reference_video: Optional[str] = None

    @field_validator("aspect_ratio")
    @classmethod
    def _ar(cls, v: str) -> str:
        v = v.strip()
        if v not in VALID_ASPECT_RATIOS:
            options = " · ".join(sorted(VALID_ASPECT_RATIOS))
            raise ValueError(
                f"'{v}' is not a supported aspect ratio. "
                f"Pick one of: {options}"
            )
        return v

    @field_validator("duration", mode="before")
    @classmethod
    def _dur(cls, v: object) -> int:
        try:
            n = int(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            raise ValueError(
                f"Duration must be a whole number between 2 and 12, got '{v}'"
            )
        if n < 2 or n > 12:
            raise ValueError(
                f"Duration must be between 2 and 12 seconds, got {n}"
            )
        return n

    @field_validator("shot_id")
    @classmethod
    def _sid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Shot ID cannot be blank — every row needs a unique identifier")
        return v

    @field_validator("prompt_en")
    @classmethod
    def _pe(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 4:
            raise ValueError(
                f"English prompt is too short ('{v[:30]}…'). "
                "Write at least a sentence — the model needs enough detail to work with."
            )
        return v


class JobRecord(BaseModel):
    """In-memory tracking of a single batch job."""

    shot_id: str
    row_index: int
    status: JobStatus = JobStatus.PENDING
    job_id: Optional[str] = None
    estimated_credits: Optional[int] = None
    output_url: Optional[str] = None
    local_file_path: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    attempts: int = 0
    retry_count: int = 0
    # Epoch time when this record was last updated (for ETA calculation).
    updated_at: float = Field(default_factory=lambda: __import__("time").time())
    # Fields that were auto-inherited from the continuity_group anchor.
    inherited_fields: List[str] = Field(default_factory=list)


def validate_dataframe(
    df: pd.DataFrame,
    uploaded_ref_names: Optional[set[str]] = None,
) -> tuple[pd.DataFrame, list[dict], list[dict]]:
    """Validate a manifest dataframe.

    Returns (clean_df, errors, warnings).

    ``errors``   — list of {row_index, shot_id, field, message} for rows
                   dropped because they are unrecoverable.
    ``warnings`` — list of {row_index, shot_id, field, message} for issues
                   that don't block generation but may cause unexpected results
                   (e.g. duplicate shot_id, referenced ref not uploaded).
    """
    # --- 1. Required columns check -------------------------------------------
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        labels = [_COL_LABEL.get(c, c) for c in missing]
        raise ValueError(
            f"Your CSV is missing required column(s): {', '.join(labels)}. "
            f"Download sample_data/shot_manifest.csv to see the correct format."
        )

    errors: list[dict] = []
    warnings: list[dict] = []
    valid_indices: list[int] = []
    seen_shot_ids: dict[str, int] = {}

    for i, row in df.iterrows():
        shot_id = str(row.get("shot_id", "")).strip()

        # --- 2. Duplicate shot_id warning ------------------------------------
        if shot_id and shot_id in seen_shot_ids:
            warnings.append(
                {
                    "row": int(i) + 1,
                    "shot_id": shot_id,
                    "field": "shot_id",
                    "message": (
                        f"Shot ID '{shot_id}' appears more than once "
                        f"(first seen at row {seen_shot_ids[shot_id] + 1}). "
                        "Duplicate shots will overwrite each other in the output folder."
                    ),
                }
            )
        if shot_id:
            seen_shot_ids[shot_id] = int(i)

        # --- 3. Per-row schema validation ------------------------------------
        try:
            ShotRow(**{k: row[k] for k in df.columns if pd.notna(row.get(k))})
            valid_indices.append(i)
        except Exception as exc:
            # Extract the first validation error message cleanly.
            msg = str(exc)
            # pydantic v2 wraps the message in a list; strip it if present.
            if "Value error," in msg:
                msg = msg.split("Value error,", 1)[-1].strip()
            errors.append(
                {
                    "row": int(i) + 1,
                    "shot_id": shot_id or "(blank)",
                    "field": _guess_field(str(exc)),
                    "message": msg,
                }
            )
            continue

        # --- 4. Unresolved reference warnings --------------------------------
        if uploaded_ref_names is not None:
            for ref_col in ("character_ref", "outfit_ref", "scene_ref"):
                ref_val = str(row.get(ref_col, "")).strip()
                if (
                    ref_val
                    and ref_val.lower() not in {"nan", "none", "null"}
                    and not ref_val.startswith(("http://", "https://"))
                    and ref_val not in uploaded_ref_names
                    and ref_val.rsplit(".", 1)[0] not in uploaded_ref_names
                ):
                    warnings.append(
                        {
                            "row": int(i) + 1,
                            "shot_id": shot_id,
                            "field": ref_col,
                            "message": (
                                f"'{ref_val}' is listed as {_COL_LABEL.get(ref_col, ref_col)} "
                                "but no matching file was uploaded in the sidebar. "
                                "Either upload the image or replace the value with an https:// URL."
                            ),
                        }
                    )

    return df.loc[valid_indices].reset_index(drop=True), errors, warnings


def _guess_field(pydantic_msg: str) -> str:
    """Heuristically map a pydantic error message to a column name."""
    for key in ("shot_id", "prompt_en", "duration", "aspect_ratio"):
        if key in pydantic_msg:
            return _COL_LABEL.get(key, key)
    return "—"
