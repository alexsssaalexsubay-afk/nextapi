"use client"

import Link from "next/link"
import { ArrowRight, Play } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist"
import { StatCard } from "@/components/dashboard/stat-card"
import { JobsTable, sampleJobs } from "@/components/dashboard/jobs-table"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/i18n/context"

export default function DashboardHome() {
  const t = useTranslations()

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
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t.dashboard.stats.available}
            value="142.80"
            unit={t.common.credits}
            caption={t.dashboard.stats.availableHint}
            sparkline={[88, 92, 87, 90, 86, 96, 102, 108, 122, 142]}
          />
          <StatCard
            label={t.dashboard.stats.activeKeys}
            value="3"
            unit={t.dashboard.stats.activeKeysHint}
            caption={`${t.common.last24h} · us-east-1`}
          />
          <StatCard
            label={t.dashboard.stats.jobsToday}
            value="284"
            unit=""
            trend={{ value: "+18.4%", positive: true }}
            caption={t.dashboard.stats.jobsTodayHint}
            sparkline={[12, 14, 18, 11, 9, 22, 31, 28, 42, 48, 38, 44]}
          />
          <StatCard
            label={t.dashboard.stats.webhookHealth}
            value="99.3"
            unit="%"
            trend={{ value: "0.2 pts", positive: true }}
            caption={t.dashboard.stats.webhookHealthHint}
          />
        </div>

        <OnboardingChecklist />

        {/* Recent jobs */}
        <div>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-[15px] font-medium tracking-tight text-foreground">
                {t.dashboard.recentJobs.title}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {t.dashboard.recentJobs.subtitle}
              </p>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.dashboard.recentJobs.viewAll}
              <ArrowRight className="size-3" />
            </Link>
          </div>
          <JobsTable rows={sampleJobs} />
        </div>

        {/* Side rail: reconciliation + integration */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReconciliationCard />
          <WebhookHealthCard />
        </div>
      </div>
    </DashboardShell>
  )
}

function ReconciliationCard() {
  const t = useTranslations()
  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-medium tracking-tight">
          {t.billing.reconciliation.title}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">{t.common.last24h}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {t.billing.reconciliation.subtitle}
      </p>
      <div className="mt-5 flex flex-col gap-3 font-mono text-[12.5px]">
        <Row label={t.usage.reserved} value="284.00" />
        <Row label={t.usage.billed} value="261.42" />
        <Row label={t.usage.refunded} value="2.00" muted />
        <div className="h-px bg-border/60" />
        <Row label={`${t.usage.billed} · ${t.common.last24h}`} value="$31.37" strong />
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string
  value: string
  muted?: boolean
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : "text-foreground/90"}>{label}</span>
      <span
        className={
          strong
            ? "text-foreground"
            : muted
              ? "text-muted-foreground"
              : "text-foreground/90"
        }
      >
        {value}
      </span>
    </div>
  )
}

function WebhookHealthCard() {
  const t = useTranslations()
  const recent = [
    { ts: "17:03:11", ev: "job.succeeded", status: "200" },
    { ts: "17:02:58", ev: "job.running", status: "200" },
    { ts: "17:02:12", ev: "job.queued", status: "200" },
    { ts: "16:58:42", ev: "job.failed", status: "200" },
    { ts: "16:57:05", ev: "job.succeeded", status: "500", failed: true },
  ]
  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-medium tracking-tight">{t.webhooks.recentDeliveries}</h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          https://acme.com/hooks/nextapi
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {t.webhooks.help.verification}
      </p>
      <ul className="mt-5 flex flex-col divide-y divide-border/60 rounded-md border border-border/60 bg-background/40 font-mono text-[12px]">
        {recent.map((r, i) => (
          <li key={i} className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">{r.ts}</span>
              <span className="text-foreground/90">{r.ev}</span>
            </div>
            <span
              className={
                r.failed
                  ? "rounded-sm bg-status-failed-dim/50 px-1.5 text-status-failed"
                  : "rounded-sm bg-status-success-dim/40 px-1.5 text-status-success"
              }
            >
              {r.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
