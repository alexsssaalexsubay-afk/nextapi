"use client"

import { BadgeCheck, Eye, Lock, ReceiptText } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"

export function TrustRail() {
  const t = useTranslations()

  const pillars = [
    {
      icon: BadgeCheck,
      title: t.trust.official.title,
      copy: t.trust.official.description,
      mono: "production: stable",
    },
    {
      icon: Lock,
      title: t.trust.webhooks.title,
      copy: t.trust.webhooks.description,
      mono: "X-NextAPI-Signature: t=..,v1=..",
    },
    {
      icon: ReceiptText,
      title: t.trust.billing.title,
      copy: t.trust.billing.description,
      mono: "reserved 1.00 to billed 0.84",
    },
    {
      icon: Eye,
      title: t.trust.observability.title,
      copy: t.trust.observability.description,
      mono: "job.events[] · 90d retention",
    },
  ]

  return (
    <section className="border-b border-border/60 bg-card/30">
      <div className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="mb-14 flex flex-col items-start gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
            / operational trust
          </span>
          <h2 className="max-w-[720px] text-balance text-[32px] font-medium leading-tight tracking-tight md:text-[40px]">
            {t.trust.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/80 md:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div key={p.title} className="flex flex-col gap-4 bg-card/50 p-6">
              <div className="inline-flex size-8 items-center justify-center rounded-md border border-border/80 bg-background">
                <p.icon className="size-4 text-signal" />
              </div>
              <div>
                <h3 className="text-[14.5px] font-medium tracking-tight text-foreground">{p.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{p.copy}</p>
              </div>
              <div className="mt-auto border-t border-border/60 pt-3 font-mono text-[11px] text-muted-foreground">
                {p.mono}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
