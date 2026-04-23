"""NextAPI Batch Studio — Streamlit operator console.

Run:
    cd toolkit/batch_studio
    pip install -r requirements.txt
    streamlit run app.py
"""

from __future__ import annotations

import asyncio
import io
import os
import threading
import time
from pathlib import Path
from typing import Optional

import pandas as pd
import streamlit as st

from batch_runner import BatchResult, BatchRunner, RunnerConfig, configure_logging
from schema import JobRecord, JobStatus, validate_dataframe
from utils import (
    BUILT_IN_TEMPLATES,
    SAMPLE_PROMPT_TEMPLATES,
    annotate_inherited_refs,
    apply_continuity_inheritance,
    continuity_summary,
    ensure_output_dir,
    generate_sample_manifest,
    safe_filename,
)


configure_logging()
st.set_page_config(
    page_title="NextAPI Batch Studio",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS ──────────────────────────────────────────────────────────────
st.markdown(
    """
<style>
/* Status badge colours */
.status-queued    { color: #60a5fa; font-weight: 600; }
.status-running   { color: #f59e0b; font-weight: 600; }
.status-retrying  { color: #a78bfa; font-weight: 600; }
.status-downloaded{ color: #10b981; font-weight: 600; }
.status-failed    { color: #f87171; font-weight: 600; }
.status-pending   { color: #94a3b8; }

/* Progress bar accent */
div[data-testid="stProgressBar"] > div > div { background-color: #6366f1; }

/* Metric delta colour reset */
[data-testid="stMetricDelta"] { font-size: 0.75rem; }

/* Template card hover */
div[data-testid="stExpander"] { border-radius: 8px; }
</style>
""",
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Session state initialisation
# ---------------------------------------------------------------------------

def _def(key: str, value):
    if key not in st.session_state:
        st.session_state[key] = value


_def("manifest_df", None)
_def("raw_rows", None)
_def("manifest_errors", [])
_def("manifest_warnings", [])
_def("last_result", None)
_def("history", [])
_def("live_records", [])
_def("running", False)
_def("run_mode", "full")
_def("batch_error", None)
_def("batch_started_at", 0.0)
_def("custom_templates", {})   # user-saved templates keyed by name


# ---------------------------------------------------------------------------
# ETA helper
# ---------------------------------------------------------------------------

def _compute_eta(records: list[JobRecord], started_at: float) -> Optional[str]:
    """Returns a human-readable ETA string, or None if not enough data."""
    done = sum(1 for r in records if r.status.is_terminal)
    total = len(records)
    if done == 0 or total == 0:
        return None
    elapsed = time.time() - started_at
    rate = done / elapsed  # shots/s
    remaining = total - done
    if remaining <= 0:
        return "Almost done"
    eta_s = remaining / rate
    if eta_s < 60:
        return f"~{int(eta_s)}s remaining"
    return f"~{int(eta_s / 60)}m {int(eta_s % 60)}s remaining"


# ---------------------------------------------------------------------------
# Sidebar — Settings & Reference Assets
# ---------------------------------------------------------------------------

with st.sidebar:
    st.markdown("## 🎬 NextAPI Batch Studio")
    st.caption("Professional video batch generation console")
    st.divider()

    st.markdown("### Connection")
    base_url = st.text_input(
        "API Endpoint",
        value=os.getenv("NEXTAPI_BASE_URL", "https://api.nextapi.top"),
        help="Do not change unless you are using a staging or self-hosted endpoint.",
        placeholder="https://api.nextapi.top",
    )
    api_key = st.text_input(
        "API Key  (sk_live_…)",
        type="password",
        value=os.getenv("NEXTAPI_KEY", ""),
        help="Stored in browser session memory only — never written to disk.",
        placeholder="sk_live_xxxxxxxxxxxxxxxx",
    )
    if not api_key:
        st.warning("Paste your API key to enable batch execution.", icon="🔑")
    else:
        st.success("API key set  ✓", icon="✅")

    st.divider()
    st.markdown("### Performance")
    max_concurrency = st.slider(
        "Parallel shots",
        min_value=1, max_value=20, value=5,
        help="Simultaneous renders. Start at 5; raise only if your RPM allows.",
    )
    polling_interval = st.slider(
        "Polling interval (s)", min_value=1, max_value=30, value=4,
    )
    request_timeout = st.slider(
        "Request timeout (s)", min_value=5, max_value=120, value=30,
    )
    output_dir = st.text_input(
        "Output folder",
        value=os.getenv("BATCH_OUTPUT_DIR", "./output"),
        help="Each batch creates a timestamped subfolder.",
    )

    st.divider()
    st.markdown("### Reference Images")
    st.caption(
        "File names must match `character_ref`, `outfit_ref`, `scene_ref` values in your CSV."
    )
    char_files = st.file_uploader(
        "Character reference images",
        type=["png", "jpg", "jpeg", "webp"],
        accept_multiple_files=True, key="char_refs",
    )
    outfit_files = st.file_uploader(
        "Outfit reference images",
        type=["png", "jpg", "jpeg", "webp"],
        accept_multiple_files=True, key="outfit_refs",
    )
    scene_files = st.file_uploader(
        "Scene / background reference images",
        type=["png", "jpg", "jpeg", "webp"],
        accept_multiple_files=True, key="scene_refs",
    )
    video_files = st.file_uploader(
        "Reference videos (optional)",
        type=["mp4", "mov", "webm"],
        accept_multiple_files=True, key="video_refs",
    )


# ---------------------------------------------------------------------------
# Persist uploaded files to staging dir
# ---------------------------------------------------------------------------

def _persist_uploads(uploads, kind: str, staging: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not uploads:
        return out
    sub = staging / kind
    sub.mkdir(parents=True, exist_ok=True)
    for f in uploads:
        name = safe_filename(f.name)
        p = sub / name
        p.write_bytes(f.getbuffer())
        out[name] = str(p)
        out[Path(name).stem] = str(p)
    return out


staging_dir = ensure_output_dir(Path(output_dir).expanduser() / ".staging")
refs: dict[str, str] = {}
refs.update(_persist_uploads(char_files, "character", staging_dir))
refs.update(_persist_uploads(outfit_files, "outfit", staging_dir))
refs.update(_persist_uploads(scene_files, "scene", staging_dir))
refs.update(_persist_uploads(video_files, "video", staging_dir))


# ---------------------------------------------------------------------------
# Main panel — Tabs
# ---------------------------------------------------------------------------

st.title("NextAPI Batch Studio")
tab_batch, tab_templates, tab_prompts, tab_history = st.tabs(
    ["📋 Batch Run", "📁 Templates", "✍️ Prompt Generator", "📂 History"]
)


# ===========================================================================
# LIVE PROGRESS SECTION  (shared component rendered from both the batch tab
# and the thread refresh loop)
# ===========================================================================

def _render_live_progress(
    records: list[JobRecord],
    started_at: float,
    finished: bool = False,
    result: Optional[BatchResult] = None,
    container=None,
):
    """Render progress bar + per-job table.

    If ``container`` is an ``st.empty()`` placeholder, this replaces its
    content on each refresh. Otherwise writes directly to the current context.
    """
    ctx = container if container else st

    total = len(records)
    if total == 0:
        return

    done     = sum(1 for r in records if r.status == JobStatus.DOWNLOADED)
    failed   = sum(1 for r in records if r.status == JobStatus.FAILED)
    active   = sum(1 for r in records if r.status.is_active)
    terminal = done + failed
    pct      = terminal / total

    with ctx.container():
        # ── Header metrics ──────────────────────────────────────────────
        m1, m2, m3, m4, m5 = st.columns(5)
        m1.metric("✅ Done", done)
        m2.metric("❌ Failed", failed)
        m3.metric("⏳ In-flight", active)
        m4.metric("📊 Total", total)

        eta = _compute_eta(records, started_at)
        if finished and result:
            m5.metric("⏱ Elapsed", f"{result.elapsed_seconds:.0f}s")
        elif eta:
            m5.metric("⏱ ETA", eta)
        else:
            m5.metric("⏱ ETA", "Calculating…")

        # ── Progress bar ─────────────────────────────────────────────────
        label_text = (
            f"{'Completed' if finished else 'Running'}:  "
            f"**{terminal} / {total}**  "
            f"{'✅' if pct == 1.0 else ''}"
        )
        st.markdown(label_text)
        st.progress(pct)

        # ── Per-job table ─────────────────────────────────────────────────
        rows_display = []
        for r in records:
            status_icon = {
                JobStatus.PENDING:    "⏳",
                JobStatus.QUEUED:     "📤",
                JobStatus.RUNNING:    "🎬",
                JobStatus.RETRYING:   "🔄",
                JobStatus.SUCCEEDED:  "✅",
                JobStatus.FAILED:     "❌",
                JobStatus.DOWNLOADED: "💾",
            }.get(r.status, "?")

            rows_display.append(
                {
                    "Shot ID":    r.shot_id,
                    "Status":     f"{status_icon} {r.status.value.capitalize()}",
                    "Retries":    r.retry_count if r.retry_count > 0 else "—",
                    "Job ID":     (r.job_id[:12] + "…") if r.job_id else "—",
                    "Credits":    r.estimated_credits or "—",
                    "File":       Path(r.local_file_path).name if r.local_file_path else "—",
                    "Error":      r.error_code or "—",
                }
            )

        display_df = pd.DataFrame(rows_display)

        # Colour-code rows by status.
        def _row_style(row):
            status_raw = str(row["Status"]).split(" ", 1)[-1].lower()
            if "failed" in status_raw:
                return ["background-color: #fef2f2; color: #b91c1c"] * len(row)
            if "downloaded" in status_raw or "succeeded" in status_raw:
                return ["background-color: #f0fdf4; color: #166534"] * len(row)
            if "retrying" in status_raw:
                return ["background-color: #f5f3ff; color: #6d28d9"] * len(row)
            if "running" in status_raw:
                return ["background-color: #fffbeb; color: #92400e"] * len(row)
            return [""] * len(row)

        styled = display_df.style.apply(_row_style, axis=1)
        st.dataframe(
            styled,
            use_container_width=True,
            hide_index=True,
            height=min(600, 50 + total * 36),
        )

        if failed > 0 and finished:
            st.warning(
                f"**{failed} shot(s) failed.** Click **🔁 Retry Failed** to re-run only those shots."
            )


# ===========================================================================
# TAB 1: BATCH RUN
# ===========================================================================

with tab_batch:

    # ── Onboarding card ──────────────────────────────────────────────────────
    if st.session_state["manifest_df"] is None:
        with st.container(border=True):
            st.markdown("### Getting started")
            st.markdown(
                """
**Step 1 →** Paste your API key in the sidebar under **Connection**.

**Step 2 →** Upload `shot_manifest.csv` below — or use the **📁 Templates** tab to load one with a single click.

**Step 3 →** *(Optional)* Upload reference images in the sidebar.

**Step 4 →** Click **Validate CSV**, then **⚡ Quick Test (3 shots)** before the full run.
                """
            )
            sample_path = Path(__file__).parent / "sample_data" / "shot_manifest.csv"
            if sample_path.exists():
                st.download_button(
                    "⬇ Download sample_manifest.csv",
                    data=sample_path.read_bytes(),
                    file_name="shot_manifest.csv",
                    mime="text/csv",
                )
        st.divider()

    # ── Manifest Upload ──────────────────────────────────────────────────────
    st.markdown("#### 1 · Upload your shot manifest")
    manifest_upload = st.file_uploader(
        "shot_manifest.csv",
        type=["csv"], key="manifest_upload",
        help="Required: shot_id, prompt_en, duration, aspect_ratio.",
        label_visibility="collapsed",
    )

    if manifest_upload is not None:
        try:
            df_raw = pd.read_csv(manifest_upload)
            raw_rows = df_raw.to_dict("records")
            inherited_rows = apply_continuity_inheritance(raw_rows)
            inheritance_map = annotate_inherited_refs(raw_rows, inherited_rows)
            df = pd.DataFrame(inherited_rows)
            df["_inherited_fields"] = [",".join(sorted(s)) for s in inheritance_map]
            st.session_state["manifest_df"] = df
            st.session_state["raw_rows"] = raw_rows
            st.session_state["manifest_errors"] = []
            st.session_state["manifest_warnings"] = []
            st.session_state["live_records"] = []
        except Exception as exc:
            st.error(f"Could not read the CSV file: {exc}")

    if st.session_state["manifest_df"] is not None:
        df = st.session_state["manifest_df"]
        n_total = len(df)
        cg_info = continuity_summary(df.to_dict("records"))

        col_a, col_b, col_c, col_d = st.columns(4)
        col_a.metric("Shots", n_total)
        col_b.metric("Continuity groups", len(cg_info))
        col_c.metric("Ref images uploaded", len(refs) // 2)
        col_d.metric("Unique episodes", df["episode"].nunique() if "episode" in df.columns else "—")

        with st.expander("Preview manifest", expanded=n_total <= 20):
            display_df = df.drop(columns=["_inherited_fields"], errors="ignore").copy()
            if "continuity_group" in display_df.columns:
                def _style_inherited(row):
                    inherited = set(
                        str(df.at[row.name, "_inherited_fields"]).split(",")
                    ) if "_inherited_fields" in df.columns else set()
                    return [
                        "background-color: #e8f4fd; color: #1a6fa8;"
                        if col in inherited else ""
                        for col in display_df.columns
                    ]
                st.dataframe(
                    display_df.style.apply(_style_inherited, axis=1),
                    use_container_width=True,
                    height=min(400, 40 + n_total * 35),
                )
                st.caption("🔵 Highlighted cells were auto-filled from the continuity group anchor row.")
            else:
                st.dataframe(display_df, use_container_width=True)

        if len(cg_info) > 0:
            with st.expander(f"Continuity groups ({len(cg_info)})"):
                rows_s = [
                    {
                        "Group": g,
                        "Anchor shot": info["anchor_shot_id"],
                        "Shots": info["count"],
                        "Shared fields": ", ".join(sorted(info["fields_shared"])) or "—",
                    }
                    for g, info in sorted(cg_info.items())
                ]
                st.dataframe(pd.DataFrame(rows_s), use_container_width=True, hide_index=True)

        st.divider()
        st.markdown("#### 2 · Validate and run")
        col_v, col_qt, col_run, col_retry, col_export = st.columns([1, 1, 1, 1, 1])

        validate_clicked = col_v.button(
            "🔍 Validate CSV", use_container_width=True,
        )
        qt_clicked = col_qt.button(
            "⚡ Quick Test (3 shots)",
            disabled=st.session_state["running"] or not api_key,
            use_container_width=True, type="secondary",
        )
        start_clicked = col_run.button(
            "▶ Start Full Batch", type="primary",
            disabled=st.session_state["running"] or not api_key,
            use_container_width=True,
        )
        retry_clicked = col_retry.button(
            "🔁 Retry Failed",
            disabled=(
                st.session_state["running"]
                or st.session_state["last_result"] is None
                or len(st.session_state["last_result"].failures) == 0
            ),
            use_container_width=True,
        )
        export_clicked = col_export.button(
            "⬇ Export Results",
            disabled=st.session_state["last_result"] is None,
            use_container_width=True,
        )

        # ── Validate ──────────────────────────────────────────────────────────
        if validate_clicked:
            try:
                uploaded_ref_names = set(refs.keys())
                clean_df, errors, warnings = validate_dataframe(
                    df.drop(columns=["_inherited_fields"], errors="ignore"),
                    uploaded_ref_names=uploaded_ref_names,
                )
                clean_df["_inherited_fields"] = df["_inherited_fields"].iloc[:len(clean_df)].values
                st.session_state["manifest_df"] = clean_df
                st.session_state["manifest_errors"] = errors
                st.session_state["manifest_warnings"] = warnings
                if not errors and not warnings:
                    st.success(f"All {len(clean_df)} rows valid and ready to run. ✅")
                elif not errors:
                    st.warning(f"{len(clean_df)} rows valid with {len(warnings)} warning(s).")
                else:
                    st.error(
                        f"{len(errors)} row(s) dropped — {len(clean_df)} rows remain. "
                        "Fix errors in your CSV or proceed with the cleaned manifest."
                    )
            except ValueError as exc:
                st.error(str(exc))

        if st.session_state["manifest_errors"]:
            with st.expander(f"❌ Errors — {len(st.session_state['manifest_errors'])} row(s) dropped", expanded=True):
                err_df = pd.DataFrame(st.session_state["manifest_errors"])
                err_df.columns = ["Row #", "Shot ID", "Field", "What's wrong"]
                st.dataframe(err_df, use_container_width=True, hide_index=True)

        if st.session_state["manifest_warnings"]:
            with st.expander(f"⚠️ Warnings — {len(st.session_state['manifest_warnings'])} issue(s)"):
                warn_df = pd.DataFrame(st.session_state["manifest_warnings"])
                warn_df.columns = ["Row #", "Shot ID", "Field", "What to check"]
                st.dataframe(warn_df, use_container_width=True, hide_index=True)

        # ── Async runner (called inside background thread) ────────────────────
        async def _run_batch_async(
            run_df: pd.DataFrame,
            only_failed: Optional[list[JobRecord]],
            label: str,
        ) -> BatchResult:
            cfg = RunnerConfig(
                base_url=base_url,
                api_key=api_key,
                max_concurrency=max_concurrency,
                polling_interval_seconds=float(polling_interval),
                request_timeout_seconds=float(request_timeout),
                output_dir=output_dir,
            )
            runner = BatchRunner(cfg, refs=refs)
            live: list[JobRecord] = []
            st.session_state["live_records"] = live

            async def _on_progress(rec: JobRecord) -> None:
                idx = next((i for i, r in enumerate(live) if r.shot_id == rec.shot_id), None)
                if idx is None:
                    live.append(rec)
                else:
                    live[idx] = rec

            return await runner.run(
                df=run_df,
                progress_cb=_on_progress,
                only_failed_records=only_failed,
                label=label,
            )

        def _run_in_thread(
            run_df: pd.DataFrame,
            only_failed: Optional[list[JobRecord]],
            label: str,
        ) -> None:
            """Runs the batch on a background thread so Streamlit can refresh."""
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(
                    _run_batch_async(run_df, only_failed, label)
                )
                st.session_state["last_result"] = result
                st.session_state["history"].insert(0, result)
                st.session_state["batch_error"] = None
            except Exception as exc:
                st.session_state["batch_error"] = str(exc)
            finally:
                st.session_state["running"] = False

        def _trigger(
            run_df: pd.DataFrame,
            only_failed: Optional[list[JobRecord]],
            label: str,
        ) -> None:
            st.session_state["running"] = True
            st.session_state["live_records"] = []
            st.session_state["batch_error"] = None
            st.session_state["batch_started_at"] = time.time()
            t = threading.Thread(
                target=_run_in_thread, args=(run_df, only_failed, label), daemon=True
            )
            t.start()
            st.rerun()

        if start_clicked:
            _trigger(st.session_state["manifest_df"], None, "Full Batch")

        if qt_clicked:
            _trigger(st.session_state["manifest_df"].head(3).copy(), None, "Quick Test")

        if retry_clicked and st.session_state["last_result"] is not None:
            prev: BatchResult = st.session_state["last_result"]
            if prev.failures:
                _trigger(st.session_state["manifest_df"], prev.failures, "Retry")

        # ── Live progress refresh loop ────────────────────────────────────────
        if st.session_state["running"]:
            st.info(
                "⏳ Batch is running — **do not close or refresh this tab**.",
                icon="ℹ️",
            )

        # Show live table while running OR completed records after done.
        live = st.session_state["live_records"]
        result: Optional[BatchResult] = st.session_state["last_result"]
        show_records: list[JobRecord] = (
            list(live) if live else (result.job_records if result else [])
        )

        if show_records:
            st.divider()
            st.markdown("#### 3 · Live Progress")
            _render_live_progress(
                records=show_records,
                started_at=st.session_state["batch_started_at"],
                finished=not st.session_state["running"],
                result=result if not st.session_state["running"] else None,
            )

            if st.session_state["batch_error"]:
                st.error(f"Batch error: {st.session_state['batch_error']}")

        # While running, auto-refresh every second to pick up thread updates.
        if st.session_state["running"]:
            time.sleep(1)
            st.rerun()

        # ── Export ────────────────────────────────────────────────────────────
        if export_clicked and result is not None:
            out_csv = Path(result.output_dir) / "result_manifest.csv"
            if out_csv.exists():
                st.download_button(
                    "⬇ Download result_manifest.csv",
                    data=out_csv.read_bytes(),
                    file_name="result_manifest.csv",
                    mime="text/csv",
                )
            else:
                csv_bytes = result.to_dataframe().to_csv(index=False).encode()
                st.download_button(
                    "⬇ Download result_manifest.csv",
                    data=csv_bytes,
                    file_name="result_manifest.csv",
                    mime="text/csv",
                )

    else:
        pass


# ===========================================================================
# TAB 2: TEMPLATES
# ===========================================================================

with tab_templates:
    st.markdown("### Shot Manifest Templates")
    st.caption(
        "Load a ready-to-use manifest with one click. "
        "Preview it, then send it directly to the Batch tab — no CSV editing needed."
    )

    # ── Built-in templates ───────────────────────────────────────────────────
    st.markdown("#### Built-in Templates")

    built_in_items = list(BUILT_IN_TEMPLATES.items())
    t_cols = st.columns(len(built_in_items))

    for col, (key, tmpl) in zip(t_cols, built_in_items):
        with col:
            with st.container(border=True):
                st.markdown(f"**{tmpl['name']}**")
                st.caption(tmpl["description"])

                if st.button(f"Preview", key=f"preview_{key}", use_container_width=True):
                    st.session_state[f"show_preview_{key}"] = not st.session_state.get(
                        f"show_preview_{key}", False
                    )

                if st.button(
                    f"Load into Batch →",
                    key=f"load_{key}",
                    type="primary",
                    use_container_width=True,
                ):
                    try:
                        csv_text = tmpl["csv"]
                        df_raw = pd.read_csv(io.StringIO(csv_text))
                        raw_rows = df_raw.to_dict("records")
                        inherited_rows = apply_continuity_inheritance(raw_rows)
                        inheritance_map = annotate_inherited_refs(raw_rows, inherited_rows)
                        df = pd.DataFrame(inherited_rows)
                        df["_inherited_fields"] = [",".join(sorted(s)) for s in inheritance_map]
                        st.session_state["manifest_df"] = df
                        st.session_state["raw_rows"] = raw_rows
                        st.session_state["manifest_errors"] = []
                        st.session_state["manifest_warnings"] = []
                        st.session_state["live_records"] = []
                        st.success(
                            f"✅ Template **{tmpl['name']}** loaded — "
                            f"{len(df)} shots ready. Switch to the **📋 Batch Run** tab.",
                        )
                    except Exception as exc:
                        st.error(f"Failed to load template: {exc}")

    # Preview panels (shown below the cards, collapsible)
    st.divider()
    for key, tmpl in built_in_items:
        if st.session_state.get(f"show_preview_{key}"):
            with st.expander(f"Preview: {tmpl['name']}", expanded=True):
                try:
                    preview_df = pd.read_csv(io.StringIO(tmpl["csv"]))
                    n_rows = tmpl.get("preview_rows", len(preview_df))
                    st.markdown(f"**{len(preview_df)} shots total** — showing first {n_rows}:")
                    st.dataframe(
                        preview_df.head(n_rows),
                        use_container_width=True,
                        hide_index=True,
                    )
                    # Download button for the template CSV
                    st.download_button(
                        f"⬇ Download template CSV",
                        data=tmpl["csv"].encode(),
                        file_name=f"template_{key}.csv",
                        mime="text/csv",
                        key=f"dl_tmpl_{key}",
                    )
                except Exception as exc:
                    st.error(f"Preview error: {exc}")

    # ── User-saved custom templates ──────────────────────────────────────────
    st.markdown("#### My Custom Templates")
    custom = st.session_state["custom_templates"]

    if not custom:
        st.info(
            "No custom templates saved yet.  \n"
            "After uploading a manifest you're happy with, use **Save as template** below.",
            icon="💡",
        )
    else:
        for name, csv_text in list(custom.items()):
            with st.container(border=True):
                col_n, col_load, col_dl, col_del = st.columns([3, 1, 1, 1])
                col_n.markdown(f"📄 **{name}**")
                if col_load.button("Load", key=f"cload_{name}", use_container_width=True):
                    try:
                        df_raw = pd.read_csv(io.StringIO(csv_text))
                        raw_rows = df_raw.to_dict("records")
                        inherited_rows = apply_continuity_inheritance(raw_rows)
                        inheritance_map = annotate_inherited_refs(raw_rows, inherited_rows)
                        df = pd.DataFrame(inherited_rows)
                        df["_inherited_fields"] = [",".join(sorted(s)) for s in inheritance_map]
                        st.session_state["manifest_df"] = df
                        st.session_state["raw_rows"] = raw_rows
                        st.session_state["manifest_errors"] = []
                        st.session_state["manifest_warnings"] = []
                        st.success(f"Loaded '{name}' — switch to Batch tab.")
                    except Exception as exc:
                        st.error(str(exc))
                col_dl.download_button(
                    "⬇", data=csv_text.encode(), file_name=f"{name}.csv",
                    mime="text/csv", key=f"cdl_{name}", use_container_width=True,
                )
                if col_del.button("🗑", key=f"cdel_{name}", use_container_width=True):
                    del st.session_state["custom_templates"][name]
                    st.rerun()

    # Save current manifest as template
    if st.session_state["manifest_df"] is not None:
        st.divider()
        st.markdown("#### Save current manifest as a template")
        with st.form("save_template_form"):
            tmpl_name = st.text_input(
                "Template name",
                placeholder="e.g. ep02-rooftop-chase",
                help="A short memorable name. It will appear in My Custom Templates above.",
            )
            saved = st.form_submit_button("💾 Save template", type="secondary")
        if saved:
            if not tmpl_name.strip():
                st.warning("Please enter a name for the template.")
            else:
                cur_df = st.session_state["manifest_df"].drop(
                    columns=["_inherited_fields"], errors="ignore"
                )
                st.session_state["custom_templates"][tmpl_name.strip()] = (
                    cur_df.to_csv(index=False)
                )
                st.success(f"Template **'{tmpl_name}'** saved. It will appear above.")
                st.rerun()


# ===========================================================================
# TAB 3: PROMPT GENERATOR
# ===========================================================================

with tab_prompts:
    st.markdown("### Generate a sample shot manifest")
    st.caption(
        "Fill in your character name and scene, pick the shot types you want, "
        "and download a ready-to-use manifest CSV."
    )

    with st.form("prompt_pack_form"):
        col1, col2, col3 = st.columns(3)
        char_name = col1.text_input("Character name", placeholder="e.g. Lin Yue")
        scene_name = col2.text_input("Scene / location", placeholder="e.g. Morning Cafe")
        cg = col3.text_input("Continuity group", placeholder="e.g. ep01_cafe")

        st.markdown("**Select shot types to include:**")
        cols = st.columns(2)
        template_flags: list[bool] = []
        for i, tmpl in enumerate(SAMPLE_PROMPT_TEMPLATES):
            checked = cols[i % 2].checkbox(tmpl["label"], value=True, key=f"tmpl_{i}")
            template_flags.append(checked)

        submitted = st.form_submit_button("Generate manifest CSV", type="primary")

    if submitted:
        selected = [i for i, flag in enumerate(template_flags) if flag]
        if not selected:
            st.warning("Select at least one shot type.")
        else:
            rows = generate_sample_manifest(
                character_name=char_name, scene_name=scene_name,
                continuity_group=cg, template_indices=selected,
            )
            out_df = pd.DataFrame(rows)
            st.success(f"Generated {len(rows)} shots. Download and upload to the Batch tab.")
            st.dataframe(out_df, use_container_width=True, hide_index=True)
            fname = f"manifest_{(char_name or 'sample').replace(' ', '_')}.csv"
            col_dl, col_save = st.columns([2, 1])
            csv_bytes = out_df.to_csv(index=False).encode()
            col_dl.download_button(
                "⬇ Download this manifest", data=csv_bytes,
                file_name=fname, mime="text/csv",
            )
            if col_save.button("📋 Load into Batch tab →", type="primary"):
                try:
                    raw_rows = out_df.to_dict("records")
                    inherited_rows = apply_continuity_inheritance(raw_rows)
                    inheritance_map = annotate_inherited_refs(raw_rows, inherited_rows)
                    df_loaded = pd.DataFrame(inherited_rows)
                    df_loaded["_inherited_fields"] = [",".join(sorted(s)) for s in inheritance_map]
                    st.session_state["manifest_df"] = df_loaded
                    st.session_state["raw_rows"] = raw_rows
                    st.session_state["manifest_errors"] = []
                    st.session_state["manifest_warnings"] = []
                    st.success("Loaded into Batch tab.")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))

    st.divider()
    st.markdown("#### All available prompt templates")
    for tmpl in SAMPLE_PROMPT_TEMPLATES:
        with st.expander(f"**{tmpl['label']}**"):
            st.markdown(f"**Prompt:** _{tmpl['prompt_en']}_")
            c1, c2, c3, c4 = st.columns(4)
            c1.caption(f"Camera: {tmpl.get('camera', '—')}")
            c2.caption(f"Motion: {tmpl.get('motion', '—')}")
            c3.caption(f"Duration: {tmpl.get('duration', '—')}s")
            c4.caption(f"Aspect: {tmpl.get('aspect_ratio', '—')}")
            st.caption(f"Negative: {tmpl.get('negative_prompt', '—')}")


# ===========================================================================
# TAB 4: HISTORY
# ===========================================================================

with tab_history:
    st.markdown("### Run history")
    history: list[BatchResult] = st.session_state["history"]
    if not history:
        st.info("No batches run yet in this session. History is kept in memory only.")
    else:
        for i, r in enumerate(history):
            elapsed = f"{r.elapsed_seconds:.0f}s" if r.elapsed_seconds else "—"
            succ = len(r.successes)
            fail = len(r.failures)
            total = len(r.job_records)
            icon = "🟢" if not fail else ("🟡" if succ else "🔴")
            header = (
                f"{icon} **{r.label}** — {succ}/{total} succeeded · {elapsed} · "
                f"{time.strftime('%H:%M:%S', time.localtime(r.started_at))}"
            )
            with st.expander(header, expanded=(i == 0)):
                if r.failure_summary():
                    st.warning(r.failure_summary())
                st.caption(f"Output folder: `{r.output_dir}`")
                _render_live_progress(
                    records=r.job_records,
                    started_at=r.started_at,
                    finished=True,
                    result=r,
                )
                csv_bytes = r.to_dataframe().to_csv(index=False).encode()
                fname = (
                    f"result_{r.label.lower().replace(' ', '_')}_"
                    f"{time.strftime('%Y%m%d_%H%M%S', time.localtime(r.started_at))}.csv"
                )
                st.download_button(
                    "⬇ Download result CSV",
                    data=csv_bytes, file_name=fname, mime="text/csv",
                    key=f"hist_dl_{i}",
                )

        if st.button("Clear history"):
            st.session_state["history"] = []
            st.session_state["last_result"] = None
            st.rerun()
