"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  AlertOctagon,
  ArrowUpRight,
  Banknote,
  Clock3,
  ShieldAlert,
} from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { StatusPill } from "@/components/nextapi/status-pill"
import { adminFetch } from "@/lib/admin-api"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type OverviewPayload = {
  users_total: number
  jobs_last_24h: number
  credits_used_all_time: number
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

// TODO: align with backend response — map overview fields to pulse labels (queue depth vs jobs 24h).
function mapOverviewToPulse(overview: OverviewPayload) {
  return {
    queueDepth: formatInt(overview.jobs_last_24h),
    reservedCredits: formatInt(overview.credits_used_all_time),
  }
}

export default function AdminOverviewPage() {
  const t = useTranslations()
  const [overview, setOverview] = useState<OverviewPayload | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingOverview(true)
      setOverviewError(null)
      try {
        const data = (await adminFetch("/overview")) as OverviewPayload
        if (!cancelled) setOverview(data)
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setOverviewError(e instanceof Error ? e.message : "Failed to load overview")
        }
      } finally {
        if (!cancelled) setLoadingOverview(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const pulseFromApi = overview ? mapOverviewToPulse(overview) : null

  return (
    <AdminShell
      activeHref="/"
      title={t.admin.title}
      description={t.admin.subtitle}
      meta={
        <>
          <span>{t.common.region} · us-east-1</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{t.admin.overviewPage.windowLast60m}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{t.common.autoRefresh.toLowerCase()} 10s</span>
          {loadingOverview && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground">{t.common.loading}…</span>
            </>
          )}
        </>
      }
      actions={
        <>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12px] text-foreground hover:bg-card">
            {t.common.export}
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground/90">
            {t.nav.admin.runbooks}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6 p-6">
        {overviewError && (
          <div className="rounded-lg border border-status-failed/30 bg-status-failed/10 px-4 py-2 font-mono text-[11px] text-status-failed">
            {overviewError}
          </div>
        )}
        {/* System pulse strip */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/80 md:grid-cols-5">
          <Pulse
            label={t.admin.pulse.upstream}
            value={t.admin.pulse.healthy}
            tone="success"
            sub={t.admin.pulse.upstreamHint}
          />
          <Pulse
            label={t.admin.pulse.queueDepth}
            value={pulseFromApi?.queueDepth ?? "14"}
            tone="default"
            sub={t.admin.pulse.queueDepthHint}
          />
          <Pulse
            label={t.admin.pulse.successRate}
            value="99.4%"
            tone="success"
            sub={t.admin.pulse.successRateHint}
          />
          <Pulse
            label={t.admin.pulse.webhookDelivery}
            value="99.97%"
            tone="success"
            sub={t.admin.pulse.webhookDeliveryHint}
          />
          <Pulse
            label={t.admin.pulse.reservedCredits}
            value={pulseFromApi?.reservedCredits ?? "8,412"}
            tone="warn"
            sub={t.admin.pulse.reservedCreditsHint}
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          {/* Jobs requiring attention */}
          <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
            <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="size-4 text-status-failed" />
                <h2 className="text-[13.5px] font-medium tracking-tight">
                  {t.admin.attention.title}
                </h2>
                <span className="rounded-sm bg-status-failed/15 px-1.5 py-0.5 font-mono text-[10px] text-status-failed">
                  7
                </span>
              </div>
              <Link
                href="/attention"
                className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                {t.common.viewAll}
                <ArrowUpRight className="size-3" />
              </Link>
            </header>

            <div className="divide-y divide-border/60 font-mono text-[12px]">
              <AttentionRow
                id="job_7Hc9Xk2Lm3NpQ4rS"
                org="linear-media"
                reason={t.admin.attention.rules.upstreamTimeout}
                amount={`${t.usage.refunded} 1.00`}
                tone="failed"
                age="2m"
                inspectLabel={t.admin.attention.actions.inspect.toLowerCase()}
              />
              <AttentionRow
                id="job_4Pt8Yz0Qj9WxVb1A"
                org="acme-prod"
                reason={t.admin.attention.rules.webhookFailing}
                amount="—"
                tone="failed"
                age="6m"
                inspectLabel={t.admin.attention.actions.inspect.toLowerCase()}
              />
              <AttentionRow
                id="job_2Lm0FhRk8NeGxT3C"
                org="parallax-studio"
                reason={t.admin.attention.rules.stuck}
                amount="—"
                tone="warn"
                age="11m"
                inspectLabel={t.admin.attention.actions.inspect.toLowerCase()}
              />
              <AttentionRow
                id="job_9Qr5Dp7Bj1OeNm6X"
                org="northwind-labs"
                reason={t.admin.attention.rules.refundDrift}
                amount={`${t.usage.refunded} 1.00`}
                tone="warn"
                age="18m"
                inspectLabel={t.admin.attention.actions.inspect.toLowerCase()}
              />
              <AttentionRow
                id="job_6Xw3Nv2Hc8MkLp4Y"
                org="acme-prod"
                reason={t.admin.attention.rules.policyViolation}
                amount={`${t.usage.refunded} 1.00`}
                tone="failed"
                age="24m"
                inspectLabel={t.admin.attention.actions.inspect.toLowerCase()}
              />
              <AttentionRow
                id="job_3Bf0Kq9Uj2IwAa5R"
                org="stellar-post"
                reason={t.admin.attention.rules.ipAllowlist}
                amount="hold"
                tone="failed"
                age="31m"
                inspectLabel={t.admin.attention.actions.inspect.toLowerCase()}
              />
              <AttentionRow
                id="job_8Vn7Mj4Tp1LyFb2Q"
                org="acme-prod"
                reason={t.admin.attention.rules.rotationOverdue}
                amount="—"
                tone="warn"
                age="44m"
                inspectLabel={t.admin.attention.actions.inspect.toLowerCase()}
              />
            </div>
            <div className="flex items-center justify-between border-t border-border/60 bg-background/30 px-5 py-2.5">
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {t.admin.attention.subtitle}
              </span>
              <button className="font-mono text-[10.5px] text-muted-foreground hover:text-foreground">
                {t.common.configure.toLowerCase()}
              </button>
            </div>
          </section>

          {/* Incidents + credit adjustments stack */}
          <div className="flex flex-col gap-6">
            <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
              <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-status-running" />
                  <h2 className="text-[13.5px] font-medium tracking-tight">
                    {t.admin.incidents.title}
                  </h2>
                </div>
                <Link
                  href="/incidents"
                  className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                >
                  {t.common.viewAll}
                  <ArrowUpRight className="size-3" />
                </Link>
              </header>
              <ul className="divide-y divide-border/60 text-[12.5px]">
                <IncidentRow
                  level="monitoring"
                  levelLabel={t.common.monitoring.toLowerCase()}
                  title={t.admin.overviewPage.incidentFeed.monitoringTitle}
                  since={t.admin.overviewPage.incidentFeed.monitoringSince}
                  note={t.admin.overviewPage.incidentFeed.monitoringNote}
                />
                <IncidentRow
                  level="resolved"
                  levelLabel={t.common.resolved.toLowerCase()}
                  title={t.admin.overviewPage.incidentFeed.resolvedTitle}
                  since={t.admin.overviewPage.incidentFeed.resolvedSince}
                  note={t.admin.overviewPage.incidentFeed.resolvedNote}
                />
                <IncidentRow
                  level="scheduled"
                  levelLabel={t.common.scheduled.toLowerCase()}
                  title={t.admin.overviewPage.incidentFeed.scheduledTitle}
                  since={t.admin.overviewPage.incidentFeed.scheduledSince}
                  note={t.admin.overviewPage.incidentFeed.scheduledNote}
                />
              </ul>
            </section>

            <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
              <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Banknote className="size-4 text-signal" />
                  <h2 className="text-[13.5px] font-medium tracking-tight">
                    {t.admin.credits.title}
                  </h2>
                </div>
                <Link
                  href="/credits"
                  className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                >
                  {t.admin.credits.ledger}
                  <ArrowUpRight className="size-3" />
                </Link>
              </header>
              <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
                <AdjRow
                  org="linear-media"
                  delta="+120.00"
                  reason={t.admin.overviewPage.adjReasons.goodwillCredit}
                  by="m. winters"
                />
                <AdjRow
                  org="acme-prod"
                  delta="−8.42"
                  reason={t.admin.overviewPage.adjReasons.refundReconciliation}
                  by="s. patel"
                />
                <AdjRow
                  org="parallax-studio"
                  delta="+500.00"
                  reason={t.admin.overviewPage.adjReasons.topUpPurchase}
                  by="billing-bot"
                />
                <AdjRow
                  org="northwind-labs"
                  delta="+14.00"
                  reason={t.admin.overviewPage.adjReasons.failedJobRefund}
                  by="j. li"
                />
              </ul>
              <div className="flex items-center justify-between border-t border-border/60 bg-background/30 px-5 py-2.5">
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  {t.admin.credits.threshold}: {t.admin.credits.thresholdValue}
                </span>
                <button className="font-mono text-[10.5px] text-foreground hover:text-signal">
                  {t.admin.credits.newAdjustment.toLowerCase()}
                </button>
              </div>
            </section>
          </div>
        </div>

        {/* Live event feed */}
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <Clock3 className="size-4 text-muted-foreground" />
              <h2 className="text-[13.5px] font-medium tracking-tight">
                {t.admin.liveFeed.title}
              </h2>
              <StatusPill status="running" label={t.admin.liveFeed.tailing} size="sm" />
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <button className="rounded-md border border-border/80 bg-card/40 px-2 py-0.5 text-foreground">
                {t.admin.liveFeed.allEvents}
              </button>
              <button className="rounded-md px-2 py-0.5 hover:text-foreground">job.*</button>
              <button className="rounded-md px-2 py-0.5 hover:text-foreground">webhook.*</button>
              <button className="rounded-md px-2 py-0.5 hover:text-foreground">billing.*</button>
            </div>
          </header>
          <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
            <EventRow
              ts="22:14:03.812"
              ev="job.succeeded"
              org="acme-prod"
              meta="billed=0.84 · 38.7s · seedance-2.0-pro"
              tone="success"
            />
            <EventRow
              ts="22:14:03.411"
              ev="webhook.delivered"
              org="acme-prod"
              meta="200 · 142ms · https://acme.com/hooks/nextapi"
              tone="success"
            />
            <EventRow
              ts="22:14:02.954"
              ev="job.running"
              org="linear-media"
              meta="pool=A · region=us-east-1"
              tone="running"
            />
            <EventRow
              ts="22:14:02.601"
              ev="job.queued"
              org="parallax-studio"
              meta="position=2 · eta=14s"
              tone="queued"
            />
            <EventRow
              ts="22:14:02.188"
              ev="credit.reserved"
              org="northwind-labs"
              meta="+1.00 · idem=b7e3a1d9"
              tone="default"
            />
            <EventRow
              ts="22:14:01.744"
              ev="job.failed"
              org="stellar-post"
              meta={`content_policy.pre · ${t.usage.refunded.toLowerCase()}=1.00`}
              tone="failed"
            />
            <EventRow
              ts="22:14:01.321"
              ev="webhook.delivered"
              org="stellar-post"
              meta="200 · 98ms · https://stellar.io/nx"
              tone="success"
            />
            <EventRow
              ts="22:14:00.902"
              ev="key.used"
              org="acme-prod"
              meta="sk_live_7Hc9…4rS · 142 rps (60s)"
              tone="default"
            />
          </ul>
        </section>
      </div>
    </AdminShell>
  )
}

function Pulse({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string
  value: string
  sub: string
  tone?: "success" | "warn" | "failed" | "default"
}) {
  return (
    <div className="flex flex-col justify-between bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "success" && "bg-status-success",
            tone === "warn" && "bg-status-running",
            tone === "failed" && "bg-status-failed",
            tone === "default" && "bg-muted-foreground",
          )}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-3 text-[22px] font-medium tracking-tight text-foreground">{value}</div>
      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{sub}</div>
    </div>
  )
}

