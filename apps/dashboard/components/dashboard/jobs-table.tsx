"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronDown, Copy, Download, RefreshCcw } from "lucide-react"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"

export type JobRow = {
  id: string
  status: JobStatus
  rawStatus?: string
  model: string
  prompt: string
  // localized credit cell. Use this instead of legacy `credits`.
  creditsAmount: string
  creditsKind: "reserved" | "billed" | "refunded"
  // Either an ISO timestamp or a simple "32s" ago value. We let
  // the consumer precompute relative display for now.
  submitted: string
  createdAt?: string
  startedAt?: string | null
  finishedAt?: string | null
  duration: string
  resolution?: string
  ratio?: string
  tokenCount?: number | null
  providerJobId?: string | null
  upstreamJobId?: string | null
  apiKeyHint?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  videoURL?: string
  // deprecated but tolerated
  credits?: string
}

export function JobsTable({
  rows,
  compact = false,
}: {
  rows: JobRow[]
  compact?: boolean
}) {
  const t = useTranslations()
  const [expandedId, setExpandedId] = React.useState<string | null>(rows[0]?.id ?? null)
  const [retryingId, setRetryingId] = React.useState<string | null>(null)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  const kindLabel: Record<JobRow["creditsKind"], string> = {
    reserved: t.usage.reserved.toLowerCase(),
    billed: t.usage.billed.toLowerCase(),
    refunded: t.usage.refunded.toLowerCase(),
  }

  return (
    <div className={cn("overflow-hidden", compact ? "bg-transparent" : "rounded-2xl border border-white/12 bg-card/40")}>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-card/55 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.id}</th>
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.status}</th>
              {!compact && (
                <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.key}</th>
              )}
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.prompt}</th>
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.created}</th>
              {!compact && (
                <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.duration}</th>
              )}
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.billed}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => {
              const expanded = expandedId === r.id && !compact
              const canRetry = r.rawStatus === "failed" || r.rawStatus === "timed_out" || r.status === "failed"
              return (
                <React.Fragment key={r.id}>
                  <tr
                    className={cn(
                      "group cursor-pointer transition-colors hover:bg-card/60",
                      r.status === "failed" && "bg-status-failed-dim/15",
                    )}
                    onClick={() => !compact && setExpandedId(expanded ? null : r.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!compact && (
                          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                        )}
                        <Link
                          href={`/jobs/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-[12px] text-foreground underline-offset-4 hover:underline"
                        >
                          {r.id.slice(0, 18)}…
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} label={r.rawStatus || undefined} />
                    </td>
                    {!compact && (
                      <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                        {r.model}
                      </td>
                    )}
                    <td className="max-w-[260px] truncate px-4 py-3 text-foreground/90">{r.prompt}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                      {r.submitted}
                    </td>
                    {!compact && (
                      <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                        {r.duration}
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-[12px] text-foreground/90">
                      <span>{r.creditsAmount}</span>{" "}
                      <span className="text-muted-foreground">{kindLabel[r.creditsKind]}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/jobs/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-background/40">
                      <td colSpan={8} className="px-4 pb-5 pt-1">
                        <div className="grid gap-4 rounded-lg border border-border/70 bg-card/50 p-4 lg:grid-cols-[220px_1fr]">
                          <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
                            {r.videoURL ? (
                              <video src={r.videoURL} controls className="aspect-video w-full bg-black object-contain" />
                            ) : (
                              <div className="flex aspect-video items-center justify-center px-4 text-center text-[12px] text-muted-foreground">
                                {r.status === "failed" ? "No video generated" : "Waiting for video output"}
                              </div>
                            )}
                          </div>
                          <div className="space-y-4">
                            <div>
                              <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Prompt</div>
                              <p className="text-[13px] leading-6 text-foreground/90">{r.prompt}</p>
                            </div>
                            <div className="grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                              <Meta label="Tokens" value={r.tokenCount != null ? r.tokenCount.toLocaleString() : "—"} />
                              <Meta label="Cost" value={r.creditsAmount} />
                              <Meta label="Resolution" value={r.resolution || "—"} />
                              <Meta label="Ratio" value={r.ratio || "—"} />
                              <Meta label="API key" value={r.apiKeyHint ? `${r.apiKeyHint}…` : "—"} />
                              <Meta label="Upstream" value={r.providerJobId || "—"} />
                              <Meta label="Storage" value={r.videoURL ? "upstream URL" : "—"} />
                              <Meta label="Started" value={r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"} />
                              <Meta label="Finished" value={r.finishedAt ? new Date(r.finishedAt).toLocaleString() : "—"} />
                            </div>
                            {(r.errorCode || r.errorMessage) && (
                              <div className="rounded-lg border border-status-failed/25 bg-status-failed-dim/10 p-3 text-[12.5px] text-status-failed">
                                <span className="font-mono">{r.errorCode || "failed"}</span>
                                {r.errorMessage ? <span className="ml-2 text-foreground/80">{r.errorMessage}</span> : null}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              {r.videoURL && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const url = r.videoURL!
                                    try {
                                      const res = await fetch(url, { mode: "cors", credentials: "omit" })
                                      if (!res.ok) throw new Error(String(res.status))
                                      const blob = await res.blob()
                                      const o = URL.createObjectURL(blob)
                                      const a = document.createElement("a")
                                      a.href = o
                                      a.download = `nextapi-${r.id}.mp4`
                                      a.rel = "noopener"
                                      document.body.appendChild(a)
                                      a.click()
                                      a.remove()
                                      setTimeout(() => URL.revokeObjectURL(o), 4000)
                                    } catch {
                                      const a = document.createElement("a")
                                      a.href = url
                                      a.target = "_blank"
                                      a.rel = "noopener noreferrer"
                                      a.click()
                                    }
                                  }}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-[12.5px] hover:bg-background"
                                >
                                  <Download className="size-3.5" /> Download
                                </button>
                              )}
                              {r.videoURL && (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(r.videoURL || "")
                                    setCopiedId(r.id)
                                    setTimeout(() => setCopiedId(null), 1500)
                                  }}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-[12.5px] hover:bg-background"
                                >
                                  <Copy className="size-3.5" /> {copiedId === r.id ? "Copied" : "Copy link"}
                                </button>
                              )}
                              {canRetry && (
                                <button
                                  disabled={retryingId === r.id}
                                  onClick={async () => {
                                    setRetryingId(r.id)
                                    try {
                                      const res = await apiFetch(`/v1/videos/${r.id}/retry`, { method: "POST" })
                                      if (res?.id) window.location.href = `/jobs/${res.id}`
                                    } finally {
                                      setRetryingId(null)
                                    }
                                  }}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-[12.5px] hover:bg-background disabled:opacity-50"
                                >
                                  <RefreshCcw className="size-3.5" /> {retryingId === r.id ? "Retrying" : "Retry"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/70">{label}</div>
      <div className="mt-1 truncate font-mono text-[12px] text-foreground/90">{value}</div>
    </div>
  )
}
