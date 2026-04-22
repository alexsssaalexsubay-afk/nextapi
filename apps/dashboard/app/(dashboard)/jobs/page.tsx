"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Play } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { JobsTable, sampleJobs } from "@/components/dashboard/jobs-table"
import { Button } from "@/components/ui/button"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { EmptyState, ErrorState, LoadingRows } from "@/components/nextapi/states"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type ListState = "default" | "empty" | "loading" | "error"

export default function JobsPage() {
  const t = useTranslations()
  const params = useSearchParams()
  const raw = (params.get("state") ?? "default") as ListState
  const state: ListState = (
    ["default", "empty", "loading", "error"] as ListState[]
  ).includes(raw)
    ? raw
    : "default"

  const stateTabs: { key: ListState; label: string; hint: string }[] = [
    { key: "default", label: t.jobs.statePreview.default, hint: "284 jobs" },
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
    { label: t.jobs.filters.all, count: 284, active: true },
    { label: t.jobs.states.running, status: "running", count: 4 },
    { label: t.jobs.states.queued, status: "queued", count: 8 },
    { label: t.jobs.states.succeeded, status: "succeeded", count: 270 },
    { label: t.jobs.states.failed, status: "failed", count: 2 },
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
        {/* State preview strip */}
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

        {/* Filter rail */}
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
          <button
            disabled={state !== "default"}
            className="h-8 rounded-md border border-border/60 bg-card/30 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {t.usage.exportCsv}
          </button>
        </div>

        {/* Content swap */}
        {state === "default" && <JobsTable rows={sampleJobs} />}
        {state === "loading" && <LoadingRows rows={6} />}
        {state === "empty" && <EmptyState />}
        {state === "error" && <ErrorState retryHref="/jobs" />}

        {state === "default" && (
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>
              {t.common.page} <span className="text-foreground">1</span> {t.common.of}{" "}
              <span className="text-foreground">48</span>
            </span>
            <div className="flex items-center gap-1">
              <button className="h-7 rounded-md border border-border/60 bg-card/30 px-2 text-[12px] hover:border-border hover:text-foreground">
                {t.common.more}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
