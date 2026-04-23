"use client"

import { AdminShell } from "@/components/admin/admin-shell"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

type Level = "monitoring" | "resolved" | "scheduled"

type Incident = {
  id: string
  title: string
  level: Level
  window: string
  impact: string
  steps: { t: string; note: string; by?: string }[]
}

const incidents: Incident[] = [
  {
    id: "inc_2026_0422_01",
    title: "Elevated Seedance p99 on pool-A",
    level: "monitoring",
    window: "2026-04-22 21:56 UTC → ongoing · 18m",
    impact: "p99 latency 412ms → 640ms on pool-A · 18% of traffic · no error rate increase",
    steps: [
      { t: "21:56 UTC", note: "Monitor · p99 breach on pool-A (threshold 500ms)" },
      { t: "21:57 UTC", note: "Auto-shift · 18% traffic routed to pool-B", by: "runbook-bot" },
      { t: "22:04 UTC", note: "Upstream acknowledged degraded GPU node", by: "seedance.support" },
      { t: "22:12 UTC", note: "Watching · no customer-visible error increase", by: "m. winters" },
    ],
  },
  {
    id: "inc_2026_0422_00",
    title: "Webhook delivery lag > 5s",
    level: "resolved",
    window: "2026-04-22 18:02 → 20:14 UTC · 2h 12m",
    impact: "Delivery p95 5.1s · 142 deliveries retried · all settled within SLO",
    steps: [
      { t: "18:02", note: "Monitor · webhook.p95 breach" },
      { t: "18:14", note: "Root cause · egress queue saturation on edge-3", by: "j. li" },
      { t: "19:40", note: "Mitigation · +4 workers, drain flag enabled", by: "j. li" },
      { t: "20:14", note: "Resolved · latency baseline restored" },
    ],
  },
  {
    id: "inc_2026_0425_00",
    title: "Quarterly key rotation window",
    level: "scheduled",
    window: "2026-04-25 04:00 → 04:30 UTC · 30m",
    impact: "Zero-impact rollout · dual-read of old + new signing secrets for 72h",
    steps: [
      { t: "T-72h", note: "Publish new HMAC secret in dashboard · customers opt-in early" },
      { t: "T-0", note: "Cut over signing secret · dual-verify enabled" },
      { t: "T+72h", note: "Retire old secret · alert any customer still using it" },
    ],
  },
]

export default function IncidentsPage() {
  const t = useTranslations()
  const p = t.admin.incidentsPage

  return (
    <AdminShell
      activeHref="/incidents"
      title={p.title}
      description={p.description}
      meta={
        <>
          <span>{p.meta.statusDegraded}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.uptime}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.publicFeed}</span>
        </>
      }
      actions={
        <>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12px] text-foreground hover:bg-card">
            {p.postUpdate}
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground/90">
            {p.newIncident}
          </button>
        </>
      }
    >
      <div className="space-y-6 p-6">
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-2 font-mono text-[11px] text-yellow-500">
          PREVIEW · this page is a layout sample. Wire it up to real incident
          tooling (status.io / Statuspage / a `/v1/internal/admin/incidents`
          endpoint) before relying on it for runbooks.
        </div>
        {/* SLO strip */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/80 md:grid-cols-4">
          <SLO label={p.slo.apiAvailability} value="99.982%" targetLabel={p.slo.target} targetValue="99.95%" ok />
          <SLO label={p.slo.jobSuccess} value="99.41%" targetLabel={p.slo.target} targetValue="99.00%" ok />
          <SLO label={p.slo.webhookP95} value="742ms" targetLabel={p.slo.target} targetValue="< 2s" ok />
          <SLO label={p.slo.seedanceP99} value="640ms" targetLabel={p.slo.target} targetValue="< 500ms" />
        </section>

        {/* Timeline */}
        <section className="space-y-5">
          {incidents.map((i) => (
            <article
              key={i.id}
              className="overflow-hidden rounded-xl border border-border/80 bg-card/40"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-sm px-1.5 font-mono text-[10px] uppercase tracking-[0.12em]",
                        i.level === "monitoring" && "bg-status-running/15 text-status-running",
                        i.level === "resolved" && "bg-status-success/15 text-status-success",
                        i.level === "scheduled" && "bg-status-queued/15 text-status-queued",
                      )}
                    >
                      {p.levels[i.level]}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{i.id}</span>
                  </div>
                  <h3 className="mt-1.5 text-[15px] font-medium tracking-tight">{i.title}</h3>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">{i.impact}</p>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {i.window}
                </div>
              </header>
              <ol className="divide-y divide-border/60 font-mono text-[12px]">
                {i.steps.map((s, j) => (
                  <li key={j} className="grid grid-cols-[110px_1fr_auto] items-center gap-4 px-5 py-2.5">
                    <span className="text-muted-foreground">{s.t}</span>
                    <span className="text-foreground/90">{s.note}</span>
                    <span className="text-muted-foreground">{s.by ?? p.systemActor}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>
      </div>
    </AdminShell>
  )
}

function SLO({
  label,
  value,
  targetLabel,
  targetValue,
  ok,
}: {
  label: string
  value: string
  targetLabel: string
  targetValue: string
  ok?: boolean
}) {
  return (
    <div className="bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-1.5 rounded-full",
            ok ? "bg-status-success" : "bg-status-running op-pulse",
          )}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "mt-3 text-[22px] font-medium tracking-tight",
          ok ? "text-foreground" : "text-status-running",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
        {targetLabel} · {targetValue}
      </div>
    </div>
  )
}
