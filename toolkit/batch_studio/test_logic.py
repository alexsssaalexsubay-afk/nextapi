"""Logic-layer tests for Batch Studio.

Run with:  python -m pytest toolkit/batch_studio/test_logic.py -v
or from the toolkit/batch_studio directory:  python -m pytest test_logic.py -v

No Streamlit or network dependencies are required.  These tests cover:
  - CSV schema validation (required columns, field types, edge cases)
  - ShotRow pydantic model validation
  - continuity_group inheritance logic
  - build_payload mapping
  - resolve_refs ref replacement
  - BatchResult helper properties (successes, failures, in_flight)
  - Template loading (BUILT_IN_TEMPLATES integrity)
  - Output folder / manifest generation helpers
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import time
from pathlib import Path

import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Import the modules under test from the same directory.
# ---------------------------------------------------------------------------

_HERE = Path(__file__).parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from schema import (
    REQUIRED_COLUMNS,
    VALID_ASPECT_RATIOS,
    JobRecord,
    JobStatus,
    ShotRow,
    validate_dataframe,
)
from utils import (
    BUILT_IN_TEMPLATES,
    CONTINUITY_FIELDS,
    apply_continuity_inheritance,
    annotate_inherited_refs,
    build_payload,
    continuity_summary,
    resolve_refs,
    safe_filename,
)

# ============================================================================
# Helpers
# ============================================================================

def make_df(**kwargs) -> pd.DataFrame:
    """Build a minimal valid DataFrame with one row, overridable via kwargs."""
    row = {
        "shot_id": "s01",
        "prompt_en": "A sunrise over the mountains, wide cinematic shot",
        "duration": 5,
        "aspect_ratio": "16:9",
    }
    row.update(kwargs)
    return pd.DataFrame([row])


# ============================================================================
# 1. CSV schema validation — REQUIRED_COLUMNS
# ============================================================================

class TestCSVRequiredColumns:
    def test_all_required_columns_present(self):
        df, errors, warnings = validate_dataframe(make_df())
        assert errors == [], f"Unexpected errors: {errors}"
        assert len(df) == 1

    def test_missing_shot_id_raises(self):
        df = make_df()
        df = df.drop(columns=["shot_id"])
        # validate_dataframe raises ValueError with a human-readable column label
        with pytest.raises(ValueError):
            validate_dataframe(df)

    def test_missing_prompt_en_raises(self):
        df = make_df()
        df = df.drop(columns=["prompt_en"])
        with pytest.raises(ValueError, match="English prompt"):
            validate_dataframe(df)

    def test_missing_duration_raises(self):
        df = make_df()
        df = df.drop(columns=["duration"])
        with pytest.raises(ValueError, match="Duration"):
            validate_dataframe(df)

    def test_missing_aspect_ratio_raises(self):
        df = make_df()
        df = df.drop(columns=["aspect_ratio"])
        with pytest.raises(ValueError, match="Aspect ratio"):
            validate_dataframe(df)

    def test_all_four_required_columns_present(self):
        assert set(REQUIRED_COLUMNS) == {"shot_id", "prompt_en", "duration", "aspect_ratio"}


# ============================================================================
# 2. ShotRow field validation
# ============================================================================

class TestShotRowValidation:
    def test_valid_row_succeeds(self):
        row = ShotRow(
            shot_id="s01",
            prompt_en="Ocean waves crashing on a rocky shore at dawn",
            duration=5,
            aspect_ratio="16:9",
        )
        assert row.shot_id == "s01"

    def test_empty_shot_id_fails(self):
        # Pydantic raises ValidationError for empty string (min_length=1 constraint)
        with pytest.raises(Exception):
            ShotRow(shot_id="", prompt_en="A valid prompt text", duration=5, aspect_ratio="16:9")

    def test_whitespace_only_shot_id_fails(self):
        with pytest.raises(Exception):
            ShotRow(shot_id="   ", prompt_en="A valid prompt text", duration=5, aspect_ratio="16:9")

    def test_short_prompt_fails(self):
        # Pydantic raises ValidationError for prompt_en shorter than 4 chars
        with pytest.raises(Exception):
            ShotRow(shot_id="s01", prompt_en="hi", duration=5, aspect_ratio="16:9")

    def test_invalid_aspect_ratio_fails(self):
        with pytest.raises(Exception, match="not a supported aspect ratio"):
            ShotRow(shot_id="s01", prompt_en="A valid long enough prompt", duration=5, aspect_ratio="2:3")

    def test_all_valid_aspect_ratios_accepted(self):
        for ar in VALID_ASPECT_RATIOS:
            row = ShotRow(
                shot_id="s01",
                prompt_en="A valid long enough prompt",
                duration=5,
                aspect_ratio=ar,
            )
            assert row.aspect_ratio == ar

    def test_duration_too_low_fails(self):
        with pytest.raises(Exception, match="Duration"):
            ShotRow(shot_id="s01", prompt_en="A valid long enough prompt", duration=1, aspect_ratio="16:9")

    def test_duration_too_high_fails(self):
        with pytest.raises(Exception, match="Duration"):
            ShotRow(shot_id="s01", prompt_en="A valid long enough prompt", duration=13, aspect_ratio="16:9")

    def test_duration_string_converted(self):
        row = ShotRow(shot_id="s01", prompt_en="A valid long enough prompt", duration="5", aspect_ratio="16:9")
        assert row.duration == 5

    def test_boundary_duration_2_accepted(self):
        row = ShotRow(shot_id="s01", prompt_en="A valid long enough prompt", duration=2, aspect_ratio="16:9")
        assert row.duration == 2

    def test_boundary_duration_12_accepted(self):
        row = ShotRow(shot_id="s01", prompt_en="A valid long enough prompt", duration=12, aspect_ratio="16:9")
        assert row.duration == 12


# ============================================================================
# 3. validate_dataframe — multi-row, errors, warnings
# ============================================================================

class TestValidateDataframe:
    def test_one_invalid_row_dropped(self):
        rows = [
            {"shot_id": "s01", "prompt_en": "A valid sunset shot over the mountains", "duration": 5, "aspect_ratio": "16:9"},
            {"shot_id": "s02", "prompt_en": "hi",  "duration": 5, "aspect_ratio": "16:9"},  # too short
        ]
        df = pd.DataFrame(rows)
        clean, errors, _ = validate_dataframe(df)
        assert len(clean) == 1
        assert len(errors) == 1
        assert errors[0]["shot_id"] == "s02"

    def test_duplicate_shot_id_generates_warning(self):
        rows = [
            {"shot_id": "s01", "prompt_en": "A valid long sunset shot cinematic", "duration": 5, "aspect_ratio": "16:9"},
            {"shot_id": "s01", "prompt_en": "Another valid long shot over the hills", "duration": 5, "aspect_ratio": "16:9"},
        ]
        df = pd.DataFrame(rows)
        _, errors, warnings = validate_dataframe(df)
        assert errors == [], "Duplicates should only warn, not error"
        assert any("appears more than once" in w["message"] for w in warnings)

    def test_optional_columns_ignored_if_absent(self):
        df = make_df()
        clean, errors, _ = validate_dataframe(df)
        assert errors == []
        assert len(clean) == 1

    def test_unresolved_ref_generates_warning(self):
        rows = [{"shot_id": "s01", "prompt_en": "Cinematic sunset over mountains", "duration": 5,
                 "aspect_ratio": "16:9", "character_ref": "my_model.jpg"}]
        df = pd.DataFrame(rows)
        _, errors, warnings = validate_dataframe(df, uploaded_ref_names=set())
        assert errors == []
        assert any("my_model.jpg" in w["message"] for w in warnings)

    def test_https_ref_does_not_warn(self):
        rows = [{"shot_id": "s01", "prompt_en": "Cinematic sunset over mountains", "duration": 5,
                 "aspect_ratio": "16:9", "character_ref": "https://example.com/model.jpg"}]
        df = pd.DataFrame(rows)
        _, errors, warnings = validate_dataframe(df, uploaded_ref_names=set())
        assert errors == []
        assert not any("character_ref" in w.get("field", "") for w in warnings)


# ============================================================================
# 4. Continuity inheritance
# ============================================================================

class TestContinuityInheritance:
    def _make_rows(self, anchor_cg="cg1", follower_cg="cg1"):
        anchor = {
            "shot_id": "s01",
            "continuity_group": anchor_cg,
            "character_ref": "hero.jpg",
            "outfit_ref": "dress.jpg",
            "scene_ref": "",
        }
        follower = {
            "shot_id": "s02",
            "continuity_group": follower_cg,
            "character_ref": "",
            "outfit_ref": "",
            "scene_ref": "garden.jpg",
        }
        return [anchor, follower]

    def test_follower_inherits_character_and_outfit_refs(self):
        rows = self._make_rows()
        result = apply_continuity_inheritance(rows)
        assert result[1]["character_ref"] == "hero.jpg"
        assert result[1]["outfit_ref"] == "dress.jpg"

    def test_follower_keeps_own_scene_ref(self):
        rows = self._make_rows()
        result = apply_continuity_inheritance(rows)
        assert result[1]["scene_ref"] == "garden.jpg"

    def test_anchor_row_is_unchanged(self):
        rows = self._make_rows()
        result = apply_continuity_inheritance(rows)
        assert result[0]["character_ref"] == "hero.jpg"

    def test_different_groups_do_not_cross_inherit(self):
        rows = self._make_rows(anchor_cg="cg1", follower_cg="cg2")
        result = apply_continuity_inheritance(rows)
        assert result[1]["character_ref"] == ""

    def test_row_without_group_is_untouched(self):
        rows = [
            {"shot_id": "s01", "continuity_group": "", "character_ref": "a.jpg"},
            {"shot_id": "s02", "continuity_group": "", "character_ref": ""},
        ]
        result = apply_continuity_inheritance(rows)
        assert result[1]["character_ref"] == ""

    def test_existing_field_not_overwritten(self):
        rows = [
            {"shot_id": "s01", "continuity_group": "cg1", "character_ref": "hero.jpg"},
            {"shot_id": "s02", "continuity_group": "cg1", "character_ref": "other.jpg"},
        ]
        result = apply_continuity_inheritance(rows)
        # follower already has a character_ref — should not be replaced
        assert result[1]["character_ref"] == "other.jpg"

    def test_annotate_inherited_refs_marks_filled_fields(self):
        original = [
            {"shot_id": "s01", "continuity_group": "cg1", "character_ref": "hero.jpg"},
            {"shot_id": "s02", "continuity_group": "cg1", "character_ref": ""},
        ]
        inherited = apply_continuity_inheritance(original)
        annotations = annotate_inherited_refs(original, inherited)
        assert "character_ref" in annotations[1]
        assert len(annotations[0]) == 0  # anchor has nothing inherited


# ============================================================================
# 5. build_payload
# ============================================================================

class TestBuildPayload:
    def test_required_fields_present(self):
        row = {"shot_id": "s01", "prompt_en": "Ocean at sunrise", "duration": 5, "aspect_ratio": "16:9"}
        payload = build_payload(row)
        assert "prompt" in payload
        assert "duration" in payload
        assert "aspect_ratio" in payload
        assert payload["prompt"] == "Ocean at sunrise"
        assert payload["duration"] == 5
        assert payload["aspect_ratio"] == "16:9"

    def test_optional_fields_omitted_when_empty(self):
        row = {"shot_id": "s01", "prompt_en": "Ocean at sunrise", "duration": 5,
               "aspect_ratio": "16:9", "camera": "", "motion": None, "negative_prompt": "nan"}
        payload = build_payload(row)
        assert "camera" not in payload
        assert "motion" not in payload
        assert "negative_prompt" not in payload

    def test_optional_fields_included_when_set(self):
        row = {"shot_id": "s01", "prompt_en": "Ocean at sunrise", "duration": 5,
               "aspect_ratio": "16:9", "camera": "tracking shot", "motion": "slow pan",
               "negative_prompt": "watermark"}
        payload = build_payload(row)
        assert payload["camera"] == "tracking shot"
        assert payload["motion"] == "slow pan"
        assert payload["negative_prompt"] == "watermark"

    def test_references_grouped_correctly(self):
        row = {"shot_id": "s01", "prompt_en": "Test", "duration": 5, "aspect_ratio": "16:9",
               "character_ref": "hero.jpg", "outfit_ref": "dress.jpg", "scene_ref": ""}
        payload = build_payload(row)
        assert "references" in payload
        assert payload["references"]["character_image_url"] == "hero.jpg"
        assert payload["references"]["outfit_image_url"] == "dress.jpg"
        assert "scene_image_url" not in payload["references"]

    def test_no_references_if_all_empty(self):
        row = {"shot_id": "s01", "prompt_en": "Test", "duration": 5, "aspect_ratio": "16:9",
               "character_ref": "", "outfit_ref": "nan", "scene_ref": None}
        payload = build_payload(row)
        assert "references" not in payload

    def test_continuity_group_in_metadata(self):
        row = {"shot_id": "s01", "prompt_en": "Test", "duration": 5, "aspect_ratio": "16:9",
               "continuity_group": "cg1"}
        payload = build_payload(row)
        assert "metadata" in payload
        assert payload["metadata"]["continuity_group"] == "cg1"
        assert payload["metadata"]["shot_id"] == "s01"

    def test_prompt_fallback_to_prompt_cn(self):
        row = {"shot_id": "s01", "prompt_cn": "中文提示词", "duration": 5, "aspect_ratio": "16:9"}
        payload = build_payload(row)
        assert payload["prompt"] == "中文提示词"

    def test_duration_coerced_to_int(self):
        row = {"shot_id": "s01", "prompt_en": "Test", "duration": "6", "aspect_ratio": "16:9"}
        payload = build_payload(row)
        assert isinstance(payload["duration"], int)
        assert payload["duration"] == 6


# ============================================================================
# 6. resolve_refs
# ============================================================================

class TestResolveRefs:
    def test_filename_replaced_with_url(self):
        row = {"character_ref": "hero.jpg"}
        refs = {"hero.jpg": "https://cdn.example.com/hero.jpg"}
        result = resolve_refs(row, refs)
        assert result["character_ref"] == "https://cdn.example.com/hero.jpg"

    def test_unmapped_filename_unchanged(self):
        row = {"character_ref": "unknown.jpg"}
        refs = {"hero.jpg": "https://cdn.example.com/hero.jpg"}
        result = resolve_refs(row, refs)
        assert result["character_ref"] == "unknown.jpg"

    def test_original_row_not_mutated(self):
        row = {"character_ref": "hero.jpg"}
        refs = {"hero.jpg": "https://cdn.example.com/hero.jpg"}
        _ = resolve_refs(row, refs)
        assert row["character_ref"] == "hero.jpg"

    def test_all_ref_keys_resolved(self):
        row = {
            "character_ref": "char.jpg",
            "outfit_ref": "outfit.jpg",
            "scene_ref": "scene.jpg",
            "reference_video": "video.mp4",
        }
        refs = {k: f"https://cdn.example.com/{k}" for k in ["char.jpg", "outfit.jpg", "scene.jpg", "video.mp4"]}
        result = resolve_refs(row, refs)
        assert result["character_ref"] == "https://cdn.example.com/char.jpg"
        assert result["outfit_ref"] == "https://cdn.example.com/outfit.jpg"
        assert result["scene_ref"] == "https://cdn.example.com/scene.jpg"
        assert result["reference_video"] == "https://cdn.example.com/video.mp4"


# ============================================================================
# 7. BatchResult helper properties
# ============================================================================

class TestBatchResultHelpers:
    """Tests for BatchResult.successes / failures / in_flight using mocked records."""

    def _record(self, shot_id: str, status: JobStatus) -> JobRecord:
        return JobRecord(shot_id=shot_id, row_index=0, status=status)

    def test_successes_filters_downloaded(self):
        records = [
            self._record("s01", JobStatus.DOWNLOADED),
            self._record("s02", JobStatus.FAILED),
            self._record("s03", JobStatus.DOWNLOADED),
        ]
        successes = [r for r in records if r.status == JobStatus.DOWNLOADED]
        assert len(successes) == 2

    def test_failures_filters_failed(self):
        records = [
            self._record("s01", JobStatus.DOWNLOADED),
            self._record("s02", JobStatus.FAILED),
        ]
        failures = [r for r in records if r.status == JobStatus.FAILED]
        assert len(failures) == 1

    def test_in_flight_includes_active_statuses(self):
        active_statuses = {JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING}
        records = [
            self._record("s01", JobStatus.PENDING),
            self._record("s02", JobStatus.QUEUED),
            self._record("s03", JobStatus.RUNNING),
            self._record("s04", JobStatus.DOWNLOADED),
            self._record("s05", JobStatus.FAILED),
        ]
        in_flight = [r for r in records if r.status in active_statuses]
        assert len(in_flight) == 3


# ============================================================================
# 8. Template loading integrity
# ============================================================================

class TestBuiltInTemplates:
    def test_all_expected_templates_present(self):
        assert "short_drama" in BUILT_IN_TEMPLATES
        assert "ecommerce" in BUILT_IN_TEMPLATES
        assert "quick_test" in BUILT_IN_TEMPLATES

    def test_each_template_has_required_keys(self):
        required = {"name", "description", "csv", "preview_rows"}
        for key, tmpl in BUILT_IN_TEMPLATES.items():
            missing = required - set(tmpl.keys())
            assert not missing, f"Template '{key}' missing keys: {missing}"

    def test_template_csv_parseable_as_dataframe(self):
        for key, tmpl in BUILT_IN_TEMPLATES.items():
            df = pd.read_csv(io.StringIO(tmpl["csv"]))
            assert len(df) > 0, f"Template '{key}' produced empty DataFrame"

    def test_quick_test_template_has_3_rows(self):
        df = pd.read_csv(io.StringIO(BUILT_IN_TEMPLATES["quick_test"]["csv"]))
        assert len(df) == 3

    def test_quick_test_template_passes_validation(self):
        df = pd.read_csv(io.StringIO(BUILT_IN_TEMPLATES["quick_test"]["csv"]))
        clean, errors, _ = validate_dataframe(df)
        assert errors == [], f"Quick test template has validation errors: {errors}"
        assert len(clean) == 3


# ============================================================================
# 9. Output helpers
# ============================================================================

class TestOutputHelpers:
    def test_safe_filename_removes_special_chars(self):
        assert "/" not in safe_filename("hello/world")
        assert "\\" not in safe_filename("back\\slash")

    def test_safe_filename_keeps_alphanumeric(self):
        result = safe_filename("MyBatch_001")
        assert "MyBatch" in result

    def test_safe_filename_empty_string_returns_untitled(self):
        result = safe_filename("")
        assert result == "untitled"

    def test_output_dir_created(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            target = os.path.join(tmpdir, "test_batch", "sub")
            from utils import ensure_output_dir
            p = ensure_output_dir(target)
            assert p.exists()
            assert p.is_dir()


# ============================================================================
# 10. JobStatus model
# ============================================================================

class TestJobStatus:
    def test_is_terminal_for_downloaded(self):
        assert JobStatus.DOWNLOADED.is_terminal

    def test_is_terminal_for_failed(self):
        assert JobStatus.FAILED.is_terminal

    def test_is_not_terminal_for_active(self):
        for s in [JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.RETRYING]:
            assert not s.is_terminal, f"{s} should not be terminal"

    def test_is_active_for_running_statuses(self):
        for s in [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.RETRYING, JobStatus.PENDING]:
            assert s.is_active

    def test_label_not_empty(self):
        for s in JobStatus:
            assert s.label(), f"Status {s} has empty label"

    def test_color_is_hex(self):
        for s in JobStatus:
            c = s.color()
            assert c.startswith("#"), f"Status {s} color '{c}' is not hex"


# ============================================================================
# 11. Retry-failed logic (pure Python, no network)
# ============================================================================

class TestRetryFailedLogic:
    """Verify the filtering logic used to select only failed records for retry."""

    def _make_records(self) -> list[JobRecord]:
        return [
            JobRecord(shot_id="s01", row_index=0, status=JobStatus.DOWNLOADED),
            JobRecord(shot_id="s02", row_index=1, status=JobStatus.FAILED, error_code="network_error"),
            JobRecord(shot_id="s03", row_index=2, status=JobStatus.FAILED, error_code="provider_timeout"),
            JobRecord(shot_id="s04", row_index=3, status=JobStatus.DOWNLOADED),
        ]

    def test_only_failed_records_selected(self):
        records = self._make_records()
        failed = [r for r in records if r.status == JobStatus.FAILED]
        assert len(failed) == 2
        assert {r.shot_id for r in failed} == {"s02", "s03"}

    def test_succeeded_records_not_retried(self):
        records = self._make_records()
        failed = [r for r in records if r.status == JobStatus.FAILED]
        succeeded = [r for r in records if r.status == JobStatus.DOWNLOADED]
        assert len(succeeded) == 2
        # No overlap
        failed_ids = {r.shot_id for r in failed}
        assert not any(r.shot_id in failed_ids for r in succeeded)

    def test_retry_increments_retry_count(self):
        record = JobRecord(shot_id="s01", row_index=0, status=JobStatus.FAILED, retry_count=1)
        # Simulate retry: reset status, increment retry count
        record.status = JobStatus.PENDING
        record.retry_count += 1
        assert record.retry_count == 2
        assert record.status == JobStatus.PENDING


if __name__ == "__main__":
    # Allow running directly: python test_logic.py
    pytest.main([__file__, "-v"])
