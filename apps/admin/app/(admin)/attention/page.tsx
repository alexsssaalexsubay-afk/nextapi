"use client"

import Link from "next/link"
import { AdminShell } from "@/components/admin/admin-shell"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

type Row = {
  id: string
  org: string
  rule: string
  reason: string
  age: string
  credits: string
  severity: "high" | "medium" | "low"
}

const rows: Row[] = [
  {
    id: "job_7Hc9Xk2Lm3NpQ4rS",
    org: "linear-media",
    rule: "upstream_timeout > 300s",
    reason: "Seedance never returned · reservation 1.00 held",
    age: "2m",
    credits: "refund 1.00",
    severity: "high",
  },
  {
    id: "job_4Pt8Yz0Qj9WxVb1A",
    org: "acme-prod",
    rule: "webhook.retries > 5",
    reason: "POST https://acme.com/hooks/nextapi returning 503",
    age: "6m",
    credits: "—",
    severity: "high",
  },
  {
    id: "job_2Lm0FhRk8NeGxT3C",
    org: "parallax-studio",
    rule: "queued > ETA + 60s",
    reason: "Stuck in queued 340s over Seedance ETA of 28s",
    age: "11m",
    credits: "—",
    severity: "medium",
  },
  {
    id: "job_9Qr5Dp7Bj1OeNm6X",
    org: "northwind-labs",
    rule: "reservation.unsettled > 10m",
    reason: "Upstream 202 but no terminal state · release hold",
    age: "18m",
    credits: "release 1.00",
    severity: "medium",
  },
  {
    id: "job_6Xw3Nv2Hc8MkLp4Y",
    org: "acme-prod",
    rule: "content_policy.manual_review",
    reason: "Operator review requested by linked workflow",
    age: "24m",
    credits: "refund 1.00",
    severity: "high",
  },
  {
    id: "job_3Bf0Kq9Uj2IwAa5R",
    org: "stellar-post",
    rule: "billed != reserved",
    reason: "Billed 2.00 vs reservation 1.00 · investigate ledger",
    age: "31m",
    credits: "hold",
    severity: "high",
  },
  {
    id: "job_8Vn7Mj4Tp1LyFb2Q",
    org: "acme-prod",
    rule: "cdn.upload.failed",
    reason: "S3 PUT failed for output · 2 retries remaining",
    age: "44m",
    credits: "—",
    severity: "low",
  },
]

export default function AttentionQueuePage() {
  const t = useTranslations()
  const p = t.admin.attentionPage

  return (
    <AdminShell
      activeHref="/attention"
      title={p.title}
      description={p.description}
      meta={
        <>
          <span>{p.meta.open}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.oldest}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.autoAssigned}</span>
        </>
      }
      actions={
        <>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12px] text-foreground hover:bg-card">
            {p.editRules}
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground/90">
            {p.bulkResolve}
          </button>
        </>
      }
    >
      <div className="space-y-6 p-6">
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <div className="grid grid-cols-[auto_auto_1.2fr_1fr_auto_auto_auto] items-center gap-4 border-b border-border/60 bg-background/40 px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{p.columns.sev}</span>
            <span>{p.columns.job}</span>
            <span>{p.columns.orgRule}</span>
            <span>{p.columns.reason}</span>
            <span>{p.columns.age}</span>
            <span>{p.columns.credits}</span>
            <span className="text-right">{p.columns.resolve}</span>
          </div>
          <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
            {rows.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[auto_auto_1.2fr_1fr_auto_auto_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-card/60"
              >
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-sm px-1.5 text-[10px] uppercase tracking-[0.12em]",
                    r.severity === "high" && "bg-status-failed/15 text-status-failed",
                    r.severity === "medium" && "bg-status-running/15 text-status-running",
                    r.severity === "low" && "bg-status-queued/15 text-status-queued",
                  )}
                >
                  {r.severity}
                </span>
                <Link href={`https://dash.nextapi.top/jobs/${r.id}`} className="truncate text-foreground hover:text-signal">
                  {r.id}
                </Link>
                <div className="min-w-0">
                  <div className="truncate text-foreground/90">{r.org}</div>
                  <div className="truncate text-muted-foreground">{r.rule}</div>
                </div>
                <span className="truncate text-muted-foreground">{r.reason}</span>
                <span className="w-10 text-muted-foreground">{r.age}</span>
                <span
                  className={cn(
                    "w-20",
                    r.credits.startsWith("refund") && "text-status-success",
                    r.credits.startsWith("release") && "text-status-queued",
                    r.credits === "hold" && "text-status-failed",
                  )}
                >
                  {r.credits}
                </span>
                <div className="flex items-center gap-1 justify-self-end">
                  <button className="rounded-md border border-border/80 bg-card/40 px-2 py-0.5 text-[10.5px] text-foreground hover:bg-card">
                    {p.actions.inspect}
                  </button>
                  <button className="rounded-md bg-foreground px-2 py-0.5 text-[10.5px] font-medium text-background hover:bg-foreground/90">
                    {p.actions.resolve}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <h2 className="text-[13.5px] font-medium tracking-tight">{p.activeRules.title}</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {p.activeRules.description}
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-2 font-mono text-[11.5px] md:grid-cols-2">
            <Rule expr="upstream_timeout > 300s" hits="12 / 30d" />
            <Rule expr="webhook.retries > 5" hits="4 / 30d" />
            <Rule expr="queued > ETA + 60s" hits="38 / 30d" />
            <Rule expr="reservation.unsettled > 10m" hits="9 / 30d" />
            <Rule expr="content_policy.manual_review" hits="21 / 30d" />
            <Rule expr="billed != reserved" hits="2 / 30d" />
            <Rule expr="cdn.upload.failed" hits="17 / 30d" />
            <Rule expr="error_rate(org, 1h) > 15%" hits="3 / 30d" />
          </ul>
        </section>
      </div>
    </AdminShell>
  )
}

function Rule({ expr, hits }: { expr: string; hits: string }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <span className="text-foreground">{expr}</span>
      <span className="text-muted-foreground">{hits}</span>
    </li>
  )
}
