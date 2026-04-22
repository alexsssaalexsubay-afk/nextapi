"use client"

import Link from "next/link"
import { ArrowRight, Code, Shield, TrendingUp, Zap } from "lucide-react"

const FEATURES = [
  {
    icon: Zap,
    title: "Lightning Fast",
    body:
      "P50 latency under 12 seconds. Dedicated lanes mean you never wait in a queue.",
  },
  {
    icon: Shield,
    title: "Enterprise Grade",
    body:
      "SOC 2 compliance, contractual SLAs, and configurable content moderation profiles.",
  },
  {
    icon: Code,
    title: "Easy Integration",
    body:
      "Drop-in replacement for existing APIs. Simple REST API, clear docs, and multi-language SDKs.",
  },
  {
    icon: TrendingUp,
    title: "Scalable Performance",
    body:
      "Handle massive high-volume batch workloads with our optimized routing architecture.",
  },
] as const

export function FeaturesGrid() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-indigo-500 dark:text-indigo-400">
              Powerful. Flexible. Reliable.
            </p>
            <h2 className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
              Everything you need to build AI video into your product
            </h2>
          </div>
          <Link
            href="/docs"
            className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            Explore Docs
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-indigo-400/50 hover:shadow-[0_0_40px_-15px] hover:shadow-indigo-500/50 dark:hover:bg-muted/40">
      {/* Hover glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-indigo-500/0 via-indigo-500/0 to-purple-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:from-indigo-500/10 dark:via-transparent dark:to-purple-500/10"
      />

      <div className="relative">
        {/* Icon */}
        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 ring-1 ring-inset ring-indigo-500/20 dark:from-indigo-500/15 dark:to-purple-500/15 dark:ring-indigo-400/25">
          <Icon className="size-5 text-indigo-600 dark:text-indigo-400" />
        </div>

        <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  )
}
