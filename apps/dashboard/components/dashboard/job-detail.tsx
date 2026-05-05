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
import { describeJobError } from "@/lib/api-error-i18n"

// Shape returned by GET /v1/videos/:id
type VideoDetail = {
  id: string
  model: string
  status: string
  input?: Record<string, unknown>
  output?: { url?: string }
  metadata?: Record<string, unknown>
  estimated_cost_cents: number
  actual_cost_cents?: number
  upstream_tokens?: number
  provider_job_id?: string
  retry_count?: number
  error_code?: string
  error_message?: string
  last_error_code?: string
  last_error_message?: string
  created_at: string
  started_at?: string
  finished_at?: string
}

const ACTIVE_STATUSES = new Set(["queued", "submitting", "running", "retrying"])
const POLL_INTERVAL_MS = 4000

function toJobStatus(s: string): JobStatus {
  if (s === "processing" || s === "retrying") return "running"
  const valid: JobStatus[] = ["queued", "submitting", "running", "succeeded", "failed"]
  return valid.includes(s as JobStatus) ? (s as JobStatus) : "queued"
}

type ObservabilityEvent = {
  ts?: string
  event?: string
  level?: string
  title?: string
  payload?: unknown
}

type ObservabilityState = {
  request_summary?: Record<string, unknown>
  submit_payload?: Record<string, unknown>
  current?: Record<string, unknown>
  debug?: Record<string, unknown>
  events?: ObservabilityEvent[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function getObservability(video?: VideoDetail | null): ObservabilityState | null {
  const root = video?.metadata
  if (!isRecord(root)) return null
  const raw = root.upstream_observability
  return isRecord(raw) ? (raw as ObservabilityState) : null
}

function stringifyCompact(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getObservabilityEvents(video?: VideoDetail | null): ObservabilityEvent[] {
  const events = getObservability(video)?.events
  if (!Array.isArray(events)) return []
  return events.filter((event): event is ObservabilityEvent => isRecord(event))
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
        <p className="text-[13.5px] font-medium">{td.loadFailedTitle}</p>
        <p className="text-[12.5px] text-muted-foreground">{loadError}</p>
        <button
          onClick={() => fetchJob()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card"
        >
          <RefreshCcw className="size-3.5" />
          {td.retry}
        </button>
      </div>
    )
  }

  if (!video) {
    return (
      <div className="flex items-center justify-center gap-3 p-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-[13px]">{td.loading}</span>
      </div>
    )
  }

  const state = toJobStatus(video.status)
  const prompt = (video.input?.prompt as string) || td.noPrompt
  const videoURL = video.output?.url
  const observability = getObservability(video)
  const observabilityEvents = getObservabilityEvents(video)
  const currentSnapshot = observability?.current
  const providerProgress =
    isRecord(currentSnapshot) && typeof currentSnapshot.progress === "number"
      ? currentSnapshot.progress
      : null
  const providerBillableQuantity =
    isRecord(currentSnapshot) && typeof currentSnapshot.billable_quantity === "number"
      ? currentSnapshot.billable_quantity
      : null
  const providerBillableUnit =
    isRecord(currentSnapshot) && typeof currentSnapshot.billable_unit === "string"
      ? currentSnapshot.billable_unit
      : null
  // USD strings — what the upstream invoice is denominated in.
  const reservedUSD = `$${(video.estimated_cost_cents / 100).toFixed(2)}`
  const billedUSD = video.actual_cost_cents != null
    ? `$${(video.actual_cost_cents / 100).toFixed(2)}`
    : null
  const isActive = ACTIVE_STATUSES.has(video.status)
  const handleDownload = async () => {
    if (!videoURL) return
    try {
      const res = await fetch(videoURL, { mode: "cors", credentials: "omit" })
      if (!res.ok) throw new Error(`download failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `nextapi-${jobId}.mp4`
      a.rel = "noopener"
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch {
      const a = document.createElement("a")
      a.href = videoURL
      a.target = "_blank"
      a.rel = "noopener noreferrer"
      a.click()
    }
  }

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
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card"
            >
              <Download className="size-3.5" />
              {td.downloadMp4}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div className="space-y-6">
          <OutputPanel state={state} videoURL={videoURL} />
          <PayloadPanel
            input={video.input}
            requestSummary={observability?.request_summary}
            submitPayload={observability?.submit_payload}
          />
          <EventsPanel
            state={state}
            errorCode={video.error_code}
            errorMessage={video.error_message}
            events={observabilityEvents}
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
            reserved={reservedUSD}
            billed={billedUSD}
            billableQuantity={providerBillableQuantity}
            billableUnit={providerBillableUnit}
          />
          <UpstreamPanel
            state={state}
            errorCode={video.error_code}
            errorMessage={video.error_message}
            model={video.model}
            providerJobID={video.provider_job_id}
            retryCount={video.retry_count}
            progress={providerProgress}
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
      <div className="relative mx-auto aspect-video w-full max-h-[70vh] overflow-hidden bg-[oklch(0.11_0.004_260)]">
        {state === "submitting" && <SubmittingView />}
        {state === "queued" && <QueuedView />}
        {state === "running" && <RunningView />}
        {state === "succeeded" && <SucceededView videoURL={videoURL} />}
        {state === "failed" && <FailedView />}
      </div>
      {state === "succeeded" && videoURL && (
        <div className="border-t border-border/60 px-5 py-3 text-[12px] leading-relaxed text-muted-foreground">
          {td.outputPanel.outputStorageNotice}
        </div>
      )}
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

function PayloadPanel({
  input,
  requestSummary,
  submitPayload,
}: {
  input?: Record<string, unknown>
  requestSummary?: Record<string, unknown>
  submitPayload?: Record<string, unknown>
}) {
  const t = useTranslations()
  const r = t.jobs.detail.request

  const inputJson = input
    ? JSON.stringify(input, null, 2)
    : `{\n  "prompt": "${r.loadingPlaceholder}"\n}`
  const tabs = [
    {
      label: r.submitted,
      language: "json",
      code: inputJson,
    },
  ]
  if (requestSummary) {
    tabs.push({
      label: "request_summary",
      language: "json",
      code: JSON.stringify(requestSummary, null, 2),
    })
  }
  if (submitPayload) {
    tabs.push({
      label: "submit_payload",
      language: "json",
      code: JSON.stringify(submitPayload, null, 2),
    })
  }

  return (
    <CodeBlock
      filename="request.json"
      tabs={tabs}
    />
  )
}

function EventsPanel({
  state,
  errorCode,
  errorMessage,
  events,
}: {
  state: JobStatus
  errorCode?: string
  errorMessage?: string
  events?: ObservabilityEvent[]
}) {
  const t = useTranslations()
  const e = t.jobs.detail.events
  const errorCopy = describeJobError(t, errorCode, errorMessage)
  type EventRow = { ev: string; note: string; color: string; payload?: string }
  const providerRows: EventRow[] = events?.map((event) => ({
    ev: event.event || "provider.event",
    note: event.title || (event.payload ? stringifyCompact(event.payload) : ""),
    color:
      event.level === "error"
        ? "failed"
        : event.level === "success"
          ? "success"
          : event.event?.includes("running") || event.event?.includes("processing")
            ? "running"
            : "queued",
    payload: event.payload ? stringifyCompact(event.payload) : "",
  })) ?? []

  const fallbackRows = [
    { ev: "job.submitted", note: e.notes.submitted, color: "queued", payload: undefined },
    state !== "submitting" && {
      ev: "job.queued",
      note: e.notes.queued,
      color: "queued",
      payload: undefined,
    },
    (state === "running" || state === "succeeded" || state === "failed") && {
      ev: "job.running",
      note: e.notes.running,
      color: "running",
      payload: undefined,
    },
    state === "succeeded" && {
      ev: "job.succeeded",
      note: e.notes.succeeded,
      color: "success",
      payload: undefined,
    },
    state === "failed" && {
      ev: "job.failed",
      note: errorCode || errorMessage
        ? `${errorCode || "upstream_error"}: ${errorCopy.summary}${errorCopy.detail ? ` | ${errorCopy.detail}` : ""}`
        : e.notes.failedDefault,
      color: "failed",
      payload: undefined,
    },
  ].filter(Boolean) as EventRow[]
  const rows = providerRows.length > 0 ? providerRows : fallbackRows

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h2 className="text-[13px] font-medium tracking-tight">{e.title}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{e.retention}</span>
      </div>
      <ul className="divide-y divide-border/60 font-mono text-[12px]">
        {rows.map((r, i) => (
          <li key={i} className="px-5 py-2.5">
            <div className="flex items-center gap-4">
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
            </div>
            {typeof r.payload === "string" && r.payload.length > 0 ? (
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                {r.payload}
              </pre>
            ) : null}
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
  billableQuantity,
  billableUnit,
}: {
  state: JobStatus
  reserved: string
  billed: string | null
  billableQuantity?: number | null
  billableUnit?: string | null
}) {
  const t = useTranslations()
  const b = t.jobs.detail.billingPanel

  const billedLabel =
    state === "failed" ? b.billedFailed : state === "succeeded" ? b.billedSuccess : b.pendingBill

  const billedValue = billed ?? (state === "succeeded" ? "—" : state === "failed" ? "$0.00" : "—")
  const refundedValue = state === "failed" ? reserved : "$0.00"
  const netValue = billed ?? (state === "succeeded" ? "—" : "$0.00")

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
        {billableQuantity != null && billableUnit ? <Line label="billable" value={`${billableQuantity} ${billableUnit}`} /> : null}
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
  errorMessage,
  model,
  providerJobID,
  retryCount,
  progress,
}: {
  state: JobStatus
  errorCode?: string
  errorMessage?: string
  model?: string
  providerJobID?: string
  retryCount?: number
  progress?: number | null
}) {
  const t = useTranslations()
  const u = t.jobs.detail.upstreamPanel
  const errorCopy = describeJobError(t, errorCode, errorMessage)

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5">
      <h2 className="text-[13px] font-medium tracking-tight">{u.title}</h2>
      <dl className="mt-4 space-y-2.5 font-mono text-[12px]">
        <Line label={u.provider} value={u.providerValue} />
        <Line label={u.model} value={model || u.modelDefault} />
        <Line label={u.retries} value={retryCount != null ? String(retryCount) : u.retriesValue} />
        {providerJobID ? <Line label="provider job" value={providerJobID} /> : null}
        {progress != null ? <Line label="progress" value={`${progress}%`} /> : null}
        {state === "failed" && errorCode && (
          <Line label={u.errorCode} value={errorCode} highlight />
        )}
      </dl>
      {state === "failed" && (errorCode || errorMessage) ? (
        <div className="mt-4 rounded-lg border border-status-failed/25 bg-status-failed-dim/10 p-3 text-[12px] text-status-failed">
          <div className="text-foreground/90">{errorCopy.summary}</div>
          {errorCopy.detail ? <div className="mt-1 text-foreground/70">{t.jobs.errors.upstream_original}: {errorCopy.detail}</div> : null}
        </div>
      ) : null}
    </section>
  )
}
