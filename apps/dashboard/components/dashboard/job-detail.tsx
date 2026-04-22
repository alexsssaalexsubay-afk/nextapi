"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Copy,
  Download,
  ExternalLink,
  PauseCircle,
  Play,
  RefreshCcw,
  XCircle,
} from "lucide-react"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { CodeBlock } from "@/components/nextapi/code-block"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

export function JobDetail({ jobId }: { jobId: string }) {
  const t = useTranslations()
  const td = t.jobs.detail
  const stateLabels = t.jobs.states

  const [state, setState] = useState<JobStatus>("running")

  const tabs: { key: JobStatus; label: string }[] = [
    { key: "submitting", label: stateLabels.submitting },
    { key: "queued", label: stateLabels.queued },
    { key: "running", label: stateLabels.running },
    { key: "succeeded", label: stateLabels.succeeded },
    { key: "failed", label: stateLabels.failed },
  ]

  return (
    <div className="space-y-6 p-6">
      {/* State switcher — this is a design/prototype convenience so you can see every state */}
      <div className="flex items-center justify-between rounded-lg border border-dashed border-border/80 bg-card/30 p-3">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.14em]">{td.previewStatus}</span>
          <span className="text-muted-foreground/60">—</span>
          <span>{td.previewHint}</span>
        </div>
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setState(tab.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11.5px] transition-colors",
                state === tab.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <StatusPill status={state} size="md" />
            <span className="font-mono text-[12.5px] text-muted-foreground">
              {jobId}
            </span>
            <button
              aria-label={t.common.copy}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3.5" />
            </button>
          </div>
          <h1 className="max-w-[720px] text-[22px] font-medium leading-tight tracking-tight">
            {state === "failed" ? td.promptFailed : td.promptSucceeded}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {td.metaLine}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(state === "queued" || state === "running" || state === "submitting") && (
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card">
              <XCircle className="size-3.5" />
              {td.cancelJob}
            </button>
          )}
          {state === "failed" && (
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:bg-foreground/90">
              <RefreshCcw className="size-3.5" />
              {td.retrySame}
            </button>
          )}
          {state === "succeeded" && (
            <>
              <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card">
                <Download className="size-3.5" />
                {td.downloadMp4}
              </button>
              <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:bg-foreground/90">
                <Play className="size-3.5" />
                {td.regenerate}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div className="space-y-6">
          <OutputPanel state={state} />
          <PayloadPanel />
          <EventsPanel state={state} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <TimelinePanel state={state} />
          <BillingPanel state={state} />
          <UpstreamPanel state={state} />
        </div>
      </div>
    </div>
  )
}

function OutputPanel({ state }: { state: JobStatus }) {
  const t = useTranslations()
  const td = t.jobs.detail

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h2 className="text-[13px] font-medium tracking-tight">{td.outputPanel.title}</h2>
        {state === "succeeded" && (
          <a
            href="#"
            className="inline-flex items-center gap-1 font-mono text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            cdn.nextapi.dev/out/7Hc9Xk2Lm3NpQ4rS.mp4
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="relative aspect-video overflow-hidden bg-[oklch(0.11_0.004_260)]">
        {state === "submitting" && <SubmittingView />}
        {state === "queued" && <QueuedView />}
        {state === "running" && <RunningView />}
        {state === "succeeded" && <SucceededView />}
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
      <div className="font-mono text-[11px] text-muted-foreground">
        {o.runningElapsed}
      </div>
    </div>
  )
}

function SucceededView() {
  const t = useTranslations()
  const o = t.jobs.detail.outputPanel
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-dots opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.08_0.01_260)] via-[oklch(0.14_0.01_220)] to-[oklch(0.2_0.05_170)]" />
      <div className="absolute inset-0 flex items-end p-6">
        <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2 backdrop-blur-md">
          <button className="inline-flex size-8 items-center justify-center rounded-full bg-foreground text-background">
            <Play className="size-3.5 translate-x-px" />
          </button>
          <div className="font-mono text-[11.5px] text-foreground/90">00:00 / 00:06</div>
          <div className="mx-3 h-1 w-32 overflow-hidden rounded-full bg-border">
            <div className="h-full w-0 bg-signal" />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">{o.succeededFps}</span>
        </div>
      </div>
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
      <a
        href="#"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        {o.viewPayload}
        <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

function PayloadPanel() {
  const t = useTranslations()
  const r = t.jobs.detail.request

  return (
    <CodeBlock
      filename="request.json"
      tabs={[
        {
          label: r.submitted,
          language: "json",
          code: `{
  "model": "seedance-2.0-pro",
  "prompt": "Drone orbiting a lighthouse at dusk, cinematic, 35mm",
  "duration": 6,
  "resolution": "1080p",
  "seed": 42,
  "webhook_url": "https://acme.com/hooks/nextapi"
}`,
        },
        {
          label: r.responseAccepted,
          language: "json",
          code: `{
  "job_id": "job_7Hc9Xk2Lm3NpQ4rS",
  "status": "queued",
  "reserved": 1.00,
  "eta_seconds": 38,
  "submitted_at": "2026-04-22T17:02:33Z"
}`,
        },
      ]}
    />
  )
}

