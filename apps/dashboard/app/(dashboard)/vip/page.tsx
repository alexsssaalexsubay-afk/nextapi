"use client"

import Link from "next/link"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { useTranslations } from "@/lib/i18n/context"

export default function VIPPage() {
  const t = useTranslations()
  const labels = t.vipPage
  return (
    <DashboardShell activeHref="/vip" title={labels.title} description={labels.description}>
      <div className="mx-auto grid max-w-4xl gap-5 p-6 md:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-border/80 bg-card/40 p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.eyebrow}</div>
          <h2 className="mt-3 text-2xl font-semibold">{labels.planTitle}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{labels.planDescription}</p>
          <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">{labels.creditNotice}</div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/billing" className="rounded-md bg-foreground px-4 py-2 text-sm text-background">{labels.recharge}</Link>
            <Link href="/director" className="rounded-md border border-border px-4 py-2 text-sm">{labels.openDirector}</Link>
          </div>
        </section>
        <aside className="rounded-xl border border-border/80 bg-card/40 p-6">
          <h3 className="text-sm font-medium">{labels.whatYouGet}</h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {labels.benefits.map((item) => <li key={item}>- {item}</li>)}
          </ul>
        </aside>
      </div>
    </DashboardShell>
  )
}
