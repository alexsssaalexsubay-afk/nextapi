"use client"

import Link from "next/link"
import { ArrowRight, Check, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

type TierKey = "builder" | "growth" | "enterprise"

const tierMeta: Record<TierKey, { href: string; featured: boolean }> = {
  builder: { href: "https://app.nextapi.top", featured: false },
  growth: { href: "/pricing", featured: true },
  enterprise: { href: "/pricing#contact", featured: false },
}

export function PricingPreview() {
  const t = useTranslations()
  const hp = t.homePricing
  const order: TierKey[] = ["builder", "growth", "enterprise"]

  return (
    <section id="pricing" className="border-b border-border/60">
      <div className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="mb-14 flex flex-col items-start gap-4">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-indigo-500 dark:text-indigo-400">
            <Lock className="size-3" />
            {hp.eyebrow}
          </span>
          <h2 className="max-w-[720px] text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
            {hp.title}
          </h2>
          <p className="max-w-[620px] text-pretty text-[16px] leading-relaxed text-muted-foreground">
            {hp.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {order.map((k) => {
            const tier = hp[k]
            const meta = tierMeta[k]
            return (
              <div
                key={k}
                className={cn(
                  "relative flex flex-col gap-6 rounded-2xl border border-border bg-card p-7 transition-colors",
                  meta.featured
                    ? "border-indigo-400/40 shadow-[0_0_40px_-15px] shadow-indigo-500/40 dark:border-indigo-400/30"
                    : "hover:border-foreground/15",
                )}
              >
                {meta.featured && (
                  <>
                    {/* gradient accent corner, subtle */}
                    <div
                      className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-indigo-500/20 blur-2xl"
                      aria-hidden
                    />
                    <span className="absolute right-5 top-5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
                      {hp.recommended}
                    </span>
                  </>
                )}

                <div>
                  <div className="text-[14px] font-semibold text-foreground">{tier.name}</div>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    <Lock className="size-3" />
                    {k === "enterprise" ? "Custom quote" : "Pricing inside dashboard"}
                  </div>
                </div>

                <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                  {tier.description}
                </p>

                <ul className="flex flex-col gap-2.5">
                  {tier.highlights.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] text-foreground/90">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={meta.href}
                  className={cn(
                    "group mt-auto inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13.5px] font-medium transition-all",
                    meta.featured
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_24px_-8px] shadow-indigo-500/50 hover:shadow-indigo-500/70 hover:brightness-110"
                      : "border border-border bg-card text-foreground hover:border-foreground/20 hover:bg-muted",
                  )}
                >
                  {tier.cta}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
