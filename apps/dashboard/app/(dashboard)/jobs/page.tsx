"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Activity, Clock3, Play, ReceiptText, Webhook } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { JobsTable, type JobRow } from "@/components/dashboard/jobs-table"
import { Button } from "@/components/ui/button"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { EmptyState, ErrorState, LoadingRows } from "@/components/nextapi/states"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"

type ListState = "default" | "empty" | "loading" | "error"

type VideoListItem = {
  id: string
  model: string
  status: string
  prompt?: string
  duration_seconds?: number
  resolution?: string
  ratio?: string
  estimated_cost_cents: number
  actual_cost_cents?: number | null
  upstream_tokens?: number | null
  upstream_job_id?: string | null
  provider_job_id?: string | null
  api_key_hint?: string | null
  error_code?: string | null
  error_message?: string | null
  output?: { url?: string; video_url?: string } | null
  created_at: string
  started_at?: string | null
  finished_at?: string | null
}

const VALID_STATUSES = ["queued", "submitting", "running", "retrying", "succeeded", "failed"] as const
type FilterStatus = typeof VALID_STATUSES[number] | "all"

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return "—"
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return `${Math.floor(diffSec / 86400)}d`
}

function toJobRow(v: VideoListItem): JobRow {
  const status = (["queued", "submitting", "running", "succeeded", "failed"].includes(v.status)
    ? v.status
    : v.status === "retrying"
      ? "running"
    : "queued") as JobStatus
  const cents = v.actual_cost_cents ?? v.estimated_cost_cents
  // Surface the upstream invoice currency directly so the dashboard column
  // matches what users see in the Seedance relay portal.
  const credits = `$${(cents / 100).toFixed(2)}`
  const kind: JobRow["creditsKind"] =
    status === "failed" ? "refunded" : status === "succeeded" ? "billed" : "reserved"
  const videoURL = v.output?.url || v.output?.video_url
  return {
    id: v.id,
    status,
    rawStatus: v.status,
    model: v.model || "seedance-2.0-pro",
    // Use real prompt from API; fall back to a readable placeholder
    prompt: v.prompt || "(no prompt)",
    submitted: relTime(v.created_at),
    createdAt: v.created_at,
    startedAt: v.started_at,
    finishedAt: v.finished_at,
    duration: v.duration_seconds ? `${v.duration_seconds}s` : "—",
    resolution: v.resolution,
    ratio: v.ratio,
    creditsAmount: credits,
    creditsKind: kind,
    tokenCount: v.upstream_tokens ?? null,
    providerJobId: v.provider_job_id ?? null,
    upstreamJobId: v.upstream_job_id ?? null,
    apiKeyHint: v.api_key_hint ?? null,
    errorCode: v.error_code ?? null,
    errorMessage: v.error_message ?? null,
    videoURL,
  }
}

