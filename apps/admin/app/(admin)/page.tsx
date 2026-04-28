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

function mapOverviewToPulse(overview: OverviewPayload) {
  return {
    usersTotal: formatInt(overview.users_total),
    jobs24h: formatInt(overview.jobs_last_24h),
    creditsUsed: formatInt(overview.credits_used_all_time),
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
          <button
            type="button"
            disabled
            title={t.common.disabled}
            className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-full border border-white/12 bg-card/40 px-3 text-[12px] text-muted-foreground opacity-60 shadow-sm backdrop-blur-md"
          >
            {t.common.export}
          </button>
          <a
            href="https://docs.nextapi.top"
            target="_blank"
            rel="noreferrer"
            className="premium-button inline-flex h-8 items-center gap-1.5 rounded-full border border-white/20 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.42),transparent_30%),linear-gradient(110deg,#2563eb_0%,#7c3aed_42%,#db2777_100%)] px-3 text-[12px] font-medium text-white"
          >
            {t.nav.admin.runbooks}
          </a>
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
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/12 bg-border/60 shadow-[0_24px_80px_-60px] shadow-status-failed md:grid-cols-5">
          <Pulse
            label={t.admin.pulse.upstream}
            value={t.admin.pulse.unavailable}
            tone="default"
            sub={t.admin.overviewPage.realDataOnly}
          />
          <Pulse
            label={t.admin.pulse.jobs24h}
            value={pulseFromApi?.jobs24h ?? "—"}
            tone="default"
            sub={t.admin.pulse.jobs24hHint}
          />
          <Pulse
            label={t.admin.pulse.successRate}
            value="—"
            tone="default"
            sub={t.admin.overviewPage.realDataOnly}
          />
          <Pulse
            label={t.admin.pulse.webhookDelivery}
            value="—"
            tone="default"
            sub={t.admin.overviewPage.realDataOnly}
          />
          <Pulse
            label={t.admin.pulse.creditsUsed}
            value={pulseFromApi?.creditsUsed ?? "—"}
            tone="warn"
            sub={t.admin.pulse.creditsUsedHint}
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          {/* Jobs requiring attention */}
          <section className="premium-surface overflow-hidden rounded-3xl">
            <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="size-4 text-status-failed" />
                <h2 className="text-[13.5px] font-medium tracking-tight">
                  {t.admin.attention.title}
                </h2>
              </div>
              <Link
                href="/attention"
                className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                {t.common.viewAll}
                <ArrowUpRight className="size-3" />
              </Link>
            </header>

            <OperatorEmptyState icon={AlertOctagon} message={t.admin.overviewPage.noAttentionData} />
            <div className="flex items-center justify-between border-t border-border/60 bg-background/30 px-5 py-2.5">
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {t.admin.attention.subtitle}
              </span>
              <Link href="/attention" className="font-mono text-[10.5px] text-muted-foreground hover:text-foreground">
                {t.common.configure.toLowerCase()}
              </Link>
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
              <OperatorEmptyState icon={ShieldAlert} message={t.admin.overviewPage.noIncidentData} compact />
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
              <OperatorEmptyState icon={Banknote} message={t.admin.overviewPage.noLedgerPreview} compact />
              <div className="flex items-center justify-between border-t border-border/60 bg-background/30 px-5 py-2.5">
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  {t.admin.credits.threshold}: {t.admin.credits.thresholdValue}
                </span>
                <Link href="/credits" className="font-mono text-[10.5px] text-foreground hover:text-signal">
                  {t.admin.credits.newAdjustment.toLowerCase()}
                </Link>
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
              <StatusPill status="queued" label={t.admin.pulse.unavailable} size="sm" />
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="rounded-md border border-border/80 bg-card/40 px-2 py-0.5 text-foreground">
                {t.admin.liveFeed.allEvents}
              </span>
              <span className="rounded-md px-2 py-0.5 text-muted-foreground/60">job.*</span>
              <span className="rounded-md px-2 py-0.5 text-muted-foreground/60">webhook.*</span>
              <span className="rounded-md px-2 py-0.5 text-muted-foreground/60">billing.*</span>
            </div>
          </header>
          <OperatorEmptyState icon={Clock3} message={t.admin.overviewPage.noLiveFeed} />
        </section>
      </div>
    </AdminShell>
  )
}

function OperatorEmptyState({
  icon: Icon,
  message,
  compact = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  message: string
  compact?: boolean
}) {
  return (
    <div className={cn("grid place-items-center px-5 text-center", compact ? "min-h-36 py-8" : "min-h-64 py-12")}>
      <div className="max-w-md">
        <div className="mx-auto flex size-10 items-center justify-center rounded-2xl border border-white/12 bg-background/55 text-muted-foreground shadow-sm backdrop-blur-md">
          <Icon className="size-4" />
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </div>
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
        href={`https://app.nextapi.top/jobs/${id}`}
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
