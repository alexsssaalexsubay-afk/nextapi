"use client"

import * as React from "react"
import Link from "next/link"
import { Activity, ArrowRight, BookOpen, CheckCircle2, CreditCard, KeyRound, Play, Sparkles, Webhook } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist"
import { StatCard } from "@/components/dashboard/stat-card"
import { JobsTable, type JobRow } from "@/components/dashboard/jobs-table"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch } from "@/lib/api"
import type { JobStatus } from "@/components/nextapi/status-pill"

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

  return (
    <DashboardShell
      activeHref="/"
      title={t.dashboard.title}
      description={t.dashboard.subtitle}
      actions={
        <>
          <Link href="https://nextapi.top/docs" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/12 bg-card/55 px-3 text-[12.5px] shadow-sm backdrop-blur-md">
            <BookOpen className="size-3.5" />
            {t.common.readDocs}
          </Link>
          <Link href="/jobs/new" className="premium-button inline-flex h-8 items-center gap-1.5 rounded-full border border-white/20 px-3 text-[12.5px] font-medium text-white">
            <Play className="size-3.5" />
            {t.dashboard.onboarding.step3.title}
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <section className="premium-surface relative overflow-hidden rounded-[24px] p-4 sm:p-5">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-56 w-72 rounded-full bg-fuchsia-500/16 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute bottom-[-120px] left-1/4 h-56 w-[400px] rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_380px]">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-background/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal shadow-sm backdrop-blur-md">
                <Sparkles className="size-3" />
                {t.dashboard.heroEyebrow}
              </div>
              <h2 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-[30px]">
                {t.dashboard.heroTitle}
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                {t.dashboard.heroBody}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/keys" className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-card/55 px-3.5 text-[13px] font-medium shadow-sm backdrop-blur-md hover:border-signal/35">
                  <KeyRound className="size-4 text-signal" />
                  {t.dashboard.onboarding.step2.action}
                </Link>
                <Link href="/jobs/new" className="premium-button inline-flex h-9 items-center gap-2 rounded-full border border-white/20 px-3.5 text-[13px] font-semibold text-white">
                  <Play className="size-4" />
                  {t.dashboard.onboarding.step3.action}
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-background/50 p-3 shadow-sm backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{t.dashboard.firstSuccess.title}</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">{t.dashboard.firstSuccess.subtitle}</div>
                </div>
                <Activity className="size-4 text-signal" />
              </div>
              <div className="space-y-2">
                <MissionStep done={Boolean(me)} icon={CheckCircle2} label={t.dashboard.onboarding.step1.title} />
                <MissionStep done={me?.api_keys_active != null && me.api_keys_active > 0} icon={KeyRound} label={t.dashboard.onboarding.step2.title} />
                <MissionStep done={hasJobs} icon={Play} label={t.dashboard.onboarding.step3.title} />
                <MissionStep done={false} icon={Webhook} label={t.dashboard.onboarding.step4.title} muted />
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t.dashboard.stats.available} value={credits} unit="" caption={me ? t.dashboard.stats.availableHint : t.common.loading} icon={CreditCard} tone="success" />
          <StatCard label={t.dashboard.stats.activeKeys} value={activeKeys} unit="" caption={t.dashboard.stats.activeKeysHint} icon={KeyRound} tone="signal" />
          <StatCard label={t.dashboard.stats.jobsToday} value={jobsTodayValue} unit="" caption={t.dashboard.stats.jobsTodayHint} icon={Activity} tone="signal" />
          <StatCard label={t.dashboard.stats.webhookHealth} value="—" unit="" caption={t.dashboard.stats.webhookHealthHint} icon={Webhook} tone="muted" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <OnboardingChecklist />
          <section className="premium-surface overflow-hidden rounded-[28px]">
            <div className="flex items-end justify-between border-b border-white/10 bg-background/30 px-5 py-4">
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
      </div>
    </DashboardShell>
  )
}

function MissionStep({
  done,
  icon: Icon,
  label,
  muted = false,
}: {
  done: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/35 px-3 py-2">
      <span className={`flex size-7 items-center justify-center rounded-full border ${done ? "border-status-success/40 bg-status-success/10 text-status-success" : "border-white/12 bg-background/55 text-muted-foreground"}`}>
        {done ? <CheckCircle2 className="size-3.5" /> : <Icon className="size-3.5" />}
      </span>
      <span className={`text-[12.5px] ${done ? "text-foreground" : muted ? "text-muted-foreground/75" : "text-muted-foreground"}`}>{label}</span>
    </div>
  )
}

function EmptyJobs({ title, cta }: { title: string; cta: string }) {
  return (
    <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto flex size-12 items-center justify-center rounded-3xl border border-white/12 bg-card/60 text-signal shadow-sm backdrop-blur-md">
          <Play className="size-5" />
        </div>
        <div className="mt-4 text-sm font-medium">{title}</div>
        <Link href="/jobs/new" className="premium-button mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-white/20 px-4 text-[12.5px] font-medium text-white">
          {cta}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
