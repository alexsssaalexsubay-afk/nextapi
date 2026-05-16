"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function CtaBanner() {
  return (
    <section className="relative px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="premium-surface brand-aurora relative overflow-hidden rounded-[34px] p-10 text-center sm:p-16">
          <div aria-hidden className="soft-noise pointer-events-none absolute inset-0 opacity-20" />
          {/* Decorative glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.34),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(129,140,248,0.26),transparent_65%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"
          />

          <div className="relative">
            <h2 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
              Ready to make{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                better video
              </span>{" "}
              with AI?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-[16px] leading-relaxed text-muted-foreground">
              Start with a real clip, clear cost, and a workspace your team can keep using.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="https://app.nextapi.top/sign-up"
                className="premium-button group inline-flex items-center gap-2 rounded-full border border-white/20 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.42),transparent_30%),linear-gradient(110deg,#2563eb_0%,#7c3aed_42%,#db2777_100%)] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_18px_48px_-18px] shadow-fuchsia-500/70 transition-all"
              >
                Start free
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/enterprise"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/55 px-5 py-3 text-[14px] font-semibold text-foreground shadow-sm backdrop-blur-md transition-colors hover:border-signal/35 hover:bg-white/75 dark:border-white/10 dark:bg-white/8 dark:hover:bg-white/12"
              >
                Talk to sales
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
