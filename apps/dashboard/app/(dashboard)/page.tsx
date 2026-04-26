"use client"

import * as React from "react"
import Link from "next/link"
import { Play } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist"
import { StatCard } from "@/components/dashboard/stat-card"
import { JobsTable, type JobRow } from "@/components/dashboard/jobs-table"
import { Button } from "@/components/ui/button"
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

  return (
    <DashboardShell
      activeHref="/"
      title={t.dashboard.title}
      description={t.dashboard.subtitle}
      actions={
        <>
          <Button
            asChild
            variant="outline"
            className="h-8 border-border/80 bg-card/40 px-3 text-[12.5px]"
          >
            <Link href="https://nextapi.top/docs">{t.common.readDocs}</Link>
          </Button>
          <Button
            asChild
            className="h-8 gap-1.5 bg-foreground px-3 text-[12.5px] font-medium text-background hover:bg-foreground/90"
          >
            <Link href="/jobs/new">
              <Play className="size-3.5" />
              {t.dashboard.onboarding.step3.title}
            </Link>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-8 p-6">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t.dashboard.stats.available}
            value={credits}
            unit=""
            caption={me ? t.dashboard.stats.availableHint : t.common.loading}
          />
          <StatCard
            label={t.dashboard.stats.activeKeys}
            value={activeKeys}
            unit={t.dashboard.stats.activeKeysHint}
            caption={t.common.last24h}
          />
          <StatCard
            label={t.dashboard.stats.jobsToday}
            value={jobsTodayValue}
            unit=""
            caption={t.dashboard.stats.jobsTodayHint}
          />
          <StatCard
            label={t.dashboard.stats.webhookHealth}
            value="—"
            unit=""
            caption={t.dashboard.stats.webhookHealthHint}
          />
        </div>

        <OnboardingChecklist />

        <div>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-[15px] font-medium tracking-tight text-foreground">
                {t.dashboard.recentJobs.title}
              </h2>
            </div>
            <Link
              href="/jobs"
              className="text-[12.5px] text-muted-foreground hover:text-foreground"
            >
              {t.dashboard.recentJobs.viewAll}
            </Link>
          </div>
          {jobs === null ? (
            <div className="rounded-xl border border-border/80 bg-card/40 px-4 py-8 text-center text-[13px] text-muted-foreground">
              {t.common.loading}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-border/80 bg-card/40 px-4 py-8 text-center text-[13px] text-muted-foreground">
              {t.jobs.empty.title}
            </div>
          ) : (
            <JobsTable rows={jobs} compact />
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
