"use client"

import { useCallback, useEffect, useState } from "react"
import { BarChart3, CreditCard, Loader2, RefreshCw, TrendingUp } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch, ApiError } from "@/lib/api"

type UsagePoint = {
  day: string
  jobs: number
  credits_used: number
}

export default function UsagePage() {
  const t = useTranslations()
  const [data, setData] = useState<UsagePoint[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    apiFetch("/v1/me/billing/usage?days=30")
      .then((res) => {
        if (Array.isArray(res?.data)) setData(res.data as UsagePoint[])
      })
      .catch((e) => {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : t.usage.loadFailed
        setError(msg)
        setData([])
      })
      .finally(() => setLoading(false))
  }, [t.usage.loadFailed])

  useEffect(() => { load() }, [load])

  const totalJobs = data?.reduce((s, p) => s + p.jobs, 0) ?? 0
  const totalCredits = data?.reduce((s, p) => s + p.credits_used, 0) ?? 0
  const max = Math.max(...(data?.map((d) => d.jobs) ?? [1]), 1)

  return (
    <DashboardShell
      activeHref="/usage"
      title={t.usage.title}
      description={t.usage.subtitle}
      actions={
        <Button
          variant="outline"
          className="ops-interactive h-9 gap-1.5 border-border/80 bg-card/40 text-[13px]"
          onClick={load}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {t.common.refresh ?? "Refresh"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 p-6">
        <section className="ops-panel overflow-hidden rounded-2xl">
          <div className="grid gap-px bg-border/70 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="bg-background/36 p-5">
              <div className="ops-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-signal" />
                usage intelligence
              </div>
              <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-tight text-foreground">
                Watch demand, spend, and job throughput in the same frame.
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Keep the credit ledger connected to actual generation volume so billing, routing, and customer support read from one operational story.
              </p>
            </div>
            <div className="grid gap-px bg-border/70 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <UsageHeroMetric icon={BarChart3} label={t.usage.title} value={loading && !data ? "…" : totalJobs.toLocaleString()} hint={t.common.last30d} />
              <UsageHeroMetric icon={CreditCard} label={t.usage.billed ?? "Credits used"} value={loading && !data ? "…" : totalCredits.toLocaleString()} hint={t.common.last30d} />
              <UsageHeroMetric icon={TrendingUp} label={t.usage.columns?.jobs ?? "Avg jobs/day"} value={loading && !data ? "…" : data && data.length > 0 ? Math.round(totalJobs / data.length).toLocaleString() : "—"} hint={t.common.last30d} />
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-[13px] text-destructive">
            {error}
          </div>
        ) : loading && !data ? (
          <section className="ops-panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-medium tracking-tight">{t.usage.dailyBreakdown}</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{t.common.last30d}</p>
              </div>
              <div className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t.common.loading}
              </div>
            </div>
            <div className="mt-5 flex h-40 items-end gap-1.5">
              {Array.from({ length: 30 }).map((_, index) => (
                <div
                  key={index}
                  className="ops-loading-stripes flex-1 rounded-sm bg-muted/40"
                  style={{ height: `${18 + ((index * 17) % 76)}%` }}
                />
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="ops-panel rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[14px] font-medium tracking-tight">{t.usage.dailyBreakdown}</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{t.common.last30d}</p>
                </div>
                <div className="flex items-center gap-4 font-mono text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-signal/80" /> {t.usage.columns.jobs}
                  </span>
                </div>
              </div>
              <div className="flex h-40 items-end gap-1.5">
                {(data ?? []).map((d, i) => (
                  <div key={i} className="group relative flex flex-1 flex-col justify-end gap-0.5">
                    <div
                      className="w-full rounded-sm bg-signal/70 transition-opacity group-hover:bg-signal"
                      style={{ height: `${(d.jobs / max) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[12px] text-muted-foreground">
                <span>−30d</span>
                <span>{t.common.updatedNow}</span>
              </div>
            </section>

            <section className="ops-panel overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <h2 className="text-[14px] font-medium tracking-tight">
                  {t.usage.dailyBreakdown} · {t.common.last30d}
                </h2>
              </div>
              <table className="w-full text-[13px]">
                <thead className="bg-card/50 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 font-mono font-normal">{t.usage.columns.date}</th>
                    <th className="px-5 py-2.5 font-mono font-normal">{t.usage.columns.jobs}</th>
                    <th className="px-5 py-2.5 font-mono font-normal">{t.usage.billed ?? "Credits"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[13px]">
                  {(data ?? []).map((d) => {
                    const day = new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    return (
                      <tr key={d.day} className="text-foreground/90 transition-colors hover:bg-card/50">
                        <td className="px-5 py-3 text-foreground">{day}</td>
                        <td className="px-5 py-3">{d.jobs.toLocaleString()}</td>
                        <td className="px-5 py-3">{d.credits_used.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                  {(!data || data.length === 0) && (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">
                        {t.usage.empty}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  )
}

function UsageHeroMetric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="bg-background/46 p-4">
      <Icon className="size-4 text-signal" />
      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-[13px] text-muted-foreground">{hint}</div>
    </div>
  )
}