export default function JobsPage() {
  const t = useTranslations()
  const params = useSearchParams()
  const overrideRaw = (params.get("state") ?? "") as ListState | ""
  const override: ListState | "" = (
    ["empty", "loading", "error"] as ListState[]
  ).includes(overrideRaw as ListState)
    ? (overrideRaw as ListState)
    : ""

  const [allRows, setAllRows] = React.useState<JobRow[] | null>(null)
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [activeFilter, setActiveFilter] = React.useState<FilterStatus>("all")

  const loadJobs = React.useCallback(() => {
    let cancelled = false
    apiFetch("/v1/videos?limit=50")
      .then((res) => {
        if (cancelled) return
        if (res && Array.isArray(res.data)) {
          setAllRows((res.data as VideoListItem[]).map(toJobRow))
          setFetchError(null)
        } else {
          setAllRows([])
        }
      })
      .catch((e) => {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : t.common.loadFailed)
      })
    return () => { cancelled = true }
  }, [])

  React.useEffect(() => {
    return loadJobs()
  }, [loadJobs])

  // Decide effective state: explicit ?state= overrides; otherwise infer from data.
  const state: ListState =
    override ||
    (fetchError ? "error" : allRows === null ? "loading" : allRows.length === 0 ? "empty" : "default")

  const rows = React.useMemo(() => {
    if (!allRows) return allRows
    if (activeFilter === "all") return allRows
    return allRows.filter((row) => row.rawStatus === activeFilter || row.status === activeFilter)
  }, [activeFilter, allRows])
  const isFilteredEmpty = state === "default" && rows?.length === 0 && activeFilter !== "all"

  const counts = {
    all: allRows?.length ?? 0,
    running: allRows?.filter((r) => r.status === "running").length ?? 0,
    queued: allRows?.filter((r) => r.status === "queued").length ?? 0,
    succeeded: allRows?.filter((r) => r.status === "succeeded").length ?? 0,
    failed: allRows?.filter((r) => r.status === "failed").length ?? 0,
  }

  const stateTabs: { key: ListState; label: string; hint: string }[] = [
    { key: "default", label: t.jobs.statePreview.default, hint: `${counts.all} videos` },
    { key: "empty", label: t.jobs.statePreview.empty, hint: t.jobs.empty.title.toLowerCase() },
    { key: "loading", label: t.jobs.statePreview.loading, hint: t.common.loading.toLowerCase() },
    { key: "error", label: t.jobs.statePreview.error, hint: "service issue" },
  ]

  const filters: {
    label: string
    filterKey: FilterStatus
    status?: JobStatus
    count: number
  }[] = [
    { label: t.jobs.filters.all, filterKey: "all", count: counts.all },
    { label: t.jobs.states.running, filterKey: "running", status: "running", count: counts.running },
    { label: t.jobs.states.queued, filterKey: "queued", status: "queued", count: counts.queued },
    { label: t.jobs.states.succeeded, filterKey: "succeeded", status: "succeeded", count: counts.succeeded },
    { label: t.jobs.states.failed, filterKey: "failed", status: "failed", count: counts.failed },
  ]

  return (
    <DashboardShell
      activeHref="/jobs"
      title={t.jobs.title}
      description={t.jobs.subtitle}
      actions={
        <Button
          asChild
          className="ops-interactive h-9 gap-1.5 bg-foreground px-3 text-[13px] font-medium text-background hover:bg-foreground/90"
        >
          <Link href="/jobs/new">
            <Play className="size-3.5" />
            {t.jobs.newJob}
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5 p-6">
        <section className="ops-panel overflow-hidden rounded-2xl">
          <div className="grid gap-px bg-border/70 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="bg-background/36 p-5">
              <div className="ops-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-status-success" />
                video activity
              </div>
              <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-tight text-foreground">
                See every video from request to delivery.
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Filter live work, check progress, review cost, and open failed items without losing context.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border/70">
              <JobOpsMetric icon={Activity} label="shown" value={String(counts.all)} />
              <JobOpsMetric icon={Clock3} label="live" value={String(counts.running + counts.queued)} />
              <JobOpsMetric icon={ReceiptText} label="delivered" value={String(counts.succeeded)} />
              <JobOpsMetric icon={Webhook} label="needs help" value={String(counts.failed)} tone="failed" />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/10 bg-background/26 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="font-mono uppercase tracking-[0.14em]">
                {t.jobs.statePreview.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
            {stateTabs.map((tab) => {
              const active = state === tab.key
              const href =
                tab.key === "default" ? "/jobs" : `/jobs?state=${tab.key}`
              return (
                <Link
                  key={tab.key}
                  href={href}
                  data-selected={active ? "true" : undefined}
                  className={cn(
                    "ops-interactive rounded-md border border-transparent px-2.5 py-1.5 text-[13px]",
                    active
                      ? "bg-signal text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  <span className="ml-2 font-mono text-[10.5px] text-muted-foreground/80">
                    {tab.hint}
                  </span>
                </Link>
              )
            })}
            </div>
          </div>
        </section>

        <div
          className={cn(
            "flex flex-wrap items-center gap-2 transition-opacity",
            (state === "empty" || state === "error") && "pointer-events-none opacity-50",
          )}
        >
          {filters.map((f) => {
            const isActive = activeFilter === f.filterKey
            return (
              <button
                key={f.filterKey}
                disabled={state !== "default"}
                onClick={() => {
                  if (state === "default") {
                    setActiveFilter(f.filterKey)
                  }
                }}
                data-selected={isActive && state === "default" ? "true" : undefined}
                className={cn(
                  "ops-interactive inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px]",
                  isActive && state === "default"
                    ? "border-signal/35 bg-signal/10 text-foreground"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {f.status ? (
                  <StatusPill status={f.status} label={f.label} />
                ) : (
                  <span>{f.label}</span>
                )}
                <span className="font-mono text-[11px] text-muted-foreground">
                  {state === "default" ? f.count : "—"}
                </span>
              </button>
            )
          })}
          <div className="flex-1" />
          <button
            disabled={state !== "default"}
            className="ops-interactive h-9 rounded-md border border-border/60 bg-card/30 px-2.5 text-[13px] text-muted-foreground hover:border-border hover:text-foreground"
          >
            {t.common.last24h}
          </button>
        </div>

        {state === "default" && rows && rows.length > 0 && <JobsTable rows={rows} />}
        {isFilteredEmpty && (
          <div className="ops-panel rounded-2xl border-dashed px-6 py-10 text-center">
            <h3 className="text-[15px] font-medium tracking-tight text-foreground">
              {t.jobs.filteredEmpty.title.replace("{status}", filters.find((filter) => filter.filterKey === activeFilter)?.label.toLowerCase() ?? activeFilter)}
            </h3>
            <p className="mx-auto mt-2 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
              {t.jobs.filteredEmpty.description}
            </p>
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className="ops-interactive mt-5 inline-flex h-9 items-center rounded-md bg-foreground px-3 text-[13px] font-medium text-background hover:bg-foreground/90"
            >
              {t.jobs.filteredEmpty.cta}
            </button>
          </div>
        )}
        {state === "loading" && <LoadingRows rows={6} />}
        {state === "empty" && <EmptyState primaryHref="/jobs/new" />}
        {state === "error" && <ErrorState retryHref="/jobs" />}
      </div>
    </DashboardShell>
  )
}

function JobOpsMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: "default" | "failed"
}) {
  return (
    <div className="bg-background/46 p-4">
      <Icon className={cn("size-4", tone === "failed" ? "text-status-failed" : "text-signal")} />
      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  )
}
