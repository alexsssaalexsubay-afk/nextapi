"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Button,
  StatusBadge,
  type JobStatus,
} from "@nextapi/ui";
import { apiFetch } from "@/lib/api";
import { TodoBanner } from "@/components/todo-banner";

type AdminJob = {
  id: string;
  org_id: string;
  provider: string;
  status: JobStatus;
  cost_credits: number;
  created_at: string;
};

const STATUSES: Array<JobStatus | "all"> = [
  "all",
  "queued",
  "running",
  "succeeded",
  "failed",
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = () => {
    apiFetch<{ data: AdminJob[] }>("/v1/internal/admin/jobs")
      .then((r) => setJobs(r.data ?? []))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () => (filter === "all" ? jobs : jobs.filter((j) => j.status === filter)),
    [jobs, filter],
  );

  async function killJob(id: string) {
    setCancelling(id);
    try {
      await apiFetch(`/v1/internal/admin/jobs/${id}/cancel`, { method: "POST" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="mt-1 text-sm text-zinc-400">
          All jobs across tenants. Use responsibly — killing a job is irreversible.
        </p>
      </div>

      {(jobs.length === 0 || error) && (
        <TodoBanner
          endpoint="GET /v1/internal/admin/jobs"
          note={error ?? "Renders empty until data is returned."}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={
              "rounded-md border px-3 py-1 text-xs font-medium transition-colors " +
              (filter === s
                ? "border-red-700 bg-red-950/40 text-red-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800")
            }
          >
            {s}
          </button>
        ))}
      </div>

      <Table>
        <THead>
          <TR>
            <TH>ID</TH>
            <TH>Org</TH>
            <TH>Provider</TH>
            <TH>Status</TH>
            <TH className="text-right">Cost</TH>
            <TH>Created</TH>
            <TH className="text-right">Action</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-zinc-500">
                No jobs to display.
              </TD>
            </TR>
          ) : (
            filtered.map((j) => (
              <TR key={j.id}>
                <TD className="font-mono text-xs text-zinc-300">{j.id}</TD>
                <TD className="text-zinc-400">{j.org_id}</TD>
                <TD className="text-zinc-400">{j.provider}</TD>
                <TD>
                  <StatusBadge status={j.status} />
                </TD>
                <TD className="text-right tabular-nums">{(j.cost_credits ?? 0).toLocaleString()}</TD>
                <TD className="text-zinc-400">
                  {new Date(j.created_at).toLocaleString()}
                </TD>
                <TD className="text-right">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={
                      cancelling === j.id ||
                      j.status === "succeeded" ||
                      j.status === "failed"
                    }
                    onClick={() => killJob(j.id)}
                  >
                    {cancelling === j.id ? "Killing…" : "Kill job"}
                  </Button>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
