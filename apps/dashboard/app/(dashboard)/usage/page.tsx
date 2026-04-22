"use client"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { StatCard } from "@/components/dashboard/stat-card"
import { useTranslations } from "@/lib/i18n/context"
import { useMemo } from "react"

export default function UsagePage() {
  const t = useTranslations()
  const days = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        d: i + 1,
        submitted:
          20 + Math.round(Math.sin(i / 3) * 18) + ((i * 17) % 10),
        failed: (i * 7) % 3,
      })),
    [],
  )
  const max = Math.max(...days.map((d) => d.submitted))

  return (
    <DashboardShell
      activeHref="/usage"
      title={t.usage.title}
      description={t.usage.subtitle}
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            label={t.usage.title}
            value="8,204"
            unit={t.common.last30d}
            trend={{ value: "+12.8%", positive: true }}
            sparkline={days.map((d) => d.submitted)}
          />
          <StatCard label={t.usage.reserved} value="8,204.00" caption={t.common.last30d} />
          <StatCard label={t.usage.billed} value="7,518.41" caption={t.common.last30d} />
          <StatCard
            label={t.usage.refunded}
            value="8.4"
            unit="%"
            caption={t.common.last30d}
            trend={{ value: "-0.7 pts", positive: true }}
          />
        </div>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-medium tracking-tight">{t.usage.dailyBreakdown}</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{t.common.last30d}</p>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-signal/80" /> {t.usage.columns.jobs}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-status-failed/80" /> {t.jobs.states.failed}
              </span>
            </div>
          </div>
          <div className="flex h-40 items-end gap-1.5">
            {days.map((d, i) => (
              <div key={i} className="group relative flex flex-1 flex-col justify-end gap-0.5">
                <div
                  className="w-full rounded-sm bg-signal/70 transition-opacity group-hover:bg-signal"
                  style={{ height: `${(d.submitted / max) * 100}%` }}
                />
                {d.failed > 0 && (
                  <div
                    className="w-full rounded-sm bg-status-failed/70"
                    style={{ height: `${(d.failed / max) * 100}%` }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10.5px] text-muted-foreground">
            <span>−30d</span>
            <span>{t.common.updatedNow}</span>
          </div>
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <h2 className="text-[13px] font-medium tracking-tight">
              {t.billing.reconciliation.title} · {t.common.last30d}
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">{t.usage.exportCsv}</span>
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-card/50 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-mono font-normal">{t.usage.columns.date}</th>
                <th className="px-5 py-2.5 font-mono font-normal">
                  {t.usage.columns.reserved}
                </th>
                <th className="px-5 py-2.5 font-mono font-normal">{t.usage.columns.billed}</th>
                <th className="px-5 py-2.5 font-mono font-normal">
                  {t.usage.columns.refunded}
                </th>
                <th className="px-5 py-2.5 font-mono font-normal">{t.usage.columns.jobs}</th>
                <th className="px-5 py-2.5 font-mono font-normal">USD @ $0.12</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono text-[12.5px]">
              {[
                ["Apr 15 – Apr 22", "2,041.00", "1,882.74", "158.26", "1,882.74", "$225.93"],
                ["Apr 08 – Apr 14", "1,988.00", "1,821.03", "166.97", "1,821.03", "$218.52"],
                ["Apr 01 – Apr 07", "2,140.00", "1,965.88", "174.12", "1,965.88", "$235.91"],
                ["Mar 25 – Mar 31", "2,035.00", "1,848.76", "186.24", "1,848.76", "$221.85"],
              ].map((r) => (
                <tr key={r[0]} className="text-foreground/90">
                  <td className="px-5 py-3 text-foreground">{r[0]}</td>
                  <td className="px-5 py-3">{r[1]}</td>
                  <td className="px-5 py-3">{r[2]}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r[3]}</td>
                  <td className="px-5 py-3">{r[4]}</td>
                  <td className="px-5 py-3">{r[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardShell>
  )
}
