"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Play } from "lucide-react"
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
  estimated_cost_cents: number
  created_at: string
}

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
  const status = (["queued", "running", "succeeded", "failed"].includes(v.status)
    ? v.status
    : "queued") as JobStatus
  const credits = (v.estimated_cost_cents / 100).toFixed(2)
  const kind: JobRow["creditsKind"] =
    status === "failed" ? "refunded" : status === "succeeded" ? "billed" : "reserved"
  return {
    id: v.id,
    status,
    model: v.model || "seedance-2.0",
    prompt: "",
    submitted: relTime(v.created_at),
    duration: "—",
    creditsAmount: credits,
    creditsKind: kind,
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

  const [rows, setRows] = React.useState<JobRow[] | null>(null)
  const [fetchError, setFetchError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    apiFetch("/v1/videos?limit=50")
      .then((res) => {
        if (cancelled) return
        if (res && Array.isArray(res.data)) {
          setRows((res.data as VideoListItem[]).map(toJobRow))
        } else {
          setRows([])
        }
      })
      .catch((e) => {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : "load failed")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Decide effective state: explicit ?state= overrides; otherwise infer from data.
  const state: ListState =
    override ||
    (fetchError ? "error" : rows === null ? "loading" : rows.length === 0 ? "empty" : "default")

  const counts = {
    all: rows?.length ?? 0,
    running: rows?.filter((r) => r.status === "running").length ?? 0,
    queued: rows?.filter((r) => r.status === "queued").length ?? 0,
    succeeded: rows?.filter((r) => r.status === "succeeded").length ?? 0,
    failed: rows?.filter((r) => r.status === "failed").length ?? 0,
  }

  const stateTabs: { key: ListState; label: string; hint: string }[] = [
    { key: "default", label: t.jobs.statePreview.default, hint: `${counts.all} jobs` },
    { key: "empty", label: t.jobs.statePreview.empty, hint: t.jobs.empty.title.toLowerCase() },
    { key: "loading", label: t.jobs.statePreview.loading, hint: t.common.loading.toLowerCase() },
    { key: "error", label: t.jobs.statePreview.error, hint: "upstream 5xx" },
  ]

  const filters: {
    label: string
    status?: JobStatus
    count: number
    active?: boolean
  }[] = [
    { label: t.jobs.filters.all, count: counts.all, active: true },
    { label: t.jobs.states.running, status: "running", count: counts.running },
    { label: t.jobs.states.queued, status: "queued", count: counts.queued },
    { label: t.jobs.states.succeeded, status: "succeeded", count: counts.succeeded },
    { label: t.jobs.states.failed, status: "failed", count: counts.failed },
  ]

  return (
    <DashboardShell
      activeHref="/jobs"
      title={t.jobs.title}
      description={t.jobs.subtitle}
      actions={
        <Button
          asChild
          className="h-8 gap-1.5 bg-foreground px-3 text-[12.5px] font-medium text-background hover:bg-foreground/90"
        >
          <Link href="/jobs/new">
            <Play className="size-3.5" />
            {t.jobs.newJob}
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border/80 bg-card/30 px-3 py-2">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="font-mono uppercase tracking-[0.14em]">
              {t.jobs.statePreview.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {stateTabs.map((tab) => {
              const active = state === tab.key
              const href =
                tab.key === "default" ? "/jobs" : `/jobs?state=${tab.key}`
              return (
                <Link
                  key={tab.key}
                  href={href}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11.5px] transition-colors",
                    active
                      ? "bg-secondary text-foreground"
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

        <div
          className={cn(
            "flex flex-wrap items-center gap-2 transition-opacity",
            (state === "empty" || state === "error") && "pointer-events-none opacity-50",
          )}
        >
          {filters.map((f) => (
            <button
              key={f.label}
              disabled={state !== "default"}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[12.5px] transition-colors",
                f.active && state === "default"
                  ? "border-border bg-card text-foreground"
                  : "border-border/60 bg-card/30 text-muted-foreground hover:border-border hover:text-foreground",
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
          ))}
          <div className="flex-1" />
          <button
            disabled={state !== "default"}
            className="h-8 rounded-md border border-border/60 bg-card/30 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {t.common.last24h}
          </button>
        </div>

        {state === "default" && rows && <JobsTable rows={rows} />}
        {state === "loading" && <LoadingRows rows={6} />}
        {state === "empty" && <EmptyState />}
        {state === "error" && <ErrorState retryHref="/jobs" />}
      </div>
    </DashboardShell>
  )
}
