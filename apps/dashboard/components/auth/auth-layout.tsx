"use client"

import type { ReactNode } from "react"
import { ArrowRight, CheckCircle2, Clapperboard, CreditCard, RadioTower, Webhook } from "lucide-react"
import { useI18n } from "@/lib/i18n/context"
import { LocaleToggle } from "@/components/nextapi/locale-toggle"
import { Logo } from "@/components/nextapi/logo"

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useI18n()

  return (
    <div className="ops-canvas relative flex min-h-dvh flex-col overflow-hidden bg-background px-4 py-5 sm:px-6 lg:px-8">
      <div aria-hidden className="soft-noise pointer-events-none absolute inset-0 opacity-[0.14]" />
      <div aria-hidden className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-[0.12]" />

      <div className="relative z-20 flex items-center justify-between">
        <a
          href="https://nextapi.top"
          className="hidden items-center gap-2 rounded-full border border-white/10 bg-background/40 px-3 py-2 shadow-sm backdrop-blur-md lg:inline-flex"
          target="_blank"
          rel="noreferrer"
        >
          <Logo />
        </a>
        <span aria-hidden className="lg:hidden" />
        <LocaleToggle />
      </div>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,1.05fr)_440px] lg:py-12">
        <section className="hidden min-w-0 lg:block">
          <div className="max-w-2xl">
            <div className="ops-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-status-success shadow-[0_0_18px] shadow-status-success/70" />
              Production video workspace
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-[0.98] tracking-tight text-foreground">
              Sign in to manage every video your team creates.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">
              Track progress, cost, delivery, and account settings from one workspace.
            </p>
          </div>

          <div className="ops-panel mt-8 max-w-2xl overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-status-failed" />
                <span className="size-2.5 rounded-full bg-warning" />
                <span className="size-2.5 rounded-full bg-status-success" />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">video preview</span>
            </div>
            <div className="grid gap-3 p-3 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-xl border border-white/10 bg-zinc-950/88 p-4 text-white">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-[12px] font-medium">
                    <Clapperboard className="size-4 text-signal" />
                    AI video
                  </span>
                  <span className="rounded-full bg-status-success/14 px-2 py-1 font-mono text-[10px] text-status-success">
                    accepted
                  </span>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    ["idea", "cinematic product launch, 6s"],
                    ["model", "seedance-2.0-pro"],
                    ["delivery", "trusted update"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
                      <div className="font-mono text-[10px] uppercase text-zinc-500">{label}</div>
                      <div className="mt-1 text-[13px] text-zinc-100">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-3">
                {[
                  { icon: CreditCard, label: "cost", value: "reserved" },
                  { icon: RadioTower, label: "lane", value: "best option set" },
                  { icon: Webhook, label: "delivery", value: "confirmed" },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="ops-subpanel rounded-xl p-3">
                      <Icon className="size-4 text-signal" />
                      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[13px] text-foreground">
                        <CheckCircle2 className="size-3.5 text-status-success" />
                        {item.value}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[440px]">
          <div className="ops-panel rounded-2xl p-5 shadow-2xl sm:p-7">
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <Logo />
              <span className="ops-pill inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] text-muted-foreground">
                workspace
                <ArrowRight className="size-3" />
              </span>
            </div>
            {children}
          </div>
        </section>
      </main>

      <footer className="relative z-10 pb-1 text-center">
        <p className="text-[11px] text-muted-foreground">
          {t.footer?.copyright ?? "NextAPI Inc. All rights reserved."}
        </p>
      </footer>
    </div>
  )
}
