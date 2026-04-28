"use client"

import * as React from "react"
import Link from "next/link"
import { Activity, ArrowRight, BookOpen, Bot, CheckCircle2, CreditCard, Gauge, KeyRound, Play, Webhook } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { JobsTable, type JobRow } from "@/components/dashboard/jobs-table"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch } from "@/lib/api"
import type { JobStatus } from "@/components/nextapi/status-pill"
import { cn } from "@/lib/utils"

type AuthMe = {
  org?: { id: string; name: string }
  balance?: number
  api_keys_active?: number
}

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
  const credits = `$${(v.estimated_cost_cents / 100).toFixed(2)}`
  const kind: JobRow["creditsKind"] =
    status === "failed" ? "refunded" : status === "succeeded" ? "billed" : "reserved"
  return {
    id: v.id,
    status,
    model: v.model || "seedance-2.0-pro",
    prompt: "",
    submitted: relTime(v.created_at),
    duration: "—",
    creditsAmount: credits,
    creditsKind: kind,
  }
}

export default function DashboardHome() {
  const t = useTranslations()
  const [me, setMe] = React.useState<AuthMe | null>(null)
  const [jobs, setJobs] = React.useState<JobRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [meRes, vidsRes] = await Promise.all([
          apiFetch("/v1/auth/me").catch(() => null),
          apiFetch("/v1/videos?limit=10").catch(() => null),
        ])
        if (cancelled) return
        if (meRes) setMe(meRes as AuthMe)
        if (vidsRes && Array.isArray(vidsRes.data)) {
          setJobs((vidsRes.data as VideoListItem[]).map(toJobRow))
        } else {
          setJobs([])
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t.common.loadFailed)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const credits = me?.balance != null ? `$${(me.balance / 100).toFixed(2)}` : "—"
  const activeKeys = me?.api_keys_active != null ? String(me.api_keys_active) : "—"
  const jobsTodayValue = jobs ? String(jobs.length) : "—"
  const hasJobs = (jobs?.length ?? 0) > 0
  const hasApiKey = me?.api_keys_active != null && me.api_keys_active > 0
  const readinessItems = [
    { id: "account", done: Boolean(me), icon: CheckCircle2, label: t.dashboard.onboarding.step1.title },
    { id: "key", done: hasApiKey, icon: KeyRound, label: t.dashboard.onboarding.step2.title },
    { id: "job", done: hasJobs, icon: Play, label: t.dashboard.onboarding.step3.title },
    { id: "webhook", done: false, icon: Webhook, label: t.dashboard.onboarding.step4.title, optional: true },
  ]
  const readinessDone = readinessItems.filter((item) => item.done).length
  const readinessPct = Math.round((readinessDone / readinessItems.length) * 100)

  return (
    <DashboardShell
      activeHref="/"
      title={t.dashboard.title}
      description={t.dashboard.subtitle}
      actions={
        <>
          <Link href="https://nextapi.top/docs" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12.5px] shadow-sm transition-colors hover:bg-accent">
            <BookOpen className="size-3.5" />
            {t.common.readDocs}
          </Link>
          <Link href="/jobs/new" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12.5px] font-medium text-background shadow-sm transition-opacity hover:opacity-90">
            <Play className="size-3.5" />
            {t.dashboard.onboarding.step3.title}
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-border bg-card/82 p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                <StatusBadge>{t.dashboard.command.workspace}</StatusBadge>
                <span className="truncate">{me?.org?.name ?? "NextAPI"}</span>
                <span className="hidden text-border sm:inline">/</span>
                <span>{t.dashboard.readiness.progress}: {readinessPct}%</span>
              </div>
              <h2 className="mt-3 max-w-3xl text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {t.dashboard.command.title}
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
                {t.dashboard.command.subtitle}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[520px]">
              <MetricTile label={t.dashboard.stats.available} value={credits} caption={me ? t.dashboard.stats.availableHint : t.common.loading} icon={CreditCard} tone="success" />
              <MetricTile label={t.dashboard.stats.activeKeys} value={activeKeys} caption={t.dashboard.stats.activeKeysHint} icon={KeyRound} tone="signal" />
              <MetricTile label={t.dashboard.stats.jobsToday} value={jobsTodayValue} caption={t.dashboard.stats.jobsTodayHint} icon={Activity} tone="signal" />
              <MetricTile label={t.dashboard.stats.webhookHealth} value="—" caption={t.dashboard.stats.webhookHealthHint} icon={Webhook} tone="muted" />
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-xl border border-border bg-card/82 p-4 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[15px] font-medium tracking-tight text-foreground">
                  {t.dashboard.quickActions.title}
                </h2>
                <p className="mt-1 text-[12.5px] text-muted-foreground">{t.dashboard.quickActions.subtitle}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <ActionTile
                href="/director"
                icon={Bot}
                label={t.dashboard.quickActions.director.title}
                description={t.dashboard.quickActions.director.description}
                primary
              />
              <ActionTile
                href="/jobs/new"
                icon={Play}
                label={t.dashboard.quickActions.newJob.title}
                description={t.dashboard.quickActions.newJob.description}
              />
              <ActionTile
                href="/keys"
                icon={KeyRound}
                label={t.dashboard.quickActions.keys.title}
                description={t.dashboard.quickActions.keys.description}
              />
              <ActionTile
                href="/usage"
                icon={Gauge}
                label={t.dashboard.quickActions.usage.title}
                description={t.dashboard.quickActions.usage.description}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card/82 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-medium tracking-tight text-foreground">
                  {t.dashboard.readiness.title}
                </h2>
                <p className="mt-1 text-[12.5px] text-muted-foreground">{t.dashboard.readiness.subtitle}</p>
              </div>
              <span className="font-mono text-[12px] text-muted-foreground">{readinessDone}/{readinessItems.length}</span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-signal transition-all duration-500" style={{ width: `${readinessPct}%` }} />
            </div>
            <div className="mt-3 divide-y divide-border">
              {readinessItems.map((item) => (
                <MissionStep
                  key={item.id}
                  done={item.done}
                  icon={item.icon}
                  label={item.label}
                  statusLabel={item.done ? t.dashboard.readiness.done : item.optional ? t.dashboard.readiness.optional : t.dashboard.readiness.waiting}
                />
              ))}
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card/82 shadow-sm">
          <div className="flex items-end justify-between border-b border-border bg-muted/20 px-4 py-3">
            <div>
              <h2 className="text-[15px] font-medium tracking-tight text-foreground">
                {t.dashboard.recentJobs.title}
              </h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{t.dashboard.recentJobs.subtitle}</p>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
            >
              {t.dashboard.recentJobs.viewAll}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {jobs === null ? (
            <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
              {t.common.loading}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyJobs title={t.jobs.empty.title} cta={t.dashboard.recentJobs.newJob} />
          ) : (
            <JobsTable rows={jobs} compact />
          )}
        </section>
      </div>
    </DashboardShell>
  )
}