function EventsPanel({ state }: { state: JobStatus }) {
  const t = useTranslations()
  const e = t.jobs.detail.events

  const rows = [
    { t: "17:02:33.124", ev: "job.submitted", note: "reservation=1.00, idem=9c4fa1b2", color: "queued" },
    state !== "submitting" && {
      t: "17:02:33.412",
      ev: "job.queued",
      note: "upstream_ack rid=seed_b12..e9",
      color: "queued",
    },
    (state === "running" || state === "succeeded" || state === "failed") && {
      t: "17:02:35.218",
      ev: "job.running",
      note: "region=us-east-1, pool=A",
      color: "running",
    },
    state === "succeeded" && {
      t: "17:03:11.841",
      ev: "job.succeeded",
      note: "billed=0.84, duration=38.7s",
      color: "success",
    },
    state === "failed" && {
      t: "17:02:46.902",
      ev: "job.failed",
      note: "upstream_content_policy, refunded=1.00",
      color: "failed",
    },
    state === "succeeded" && {
      t: "17:03:12.061",
      ev: "webhook.delivered",
      note: "200 · https://acme.com/hooks/nextapi",
      color: "success",
    },
    state === "failed" && {
      t: "17:02:47.110",
      ev: "webhook.delivered",
      note: "200 · https://acme.com/hooks/nextapi",
      color: "success",
    },
  ].filter(Boolean) as { t: string; ev: string; note: string; color: string }[]

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h2 className="text-[13px] font-medium tracking-tight">{e.title}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{e.retention}</span>
      </div>
      <ul className="divide-y divide-border/60 font-mono text-[12px]">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-2.5">
            <span className="w-24 shrink-0 text-muted-foreground">{r.t}</span>
            <span
              className={cn(
                "w-32 shrink-0",
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
            <span className="w-24 shrink-0">—</span>
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

function TimelinePanel({ state }: { state: JobStatus }) {
  const t = useTranslations()
  const tp = t.jobs.detail.timelinePanel

  const steps = [
    {
      label: tp.submitted,
      time: "0.000s",
      done: state !== "submitting",
      active: state === "submitting",
    },
    {
      label: tp.queued,
      time: "+0.28s",
      done: ["running", "succeeded", "failed"].includes(state),
      active: state === "queued",
    },
    {
      label: tp.running,
      time: "+2.09s",
      done: ["succeeded", "failed"].includes(state),
      active: state === "running",
    },
    {
      label: state === "failed" ? tp.failed : tp.webhookDelivered,
      time: state === "failed" ? "+13.78s" : "+38.92s",
      done: state === "succeeded" || state === "failed",
      failed: state === "failed",
      active: false,
    },
  ]

  const suffix =
    state === "succeeded"
      ? `${tp.totalPrefix} 38.92s`
      : state === "failed"
        ? `${tp.totalPrefix} 13.78s`
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

function BillingPanel({ state }: { state: JobStatus }) {
  const t = useTranslations()
  const b = t.jobs.detail.billingPanel

  const billedLabel =
    state === "failed" ? b.billedFailed : state === "succeeded" ? b.billedSuccess : b.pendingBill

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5">
      <h2 className="text-[13px] font-medium tracking-tight">{b.title}</h2>
      <dl className="mt-4 space-y-2.5 font-mono text-[12.5px]">
        <Line label={b.reservedOnSubmit} value="1.00" />
        <Line
          label={billedLabel}
          value={state === "succeeded" ? "0.84" : state === "failed" ? "0.00" : "—"}
        />
        <Line
          label={b.refunded}
          value={state === "failed" ? "1.00" : "0.00"}
          highlight={state === "failed"}
        />
        <div className="h-px bg-border/60" />
        <Line
          label={b.netCredits}
          value={state === "succeeded" ? "0.84" : state === "failed" ? "0.00" : "—"}
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

function UpstreamPanel({ state }: { state: JobStatus }) {
  const t = useTranslations()
  const u = t.jobs.detail.upstreamPanel

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5">
      <h2 className="text-[13px] font-medium tracking-tight">{u.title}</h2>
      <dl className="mt-4 space-y-2.5 font-mono text-[12px]">
        <Line label={u.provider} value="seedance.bytedance" />
        <Line label={u.model} value="seedance-2.0-pro" />
        <Line label={u.requestId} value="seed_b12f3a…e9" />
        <Line label={u.regionPool} value="us-east-1 / pool-A" />
        <Line label={u.retries} value={u.retriesValue} />
        {state === "failed" && (
          <Line label={u.errorCode} value="content_policy.pre" highlight />
        )}
      </dl>
    </section>
  )
}
