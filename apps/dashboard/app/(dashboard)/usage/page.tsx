"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { StatCard } from "@/components/dashboard/stat-card"
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
  const sparkline = data?.map((p) => p.jobs) ?? []
  const max = Math.max(...(data?.map((d) => d.jobs) ?? [1]), 1)

  return (
    <DashboardShell
      activeHref="/usage"
      title={t.usage.title}
      description={t.usage.subtitle}
      actions={
        <Button
          variant="outline"
          className="h-8 gap-1.5 border-border/80 bg-card/40 text-[12.5px]"
          onClick={load}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {t.common.refresh ?? "Refresh"}
        </Button>
      }
    >
      <div className="flex flex-col gap-6 p-6">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-[13px] text-destructive">
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <StatCard
                label={t.usage.title}
                value={totalJobs.toLocaleString()}
                unit={t.common.last30d}
                sparkline={sparkline}
              />
              <StatCard
                label={t.usage.billed ?? "Credits used"}
                value={totalCredits.toLocaleString()}
                caption={t.common.last30d}
              />
              <StatCard
                label={t.usage.columns?.jobs ?? "Avg jobs/day"}
                value={data && data.length > 0 ? Math.round(totalJobs / data.length).toLocaleString() : "—"}
                caption={t.common.last30d}
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
              <div className="mt-2 flex justify-between font-mono text-[10.5px] text-muted-foreground">
                <span>−30d</span>
                <span>{t.common.updatedNow}</span>
              </div>
            </section>

            <section className="rounded-xl border border-border/80 bg-card/40">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <h2 className="text-[13px] font-medium tracking-tight">
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
                <tbody className="divide-y divide-border/60 font-mono text-[12.5px]">
                  {(data ?? []).map((d) => {
                    const day = new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    return (
                      <tr key={d.day} className="text-foreground/90">
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
