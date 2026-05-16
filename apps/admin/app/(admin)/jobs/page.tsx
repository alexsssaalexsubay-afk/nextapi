"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, Clock3, RefreshCcw, RotateCcw, Search, ShieldAlert, Square, Terminal, Workflow } from "lucide-react"
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
  const searchParams = useSearchParams()
  const initialJobID = searchParams.get("job") ?? ""
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApiJob | null>(null)
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [deadLetters, setDeadLetters] = useState<DeadLetterRow[]>([])
  const [status, setStatus] = useState("failed")
  const [orgId, setOrgId] = useState("")
  const [queryId, setQueryId] = useState(initialJobID)
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
      setError(e instanceof Error ? e.message : "Failed to load video work")
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
      setError(e instanceof Error ? e.message : "Failed to load video detail")
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
      setError(e instanceof Error ? e.message : `Failed to ${kind} video`)
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
      setError(e instanceof Error ? e.message : "Failed to replay recovery item")
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <AdminShell
      activeHref="/jobs"
      title="Video work"
      description="Search video work, inspect provider status, retry failures, cancel stuck items, and replay recovery items."
      meta={
        <>
          <span>{jobs.length} shown</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{loading ? "loading" : "live admin data"}</span>
        </>
      }
    >
      <div className="flex flex-col gap-5 p-6">
        <section className="ops-panel overflow-hidden rounded-2xl">
          <div className="grid gap-px bg-border/70 xl:grid-cols-[1fr_520px]">
            <div className="bg-background/36 p-5">
              <div className="ops-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-status-failed" />
                support search
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                Catch stuck video work before customers do.
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Search active, failed, and delayed work with enough context to retry, cancel, or replay safely.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-px bg-border/70">
              <AdminJobMetric icon={Workflow} label="shown" value={String(jobs.length)} />
              <AdminJobMetric icon={Clock3} label={status} value={loading ? "…" : "live"} />
              <AdminJobMetric icon={ShieldAlert} label="selected" value={selectedId ? "yes" : "none"} tone="risk" />
            </div>
          </div>
          <div className="grid gap-3 border-t border-white/10 bg-background/26 p-4 md:grid-cols-[160px_1fr_1fr_auto]">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-border/80 bg-background/70 px-3 font-mono text-[13px] outline-none transition-colors focus-visible:border-status-failed focus-visible:ring-2 focus-visible:ring-status-failed/25"
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
              className="h-9 rounded-md border border-border/80 bg-background/70 px-3 font-mono text-[13px] outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-status-failed focus-visible:ring-2 focus-visible:ring-status-failed/25"
            />
            <input
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              placeholder="jump to video id"
              className="h-9 rounded-md border border-border/80 bg-background/70 px-3 font-mono text-[13px] outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-status-failed focus-visible:ring-2 focus-visible:ring-status-failed/25"
            />
            <button
              onClick={() => void loadJobs()}
              className="ops-interactive inline-flex h-9 items-center gap-1.5 rounded-md bg-status-failed px-4 text-[13px] font-medium text-white hover:bg-status-failed/90"
            >
              <Search className="size-3.5" /> Search
            </button>
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-status-failed/30 bg-status-failed/10 px-4 py-2 text-[13px] text-status-failed">
            <AlertTriangle className="size-4" /> {error}
          </div>
        )}

        <div className="grid min-h-[640px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
          <section className="ops-panel overflow-hidden rounded-2xl">
            <header className="border-b border-border/60 px-4 py-3 text-[13px] font-medium">Search results</header>
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
                    data-selected={selectedRow ? "true" : undefined}
                    className={cn("ops-interactive grid w-full gap-3 border-l-2 border-transparent px-4 py-3 text-left text-[13px] hover:bg-card/70 md:grid-cols-[170px_120px_1fr_140px]", selectedRow && "border-status-failed/60 bg-card")}
                  >
                    <span className="truncate font-mono text-foreground">{id}</span>
                    <StatusPill status={toStatus(s)} label={s || "unknown"} />
                    <span className="truncate font-mono text-muted-foreground">{providerJobId || str(j, "Provider", "provider") || "-"}</span>
                    <span className="font-mono text-muted-foreground">{fmtDate(created)}</span>
                  </button>
                )
              })}
              {!loading && jobs.length === 0 && (
                <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No video work found.</div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="ops-risk-panel rounded-2xl">
              <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="text-[13px] font-medium">Video detail</div>
                {selectedId && (
                  <div className="flex gap-2">
                    <button
                      disabled={actionLoading === `retry:${selectedId}`}
                      onClick={() => void runAction("retry", selectedId)}
                      className="ops-interactive inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-2.5 text-[13px] hover:bg-background"
                    >
                      <RefreshCcw className="size-3.5" /> Retry
                    </button>
                    <button
                      disabled={actionLoading === `cancel:${selectedId}`}
                      onClick={() => void runAction("cancel", selectedId)}
                      className="ops-interactive inline-flex h-8 items-center gap-1.5 rounded-md border border-status-failed/40 px-2.5 text-[13px] text-status-failed hover:bg-status-failed/10"
                    >
                      <Square className="size-3.5" /> Force cancel
                    </button>
                  </div>
                )}
              </header>
              <pre className="max-h-[360px] overflow-auto p-4 text-[12px] leading-relaxed text-muted-foreground">
                {detail ? JSON.stringify(detail, null, 2) : "Select a video to inspect."}
              </pre>
            </section>

            <section className="ops-panel rounded-2xl">
              <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-[13px] font-medium">
                <Terminal className="size-4 text-signal" /> Activity logs
              </header>
              <div className="max-h-[220px] divide-y divide-border/60 overflow-auto">
                {logs.map((log, idx) => (
                  <pre key={idx} className="overflow-auto px-4 py-3 text-[12px] text-muted-foreground">{JSON.stringify(log, null, 2)}</pre>
                ))}
                {logs.length === 0 && <div className="px-4 py-6 text-[13px] text-muted-foreground">No activity logs for this video.</div>}
              </div>
            </section>

            <section className="ops-panel rounded-2xl">
              <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="text-[13px] font-medium">Recovery queue</div>
                <span className="font-mono text-[12px] text-muted-foreground">{deadLetters.length}</span>
              </header>
              <div className="divide-y divide-border/60">
                {deadLetters.map((row) => {
                  const id = String(row.ID ?? row.id ?? "")
                  const jobId = String(row.JobID ?? row.job_id ?? "")
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-foreground">{jobId}</div>
                        <div className="truncate text-muted-foreground">{String(row.Reason ?? row.reason ?? "dead-letter")}</div>
                      </div>
                      <button
                        disabled={!id || actionLoading === `dlq:${id}`}
                        onClick={() => void replayDeadLetter(id)}
                        className="ops-interactive inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/80 px-2.5 text-[13px] hover:bg-background"
                      >
                        <RotateCcw className="size-3.5" /> Replay
                      </button>
                    </div>
                  )
                })}
                {deadLetters.length === 0 && <div className="px-4 py-6 text-[13px] text-muted-foreground">No recovery items for this org.</div>}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AdminShell>
  )
}

function AdminJobMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: "default" | "risk"
}) {
  return (
    <div className="bg-background/46 p-4">
      <Icon className={cn("size-4", tone === "risk" ? "text-status-failed" : "text-signal")} />
      <div className="mt-3 font-mono text-[12px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  )
}
