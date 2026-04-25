"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, RefreshCcw, RotateCcw, Search, Square, Terminal } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { adminFetch } from "@/lib/admin-api"
import { cn } from "@/lib/utils"

type ApiJob = Record<string, unknown>
type RequestLog = Record<string, unknown>
type DeadLetterRow = Record<string, unknown>

const ACTIVE_STATUSES = ["queued", "submitting", "running", "retrying"] as const

function str(row: ApiJob, upper: string, lower: string): string {
  const value = row[upper] ?? row[lower]
  return typeof value === "string" ? value : ""
}

function num(row: ApiJob, upper: string, lower: string): number {
  const value = row[upper] ?? row[lower]
  return typeof value === "number" ? value : 0
}

function toStatus(status: string): JobStatus {
  if (status === "retrying") return "running"
  if (["queued", "submitting", "running", "succeeded", "failed"].includes(status)) {
    return status as JobStatus
  }
  return "queued"
}

function fmtDate(value: string): string {
  if (!value) return "-"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApiJob | null>(null)
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [deadLetters, setDeadLetters] = useState<DeadLetterRow[]>([])
  const [status, setStatus] = useState("failed")
  const [orgId, setOrgId] = useState("")
  const [queryId, setQueryId] = useState("")
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(() => jobs.find((j) => str(j, "ID", "id") === selectedId) ?? null, [jobs, selectedId])
  const selectedOrg = selected ? str(selected, "OrgID", "org_id") : ""

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: "80" })
      if (status !== "all") params.append("status", status)
      if (orgId.trim()) params.set("org_id", orgId.trim())
      const res = await adminFetch(`/jobs/search?${params.toString()}`) as { data?: ApiJob[] }
      const rows = res.data ?? []
      setJobs(rows)
      const nextId = queryId.trim() || (rows[0] ? str(rows[0], "ID", "id") : null)
      setSelectedId(nextId || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs")
    } finally {
      setLoading(false)
    }
  }, [orgId, queryId, status])

  const loadDetail = useCallback(async (jobId: string, jobOrgId?: string) => {
    setError(null)
    try {
      const [detailRes, logsRes] = await Promise.all([
        adminFetch(`/jobs/${jobId}/detail`) as Promise<ApiJob>,
        adminFetch(`/request-logs?job_id=${encodeURIComponent(jobId)}&limit=20`) as Promise<{ data?: RequestLog[] }>,
      ])
      setDetail(detailRes)
      setLogs(logsRes.data ?? [])
      if (jobOrgId) {
        const dlqRes = await adminFetch(`/dead-letter?org_id=${encodeURIComponent(jobOrgId)}&limit=20`) as { data?: DeadLetterRow[] }
        setDeadLetters(dlqRes.data ?? [])
      } else {
        setDeadLetters([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job detail")
    }
  }, [])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setLogs([])
      setDeadLetters([])
      return
    }
    void loadDetail(selectedId, selectedOrg)
  }, [loadDetail, selectedId, selectedOrg])

  async function runAction(kind: "retry" | "cancel", jobId: string) {
    setActionLoading(`${kind}:${jobId}`)
    setError(null)
    try {
      await adminFetch(`/jobs/${jobId}/${kind === "retry" ? "retry" : "force-cancel"}`, { method: "POST" })
      await loadJobs()
      await loadDetail(jobId, selectedOrg)
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${kind} job`)
    } finally {
      setActionLoading(null)
    }
  }

  async function replayDeadLetter(id: string) {
    setActionLoading(`dlq:${id}`)
    setError(null)
    try {
      await adminFetch(`/dead-letter/${id}/replay`, { method: "POST" })
      if (selectedId) await loadDetail(selectedId, selectedOrg)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to replay dead-letter job")
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <AdminShell
      activeHref="/jobs"
      title="Jobs"
      description="Search video jobs, inspect upstream state, retry failures, force-cancel stuck work, and replay dead-letter tasks."
      meta={
        <>
          <span>{jobs.length} loaded</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{loading ? "loading" : "live admin APIs"}</span>
        </>
      }
    >
      <div className="flex flex-col gap-5 p-6">
        <section className="rounded-xl border border-border/80 bg-card/40 p-4">
          <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr_auto]">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-border/80 bg-background px-3 font-mono text-[12px]"
            >
              <option value="all">all statuses</option>
              {ACTIVE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
              <option value="timed_out">timed_out</option>
              <option value="canceled">canceled</option>
            </select>
            <input
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="org_id"
              className="h-9 rounded-md border border-border/80 bg-background px-3 font-mono text-[12px]"
            />
            <input
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              placeholder="jump to job id"
              className="h-9 rounded-md border border-border/80 bg-background px-3 font-mono text-[12px]"
            />
            <button
              onClick={() => void loadJobs()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-[12px] font-medium text-background"
            >
              <Search className="size-3.5" /> Search
            </button>
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-status-failed/30 bg-status-failed/10 px-4 py-2 text-[12.5px] text-status-failed">
            <AlertTriangle className="size-4" /> {error}
          </div>
        )}

        <div className="grid min-h-[640px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
          <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
            <header className="border-b border-border/60 px-4 py-3 text-[13px] font-medium">Job search results</header>
            <div className="divide-y divide-border/60">
              {jobs.map((j) => {
                const id = str(j, "ID", "id")
                const s = str(j, "Status", "status")
                const providerJobId = str(j, "ProviderJobID", "provider_job_id")
                const created = str(j, "CreatedAt", "created_at")
                const selectedRow = selectedId === id
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedId(id)}
                    className={cn("grid w-full gap-3 px-4 py-3 text-left text-[12px] hover:bg-card/70 md:grid-cols-[170px_120px_1fr_140px]", selectedRow && "bg-card")}
                  >
                    <span className="truncate font-mono text-foreground">{id}</span>
                    <StatusPill status={toStatus(s)} label={s || "unknown"} />
                    <span className="truncate font-mono text-muted-foreground">{providerJobId || str(j, "Provider", "provider") || "-"}</span>
                    <span className="font-mono text-muted-foreground">{fmtDate(created)}</span>
                  </button>
                )
              })}
              {!loading && jobs.length === 0 && (
                <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No jobs found.</div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-xl border border-border/80 bg-card/40">
              <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="text-[13px] font-medium">Job detail</div>
                {selectedId && (
                  <div className="flex gap-2">
                    <button
                      disabled={actionLoading === `retry:${selectedId}`}
                      onClick={() => void runAction("retry", selectedId)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/80 px-2.5 text-[11.5px] hover:bg-background disabled:opacity-50"
                    >
                      <RefreshCcw className="size-3.5" /> Retry
                    </button>
                    <button
                      disabled={actionLoading === `cancel:${selectedId}`}
                      onClick={() => void runAction("cancel", selectedId)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-status-failed/40 px-2.5 text-[11.5px] text-status-failed hover:bg-status-failed/10 disabled:opacity-50"
                    >
                      <Square className="size-3.5" /> Force cancel
                    </button>
                  </div>
                )}
              </header>
              <pre className="max-h-[360px] overflow-auto p-4 text-[11px] leading-relaxed text-muted-foreground">
                {detail ? JSON.stringify(detail, null, 2) : "Select a job to inspect."}
              </pre>
            </section>

            <section className="rounded-xl border border-border/80 bg-card/40">
              <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-[13px] font-medium">
                <Terminal className="size-4 text-signal" /> Request logs
              </header>
              <div className="max-h-[220px] divide-y divide-border/60 overflow-auto">
                {logs.map((log, idx) => (
                  <pre key={idx} className="overflow-auto px-4 py-3 text-[10.5px] text-muted-foreground">{JSON.stringify(log, null, 2)}</pre>
                ))}
                {logs.length === 0 && <div className="px-4 py-6 text-[12px] text-muted-foreground">No request logs for this job.</div>}
              </div>
            </section>

            <section className="rounded-xl border border-border/80 bg-card/40">
              <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="text-[13px] font-medium">Dead letter</div>
                <span className="font-mono text-[11px] text-muted-foreground">{deadLetters.length}</span>
              </header>
              <div className="divide-y divide-border/60">
                {deadLetters.map((row) => {
                  const id = String(row.ID ?? row.id ?? "")
                  const jobId = String(row.JobID ?? row.job_id ?? "")
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 px-4 py-3 text-[12px]">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-foreground">{jobId}</div>
                        <div className="truncate text-muted-foreground">{String(row.Reason ?? row.reason ?? "dead-letter")}</div>
                      </div>
                      <button
                        disabled={!id || actionLoading === `dlq:${id}`}
                        onClick={() => void replayDeadLetter(id)}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/80 px-2.5 text-[11.5px] hover:bg-background disabled:opacity-50"
                      >
                        <RotateCcw className="size-3.5" /> Replay
                      </button>
                    </div>
                  )
                })}
                {deadLetters.length === 0 && <div className="px-4 py-6 text-[12px] text-muted-foreground">No dead-letter rows for this org.</div>}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AdminShell>
  )
}
