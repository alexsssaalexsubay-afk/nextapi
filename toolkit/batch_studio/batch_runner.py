"""Batch execution engine.

Given a validated DataFrame of shots, submits one job per row, polls until
terminal, downloads the completed video, and writes a result manifest.

Concurrency is bounded by ``asyncio.Semaphore``; per-row failures are
captured in the JobRecord and never crash the batch.  The runner is
re-entrant: call ``run()`` multiple times — each call creates a fresh
timestamped batch directory and returns a ``BatchResult``.

Retry flow:
  Pass ``only_failed_records`` from a previous ``BatchResult.failures``
  to re-run only the failed shots against the same (now-updated) DataFrame.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Optional

import pandas as pd

from api_client import ClientConfig, NextAPIClient, NextAPIError
from schema import JobRecord, JobStatus
from utils import build_payload, resolve_refs


log = logging.getLogger("nextapi.runner")

ProgressCallback = Callable[[JobRecord], Awaitable[None]]

# Hard per-shot deadline. Raise if you have very long (>20 min) shot queues.
MAX_POLL_MINUTES = 15


@dataclass(frozen=True)
class RunnerConfig:
    base_url: str
    api_key: str
    max_concurrency: int = 5
    polling_interval_seconds: float = 4.0
    request_timeout_seconds: float = 30.0
    output_dir: str = "./output"


@dataclass
class BatchResult:
    job_records: list[JobRecord]
    output_dir: str
    started_at: float
    finished_at: float
    # Human-readable label for the UI (e.g. "Quick Test" or "Full Batch").
    label: str = "Batch"

    @property
    def successes(self) -> list[JobRecord]:
        return [r for r in self.job_records if r.status == JobStatus.DOWNLOADED]

    @property
    def failures(self) -> list[JobRecord]:
        return [r for r in self.job_records if r.status == JobStatus.FAILED]

    @property
    def in_flight(self) -> list[JobRecord]:
        return [
            r for r in self.job_records
            if r.status in {JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING}
        ]

    @property
    def elapsed_seconds(self) -> float:
        return self.finished_at - self.started_at

    def to_dataframe(self) -> pd.DataFrame:
        rows = []
        for r in self.job_records:
            d = r.model_dump()
            d["status_label"] = r.status.label()
            d["inherited_fields"] = ", ".join(sorted(r.inherited_fields)) or "—"
            rows.append(d)
        return pd.DataFrame(rows)

    def failure_summary(self) -> str:
        """One-line summary of failures for the UI. Empty string if none."""
        if not self.failures:
            return ""
        by_code: dict[str, int] = {}
        for r in self.failures:
            code = r.error_code or "unknown"
            by_code[code] = by_code.get(code, 0) + 1
        parts = [f"{count}× {code}" for code, count in sorted(by_code.items())]
        return "Failures: " + " · ".join(parts)


class BatchRunner:
    """Run a batch end-to-end. Re-usable across calls."""

    def __init__(self, cfg: RunnerConfig, refs: Optional[dict[str, str]] = None):
        self.cfg = cfg
        self.refs = refs or {}

    async def run(
        self,
        df: pd.DataFrame,
        progress_cb: Optional[ProgressCallback] = None,
        only_failed_records: Optional[list[JobRecord]] = None,
        label: str = "Batch",
    ) -> BatchResult:
        started = time.time()
        batch_dir = Path(self.cfg.output_dir) / time.strftime("batch_%Y%m%d_%H%M%S")
        batch_dir.mkdir(parents=True, exist_ok=True)

        # In retry mode, filter the df to only the previously-failed rows.
        if only_failed_records is not None:
            failed_ids = {r.shot_id for r in only_failed_records}
            run_df = df[df["shot_id"].isin(failed_ids)].reset_index(drop=True)
            label = "Retry"
        else:
            run_df = df

        records = [
            JobRecord(shot_id=str(row["shot_id"]), row_index=int(i))
            for i, row in run_df.iterrows()
        ]

        # Attach inherited_fields metadata from the dataframe if present.
        if "_inherited_fields" in run_df.columns:
            for rec, (_, row) in zip(records, run_df.iterrows()):
                raw = row.get("_inherited_fields", "")
                if isinstance(raw, str) and raw:
                    rec.inherited_fields = [f.strip() for f in raw.split(",") if f.strip()]

        semaphore = asyncio.Semaphore(self.cfg.max_concurrency)
        client_cfg = ClientConfig(
            base_url=self.cfg.base_url,
            api_key=self.cfg.api_key,
            request_timeout_seconds=self.cfg.request_timeout_seconds,
        )

        async with NextAPIClient(client_cfg) as client:
            tasks = [
                self._run_one(client, run_df.iloc[i], records[i], batch_dir, semaphore, progress_cb)
                for i in range(len(records))
            ]
            await asyncio.gather(*tasks, return_exceptions=False)

        result_csv = batch_dir / "result_manifest.csv"
        pd.DataFrame([r.model_dump() for r in records]).to_csv(result_csv, index=False)
        log.info("%s finished — %d succeeded, %d failed. Manifest: %s",
                 label, len([r for r in records if r.status == JobStatus.DOWNLOADED]),
                 len([r for r in records if r.status == JobStatus.FAILED]), result_csv)

        return BatchResult(
            job_records=records,
            output_dir=str(batch_dir),
            started_at=started,
            finished_at=time.time(),
            label=label,
        )

    async def _run_one(
        self,
        client: NextAPIClient,
        row: pd.Series,
        record: JobRecord,
        batch_dir: Path,
        semaphore: asyncio.Semaphore,
        progress_cb: Optional[ProgressCallback],
    ) -> None:
        async with semaphore:
            try:
                resolved = resolve_refs(row.to_dict(), self.refs)
                payload = build_payload(resolved)
                record.attempts += 1

                resp = await client.submit_generation(payload)
                record.job_id = str(resp.get("id", ""))
                record.estimated_credits = resp.get("estimated_credits")
                try:
                    record.status = JobStatus(resp.get("status") or "queued")
                except ValueError:
                    record.status = JobStatus.QUEUED
                await _notify(progress_cb, record)

                if not record.job_id:
                    raise NextAPIError("Server did not return a job ID. Check your API key and base URL.", body=resp)

                terminal = await self._poll(client, record, semaphore, progress_cb)
                terminal_status = str(terminal.get("status", ""))

                if terminal_status != "succeeded":
                    record.status = JobStatus.FAILED
                    record.error_code = terminal.get("error_code") or "job_failed"
                    msg = terminal.get("error_message") or ""
                    record.error_message = msg or _error_hint(record.error_code)
                    await _notify(progress_cb, record)
                    return

                video_url = str(terminal.get("video_url") or "")
                record.output_url = video_url
                if video_url:
                    dest = batch_dir / f"{record.shot_id}.mp4"
                    await client.download(video_url, str(dest))
                    record.local_file_path = str(dest)
                    record.status = JobStatus.DOWNLOADED
                else:
                    record.status = JobStatus.FAILED
                    record.error_code = "no_video_url"
                    record.error_message = (
                        "The API reported success but did not return a video URL. "
                        "This is a transient provider issue — retry this shot."
                    )

                await _notify(progress_cb, record)

            except NextAPIError as exc:
                record.status = JobStatus.FAILED
                record.error_code = exc.code or (f"http_{exc.status}" if exc.status else "api_error")
                record.error_message = str(exc) or _error_hint(record.error_code)
                log.error("shot %s failed: %s", record.shot_id, exc)
                await _notify(progress_cb, record)
            except Exception as exc:
                record.status = JobStatus.FAILED
                record.error_code = "internal_error"
                record.error_message = repr(exc)
                log.exception("shot %s raised an unexpected exception", record.shot_id)
                await _notify(progress_cb, record)

    async def _poll(
        self,
        client: NextAPIClient,
        record: JobRecord,
        _semaphore: asyncio.Semaphore,  # kept for signature consistency
        progress_cb: Optional[ProgressCallback],
    ) -> dict:
        assert record.job_id is not None
        deadline = time.time() + MAX_POLL_MINUTES * 60
        prev_status: Optional[str] = None

        while time.time() < deadline:
            data = await client.get_job(record.job_id)
            status = str(data.get("status", ""))
            if status != prev_status:
                try:
                    record.status = JobStatus(status)
                except ValueError:
                    pass
                prev_status = status
                await _notify(progress_cb, record)

            if status in {"succeeded", "failed"}:
                return data
            await asyncio.sleep(self.cfg.polling_interval_seconds)

        raise NextAPIError(
            f"Shot '{record.shot_id}' did not finish within {MAX_POLL_MINUTES} minutes. "
            "The provider queue may be congested — use Retry Failed to re-attempt."
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _notify(cb: Optional[ProgressCallback], record: JobRecord) -> None:
    if cb is not None:
        try:
            await cb(record)
        except Exception:
            log.exception("progress callback raised")


def _error_hint(code: Optional[str]) -> str:
    """Return a short operator-friendly hint for common error codes."""
    hints: dict[str, str] = {
        "http_401": "Invalid or expired API key. Re-issue a key in the NextAPI dashboard.",
        "http_402": "Insufficient credits. Top up in the NextAPI dashboard → Billing.",
        "http_429": "Rate limit hit. Lower max concurrency or raise the key's rate limit.",
        "http_400": "Rejected request — usually a bad prompt or unsupported field value.",
        "content_policy.pre": "Prompt was blocked by content moderation. Soften the wording.",
        "no_video_url": "Provider returned success with no URL — transient issue. Retry.",
        "timeout": f"Job did not finish within {MAX_POLL_MINUTES} minutes. Retry when queue clears.",
    }
    return hints.get(code or "", "Unexpected error — see logs for details.")


def configure_logging() -> None:
    level = os.getenv("BATCH_STUDIO_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
    )