function AttentionRow({
  id,
  org,
  reason,
  amount,
  age,
  tone,
  inspectLabel,
}: {
  id: string
  org: string
  reason: string
  amount: string
  age: string
  tone: "failed" | "warn"
  inspectLabel: string
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "failed" ? "bg-status-failed" : "bg-status-running",
        )}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-foreground">{id}</span>
          <span className="text-muted-foreground">·</span>
          <span className="truncate text-muted-foreground">{org}</span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{reason}</div>
      </div>
      <span
        className={cn(
          "text-[11.5px]",
          tone === "failed" ? "text-status-failed" : "text-status-running",
        )}
      >
        {amount}
      </span>
      <span className="w-10 text-right text-muted-foreground">{age}</span>
      <Link
        href={`https://dash.nextapi.top/jobs/${id}`}
        className="rounded-md border border-border/80 bg-card/40 px-2 py-0.5 text-[10.5px] text-foreground hover:bg-card"
      >
        {inspectLabel}
      </Link>
    </div>
  )
}

function IncidentRow({
  level,
  levelLabel,
  title,
  since,
  note,
}: {
  level: "monitoring" | "resolved" | "scheduled"
  levelLabel: string
  title: string
  since: string
  note: string
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        className={cn(
          "mt-1.5 size-1.5 rounded-full",
          level === "monitoring" && "bg-status-running op-pulse",
          level === "resolved" && "bg-status-success",
          level === "scheduled" && "bg-status-queued",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-foreground">{title}</span>
          <span
            className={cn(
              "font-mono text-[10.5px]",
              level === "monitoring" && "text-status-running",
              level === "resolved" && "text-status-success",
              level === "scheduled" && "text-status-queued",
            )}
          >
            {levelLabel} · {since}
          </span>
        </div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">{note}</div>
      </div>
    </li>
  )
}

function AdjRow({
  org,
  delta,
  reason,
  by,
}: {
  org: string
  delta: string
  reason: string
  by: string
}) {
  const positive = delta.trim().startsWith("+")
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-foreground">{org}</span>
          <span className={positive ? "text-status-success" : "text-status-failed"}>{delta}</span>
        </div>
        <div className="mt-0.5 truncate text-muted-foreground">{reason}</div>
      </div>
      <span className="text-muted-foreground">{by}</span>
    </li>
  )
}

function EventRow({
  ts,
  ev,
  org,
  meta,
  tone,
}: {
  ts: string
  ev: string
  org: string
  meta: string
  tone: "success" | "failed" | "running" | "queued" | "default"
}) {
  return (
    <li className="grid grid-cols-[100px_180px_140px_1fr] items-center gap-4 px-5 py-2">
      <span className="text-muted-foreground">{ts}</span>
      <span
        className={cn(
          tone === "success" && "text-status-success",
          tone === "failed" && "text-status-failed",
          tone === "running" && "text-status-running",
          tone === "queued" && "text-status-queued",
          tone === "default" && "text-foreground/90",
        )}
      >
        {ev}
      </span>
      <span className="text-foreground/90">{org}</span>
      <span className="truncate text-muted-foreground">{meta}</span>
    </li>
  )
}
