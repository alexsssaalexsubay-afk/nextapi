"use client"

import { Key, Send, Webhook } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"

export function HowItWorks() {
  const t = useTranslations()

  const steps = [
    {
      n: "01",
      icon: Key,
      title: t.howItWorks.step1.title,
      description: t.howItWorks.step1.description,
      mono: "nxa_live_sk_••••4e2a",
    },
    {
      n: "02",
      icon: Send,
      title: t.howItWorks.step2.title,
      description: t.howItWorks.step2.description,
      mono: "POST /v1/videos returns id",
    },
    {
      n: "03",
      icon: Webhook,
      title: t.howItWorks.step3.title,
      description: t.howItWorks.step3.description,
      mono: "webhook.signed  ·  video.succeeded",
    },
  ]

  return (
    <section id="platform" className="border-b border-border/60">
      <div className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="mb-14 flex flex-col items-start gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
            / integration path
          </span>
          <h2 className="max-w-[720px] text-balance text-[32px] font-medium leading-tight tracking-tight md:text-[40px]">
            {t.howItWorks.title}
          </h2>
        </div>

        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/80 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="flex flex-col gap-5 bg-card/60 p-7">
              <div className="flex items-center justify-between">
                <div className="inline-flex size-9 items-center justify-center rounded-md border border-border/80 bg-background">
                  <s.icon className="size-4 text-signal" />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{s.n}</span>
              </div>
              <div className="space-y-2">
                <h3 className="text-[16px] font-medium tracking-tight text-foreground">{s.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">{s.description}</p>
              </div>
              <div className="mt-auto rounded-md border border-border/60 bg-background/60 px-3 py-2 font-mono text-[11.5px] text-foreground/80">
                {s.mono}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
