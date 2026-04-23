"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function CtaBanner() {
  return (
    <section className="relative px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-indigo-50 via-background to-purple-50 p-10 text-center shadow-xl sm:p-16 dark:from-indigo-950/40 dark:to-purple-950/40">
          {/* Decorative glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(129,140,248,0.25),transparent_65%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"
          />

          <div className="relative">
            <h2 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
              Ready to build the{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                future of video
              </span>{" "}
              with AI?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-[16px] leading-relaxed text-muted-foreground">
              Join thousands of developers shipping innovative products today.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="https://app.nextapi.top/sign-up"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/60 transition-all hover:shadow-indigo-500/80 hover:brightness-110"
              >
                Get a free API key
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/enterprise"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-5 py-3 text-[14px] font-medium text-foreground backdrop-blur-sm transition-colors hover:border-foreground/20 hover:bg-muted"
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
