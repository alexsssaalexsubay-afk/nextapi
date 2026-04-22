"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

export type JobStatus = "idle" | "submitting" | "queued" | "running" | "succeeded" | "failed"

const config: Record<
  JobStatus,
  { dot: string; text: string; ring: string; animate?: string }
> = {
  idle: {
    dot: "bg-status-idle",
    text: "text-muted-foreground",
    ring: "ring-status-idle/30",
  },
  submitting: {
    dot: "bg-status-queued",
    text: "text-status-queued",
    ring: "ring-status-queued/30",
    animate: "op-pulse",
  },
  queued: {
    dot: "bg-status-queued",
    text: "text-status-queued",
    ring: "ring-status-queued/30",
  },
  running: {
    dot: "bg-status-running",
    text: "text-status-running",
    ring: "ring-status-running/30",
    animate: "op-pulse",
  },
  succeeded: {
    dot: "bg-status-success",
    text: "text-status-success",
    ring: "ring-status-success/30",
  },
  failed: {
    dot: "bg-status-failed",
    text: "text-status-failed",
    ring: "ring-status-failed/30",
  },
}

export function StatusPill({
  status,
  label,
  className,
  size = "sm",
}: {
  status: JobStatus
  label?: string
  className?: string
  size?: "sm" | "md"
}) {
  const t = useTranslations()
  const c = config[status]

  const defaultLabel: Record<JobStatus, string> = {
    idle: t.jobs.states.idle,
    submitting: t.jobs.states.submitting,
    queued: t.jobs.states.queued,
    running: t.jobs.states.running,
    succeeded: t.jobs.states.succeeded,
    failed: t.jobs.states.failed,
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 font-medium tracking-tight",
        size === "sm" ? "h-6 px-2.5 text-[11px]" : "h-7 px-3 text-xs",
        c.text,
        className,
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className={cn("absolute inset-0 rounded-full", c.dot, c.animate)} />
        <span className={cn("relative inline-block h-1.5 w-1.5 rounded-full", c.dot)} />
      </span>
      {label ?? defaultLabel[status]}
    </span>
  )
}