function MissionStep({
  done,
  icon: Icon,
  label,
  statusLabel,
}: {
  done: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  statusLabel: string
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${done ? "border-status-success/40 bg-status-success/10 text-status-success" : "border-border bg-background text-muted-foreground"}`}>
        {done ? <CheckCircle2 className="size-3.5" /> : <Icon className="size-3.5" />}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={cn(
        "rounded-md border px-1.5 py-0.5 text-[10.5px]",
        done
          ? "border-status-success/30 bg-status-success/10 text-status-success"
          : "border-border bg-background text-muted-foreground",
      )}>
        {statusLabel}
      </span>
    </div>
  )
}

function EmptyJobs({ title, cta }: { title: string; cta: string }) {
  return (
    <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-border bg-background text-signal shadow-sm">
          <Play className="size-5" />
        </div>
        <div className="mt-4 text-sm font-medium">{title}</div>
        <Link href="/jobs/new" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-[12.5px] font-medium text-background shadow-sm transition-opacity hover:opacity-90">
          {cta}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-status-success/35 bg-status-success/10 px-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-status-success">
      {children}
    </span>
  )
}

function MetricTile({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  caption: string
  icon: React.ComponentType<{ className?: string }>
  tone: "signal" | "success" | "muted"
}) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <Icon className={cn(
          "size-3.5 shrink-0",
          tone === "success" && "text-status-success",
          tone === "signal" && "text-signal",
          tone === "muted" && "text-muted-foreground",
        )} />
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 truncate text-[12px] text-muted-foreground">{caption}</div>
    </div>
  )
}

function ActionTile({
  href,
  icon: Icon,
  label,
  description,
  primary = false,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[92px] items-start gap-3 rounded-lg border p-3 transition-colors",
        primary
          ? "border-signal/35 bg-signal/10 hover:bg-signal/15"
          : "border-border bg-background/70 hover:bg-accent",
      )}
    >
      <span className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border",
        primary
          ? "border-signal/35 bg-background text-signal"
          : "border-border bg-card text-muted-foreground group-hover:text-foreground",
      )}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-[13.5px] font-medium text-foreground">
          {label}
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </Link>
  )
}
