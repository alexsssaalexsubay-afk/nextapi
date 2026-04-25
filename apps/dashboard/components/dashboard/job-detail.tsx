"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  AlertTriangle,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  PauseCircle,
  Play,
  RefreshCcw,
  XCircle,
} from "lucide-react"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { CodeBlock } from "@/components/nextapi/code-block"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch } from "@/lib/api"

// Shape returned by GET /v1/videos/:id
type VideoDetail = {
  id: string
  model: string
  status: string
  input?: Record<string, unknown>
  output?: { url?: string }
  estimated_cost_cents: number
  actual_cost_cents?: number
  error_code?: string
  error_message?: string
  created_at: string
  started_at?: string
  finished_at?: string
}

const ACTIVE_STATUSES = new Set(["queued", "submitting", "running", "retrying"])
const POLL_INTERVAL_MS = 4000

function toJobStatus(s: string): JobStatus {
  const valid: JobStatus[] = ["queued", "submitting", "running", "succeeded", "failed"]
  return valid.includes(s as JobStatus) ? (s as JobStatus) : "queued"
}

export function JobDetail({ jobId }: { jobId: string }) {
  const t = useTranslations()
  const td = t.jobs.detail

  const [video, setVideo] = useState<VideoDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchJob = useCallback(async () => {
    try {
      const data = await apiFetch(`/v1/videos/${jobId}`)
      setVideo(data)
      setLoadError(null)
      return data as VideoDetail
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t.common.loadFailed)
      return null
    }
  }, [jobId])

  // Poll while job is in an active (non-terminal) state
  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      const data = await fetchJob()
      if (cancelled) return
      if (data && ACTIVE_STATUSES.has(data.status)) {
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }
    poll()

    return () => {
      cancelled = true
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [fetchJob])

  const handleCopy = () => {
    navigator.clipboard.writeText(jobId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleCancel = async () => {
    setActionLoading(true)
    try {
      await apiFetch(`/v1/videos/${jobId}`, { method: "DELETE" })
      await fetchJob()
    } catch {
      // ignore — status will refresh on next poll
    } finally {
      setActionLoading(false)
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-20 text-center">
        <AlertTriangle className="size-8 text-status-failed" />
        <p className="text-[13.5px] font-medium">Failed to load job</p>
        <p className="text-[12.5px] text-muted-foreground">{loadError}</p>
        <button
          onClick={() => fetchJob()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card"
        >
          <RefreshCcw className="size-3.5" />
          Retry
        </button>
      </div>
    )
  }

  if (!video) {
    return (
      <div className="flex items-center justify-center gap-3 p-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-[13px]">Loading job…</span>
      </div>
    )
  }

  const state = toJobStatus(video.status)
  const prompt = (video.input?.prompt as string) || "(no prompt)"
  const videoURL = video.output?.url
  const reservedCredits = (video.estimated_cost_cents / 100).toFixed(2)
  const billedCredits = video.actual_cost_cents != null
    ? (video.actual_cost_cents / 100).toFixed(2)
    : null
  const isActive = ACTIVE_STATUSES.has(video.status)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <StatusPill status={state} size="md" />
            {isActive && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            <span className="font-mono text-[12.5px] text-muted-foreground">
              {jobId}
            </span>
            <button
              aria-label={t.common.copy}
              onClick={handleCopy}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              {copied
                ? <span className="text-[10px] text-status-success">✓</span>
                : <Copy className="size-3.5" />
              }
            </button>
          </div>
          <h1 className="max-w-[720px] text-[22px] font-medium leading-tight tracking-tight">
            {prompt}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {video.model || "seedance-2.0-pro"} · {new Date(video.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <button
              disabled={actionLoading}
              onClick={handleCancel}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card disabled:opacity-50"
            >
              <XCircle className="size-3.5" />
              {td.cancelJob}
            </button>
          )}
          {state === "succeeded" && videoURL && (
            <a
              href={videoURL}
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card"
            >
              <Download className="size-3.5" />
              {td.downloadMp4}
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div className="space-y-6">
          <OutputPanel state={state} videoURL={videoURL} />
          <PayloadPanel input={video.input} />
          <EventsPanel
            state={state}
            errorCode={video.error_code}
            errorMessage={video.error_message}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <TimelinePanel
            state={state}
            createdAt={video.created_at}
            startedAt={video.started_at}
            finishedAt={video.finished_at}
          />
          <BillingPanel
            state={state}
            reserved={reservedCredits}
            billed={billedCredits}
          />
          <UpstreamPanel
            state={state}
            errorCode={video.error_code}
            model={video.model}
          />
        </div>
      </div>
    </div>
  )
}

function OutputPanel({ state, videoURL }: { state: JobStatus; videoURL?: string }) {
  const t = useTranslations()
  const td = t.jobs.detail

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h2 className="text-[13px] font-medium tracking-tight">{td.outputPanel.title}</h2>
        {state === "succeeded" && videoURL && (
          <a
            href={videoURL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            {videoURL.split("/").pop() ?? "video.mp4"}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="relative aspect-video overflow-hidden bg-[oklch(0.11_0.004_260)]">
        {state === "submitting" && <SubmittingView />}
        {state === "queued" && <QueuedView />}
        {state === "running" && <RunningView />}
        {state === "succeeded" && <SucceededView videoURL={videoURL} />}
        {state === "failed" && <FailedView />}
      </div>
    </section>
  )
}

function SubmittingView() {
  const t = useTranslations()
  const o = t.jobs.detail.outputPanel
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 op-sweep">
      <div className="size-8 rounded-full border-2 border-status-queued border-t-transparent animate-spin" />
      <div className="text-center">
        <div className="text-[13.5px] font-medium text-foreground">{o.submittingTitle}</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {o.submittingHint}
        </div>
      </div>
    </div>
  )
}

function QueuedView() {
  const t = useTranslations()
  const o = t.jobs.detail.outputPanel
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <PauseCircle className="size-8 text-status-queued" />
      <div className="text-center">
        <div className="text-[13.5px] font-medium text-foreground">{o.queuedTitle}</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {o.queuedHint}
        </div>
      </div>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-border">
        <div className="h-full w-1/4 bg-status-queued" />
      </div>
    </div>
  )
}

function RunningView() {
  const t = useTranslations()
  const o = t.jobs.detail.outputPanel
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 op-sweep">
      <div className="relative flex size-12 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-status-running/30 op-pulse" />
        <span className="relative size-3 rounded-full bg-status-running" />
      </div>
      <div className="text-center">
        <div className="text-[13.5px] font-medium text-foreground">
          {o.runningTitle}
        </div>
        <div className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
          {o.runningHint}
        </div>
      </div>
      <div className="h-1 w-56 overflow-hidden rounded-full bg-border">
        <div
          className="h-full bg-status-running"
          style={{ width: "86%" }}
        />
      </div>
    </div>
  )
}

function SucceededView({ videoURL }: { videoURL?: string }) {
  const t = useTranslations()
  const o = t.jobs.detail.outputPanel
  return (
    <div className="absolute inset-0">
      {videoURL ? (
        <video
          src={videoURL}
          controls
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <>
          <div className="absolute inset-0 bg-dots opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.08_0.01_260)] via-[oklch(0.14_0.01_220)] to-[oklch(0.2_0.05_170)]" />
          <div className="absolute inset-0 flex items-end p-6">
            <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2 backdrop-blur-md">
              <button className="inline-flex size-8 items-center justify-center rounded-full bg-foreground text-background">
                <Play className="size-3.5 translate-x-px" />
              </button>
              <div className="font-mono text-[11.5px] text-foreground/90">00:00 / 00:06</div>
              <span className="font-mono text-[11px] text-muted-foreground">{o.succeededFps}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FailedView() {
  const t = useTranslations()
  const o = t.jobs.detail.outputPanel
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-status-failed-dim/15">
      <AlertTriangle className="size-8 text-status-failed" />
      <div className="max-w-[380px] text-center">
        <div className="text-[13.5px] font-medium text-foreground">
          {o.failedTitle}
        </div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {o.failedHint}
        </div>
      </div>
    </div>
  )
}

function PayloadPanel({ input }: { input?: Record<string, unknown> }) {
  const t = useTranslations()
  const r = t.jobs.detail.request

  const inputJson = input
    ? JSON.stringify(input, null, 2)
    : `{
  "prompt": "(loading…)"
}`

  return (
    <CodeBlock
      filename="request.json"
      tabs={[
        {
          label: r.submitted,
          language: "json",
          code: inputJson,
        },
      ]}
    />
  )
}

function EventsPanel({
  state,
  errorCode,
  errorMessage,
}: {
  state: JobStatus
  errorCode?: string
  errorMessage?: string
}) {
  const t = useTranslations()
  const e = t.jobs.detail.events

  const rows = [
    { ev: "job.submitted", note: "reservation taken", color: "queued" },
    state !== "submitting" && {
      ev: "job.queued",
      note: "upstream acknowledged",
      color: "queued",
    },
    (state === "running" || state === "succeeded" || state === "failed") && {
      ev: "job.running",
      note: "rendering started",
      color: "running",
    },
    state === "succeeded" && {
      ev: "job.succeeded",
      note: "video available",
      color: "success",
    },
    state === "failed" && {
      ev: "job.failed",
      note: errorCode
        ? `${errorCode}${errorMessage ? ": " + errorMessage : ""}`
        : "see error details",
      color: "failed",
    },
  ].filter(Boolean) as { ev: string; note: string; color: string }[]

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h2 className="text-[13px] font-medium tracking-tight">{e.title}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{e.retention}</span>
      </div>
      <ul className="divide-y divide-border/60 font-mono text-[12px]">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-2.5">
            <span
              className={cn(
                "w-36 shrink-0",
                r.color === "success" && "text-status-success",
                r.color === "failed" && "text-status-failed",
                r.color === "running" && "text-status-running",
                r.color === "queued" && "text-status-queued",
              )}
            >
              {r.ev}
            </span>
            <span className="flex-1 truncate text-muted-foreground">{r.note}</span>
          </li>
        ))}
        {(state === "submitting" || state === "queued" || state === "running") && (
          <li className="flex items-center gap-4 px-5 py-2.5 text-muted-foreground">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-muted-foreground op-pulse" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              </span>
              {e.awaiting}
            </span>
          </li>
        )}
      </ul>
    </section>
  )
}

function TimelinePanel({
  state,
  createdAt,
  startedAt,
  finishedAt,
}: {
  state: JobStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
}) {
  const t = useTranslations()
  const tp = t.jobs.detail.timelinePanel

  function elapsed(from: string, to?: string): string {
    const start = new Date(from).getTime()
    const end = to ? new Date(to).getTime() : Date.now()
    const ms = Math.max(0, end - start)
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const steps = [
    {
      label: tp.submitted,
      time: new Date(createdAt).toLocaleTimeString(),
      done: true,
      active: false,
    },
    {
      label: tp.queued,
      time: startedAt ? "+" + elapsed(createdAt, startedAt) : "—",
      done: ["running", "succeeded", "failed"].includes(state),
      active: state === "queued",
    },
    {
      label: tp.running,
      time: startedAt ? "+" + elapsed(createdAt, startedAt) : "—",
      done: ["succeeded", "failed"].includes(state),
      active: state === "running",
    },
    {
      label: state === "failed" ? tp.failed : tp.webhookDelivered,
      time: finishedAt ? "+" + elapsed(createdAt, finishedAt) : "—",
      done: state === "succeeded" || state === "failed",
      failed: state === "failed",
      active: false,
    },
  ]

  const suffix =
    finishedAt
      ? `${tp.totalPrefix} ${elapsed(createdAt, finishedAt)}`
      : tp.live

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium tracking-tight">{tp.title}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{suffix}</span>
      </div>
      <ol className="mt-4 space-y-3.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="relative mt-1.5 flex size-2 items-center justify-center">
              {s.active && (
                <span className="absolute inset-0 rounded-full bg-status-running op-pulse" />
              )}
              <span
                className={cn(
                  "relative size-2 rounded-full",
                  s.failed
                    ? "bg-status-failed"
                    : s.done
                      ? "bg-status-success"
                      : s.active
                        ? "bg-status-running"
                        : "bg-border",
                )}
              />
            </div>
            <div className="flex flex-1 items-baseline justify-between gap-3">
              <span
                className={
                  s.done || s.active
                    ? s.failed
                      ? "text-status-failed"
                      : "text-foreground"
                    : "text-muted-foreground"
                }
              >
                {s.label}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{s.time}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function BillingPanel({
  state,
  reserved,
  billed,
}: {
  state: JobStatus
  reserved: string
  billed: string | null
}) {
  const t = useTranslations()
  const b = t.jobs.detail.billingPanel

  const billedLabel =
    state === "failed" ? b.billedFailed : state === "succeeded" ? b.billedSuccess : b.pendingBill

  const billedValue = billed ?? (state === "succeeded" ? "—" : state === "failed" ? "0.00" : "—")
  const refundedValue = state === "failed" ? reserved : "0.00"
  const netValue = billed ?? (state === "succeeded" ? "—" : "0.00")

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5">
      <h2 className="text-[13px] font-medium tracking-tight">{b.title}</h2>
      <dl className="mt-4 space-y-2.5 font-mono text-[12.5px]">
        <Line label={b.reservedOnSubmit} value={reserved} />
        <Line
          label={billedLabel}
          value={billedValue}
        />
        <Line
          label={b.refunded}
          value={refundedValue}
          highlight={state === "failed"}
        />
        <div className="h-px bg-border/60" />
        <Line
          label={b.netCredits}
          value={netValue}
          strong
        />
      </dl>
      <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
        {b.note}
      </p>
    </section>
  )
}

function Line({
  label,
  value,
  highlight,
  strong,
}: {
  label: string
  value: string
  highlight?: boolean
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          strong && "text-foreground",
          highlight && "text-status-success",
          !strong && !highlight && "text-foreground/90",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function UpstreamPanel({
  state,
  errorCode,
  model,
}: {
  state: JobStatus
  errorCode?: string
  model?: string
}) {
  const t = useTranslations()
  const u = t.jobs.detail.upstreamPanel

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5">
      <h2 className="text-[13px] font-medium tracking-tight">{u.title}</h2>
      <dl className="mt-4 space-y-2.5 font-mono text-[12px]">
        <Line label={u.provider} value="seedance.bytedance" />
        <Line label={u.model} value={model || "seedance-2.0-pro"} />
        <Line label={u.retries} value={u.retriesValue} />
        {state === "failed" && errorCode && (
          <Line label={u.errorCode} value={errorCode} highlight />
        )}
      </dl>
    </section>
  )
}
