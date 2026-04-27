"use client"

import { useTranslations } from "@/lib/i18n/context"

export function MetricRail() {
  const t = useTranslations()
  const items = [
    { v: "Live", l: t.metricRail.items.latency },
    { v: "SLO", l: t.metricRail.items.sla },
    { v: "Model", l: t.metricRail.items.runtime },
    { v: "Auto", l: t.metricRail.items.retries },
  ]
  return (
    <section className="border-b border-border/60 bg-card/30">
      <div className="mx-auto max-w-[1240px] px-6">
        <div className="grid grid-cols-2 divide-x divide-border/60 md:grid-cols-4">
          {items.map((i) => (
            <div key={i.l} className="flex flex-col gap-1 px-6 py-6">
              <span className="font-mono text-[24px] font-medium tracking-tight text-foreground">
                {i.v}
              </span>
              <span className="text-[12px] text-muted-foreground">{i.l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
