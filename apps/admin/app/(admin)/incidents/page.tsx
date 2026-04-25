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

const incidents: Incident[] = []

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
        <div className="rounded-md border border-border/80 bg-background/40 px-4 py-2 font-mono text-[11px] text-muted-foreground">
          Incident tooling is not connected yet. No synthetic incidents are shown.
        </div>
        {/* SLO strip */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/80 md:grid-cols-4">
          <SLO label={p.slo.apiAvailability} value="—" targetLabel={p.slo.target} targetValue="99.95%" />
          <SLO label={p.slo.jobSuccess} value="—" targetLabel={p.slo.target} targetValue="99.00%" />
          <SLO label={p.slo.webhookP95} value="—" targetLabel={p.slo.target} targetValue="< 2s" />
          <SLO label={p.slo.seedanceP99} value="—" targetLabel={p.slo.target} targetValue="< 500ms" />
        </section>

        {/* Timeline */}
        <section className="space-y-5">
          {incidents.length === 0 ? (
            <div className="rounded-xl border border-border/80 bg-card/40 px-5 py-10 text-center text-[12.5px] text-muted-foreground">
              No incident records are available.
            </div>
          ) : incidents.map((i) => (
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
