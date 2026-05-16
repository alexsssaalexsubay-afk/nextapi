"use client"

import Link from "next/link"
import { ArrowRight, Plug, Shield, TrendingUp, Zap } from "lucide-react"
import { useI18n } from "@/lib/i18n/context"

const FEATURE_META = [
  Zap,
  Shield,
  Plug,
  TrendingUp,
] as const

const COPY = {
  en: {
    eyebrow: "Fast. Clear. Reliable.",
    title: "Everything your team needs to ship AI video",
    docs: "Explore Docs",
    features: [
      {
        title: "Fast When It Matters",
        body: "Priority video lanes keep high-volume work moving without surprise waits.",
      },
      {
        title: "Ready for Real Teams",
        body: "Clear uptime expectations, account controls, and content safety settings for production work.",
      },
      {
        title: "Simple to Connect",
        body: "Clear setup notes help your team move from test to live faster.",
      },
      {
        title: "Room to Grow",
        body: "Handle batches, campaigns, and recurring video work without rebuilding from scratch.",
      },
    ],
  },
  zh: {
    eyebrow: "快速。清楚。可靠。",
    title: "让团队真正把 AI 视频交付出去",
    docs: "查看文档",
    features: [
      {
        title: "关键时刻更快",
        body: "优先视频通道减少意外等待，高频生成也能稳定推进。",
      },
      {
        title: "适合真实团队",
        body: "稳定性预期、账户控制与内容安全设置都在同一处管理。",
      },
      {
        title: "更容易接上",
        body: "清晰的设置说明，让测试到上线少走弯路。",
      },
      {
        title: "增长不用重做",
        body: "批量视频、营销活动和重复制作都能接住，不必从头重建。",
      },
    ],
  },
} as const

const FEATURES = COPY.en.features.map((_, index) => ({
  icon: FEATURE_META[index],
}))

type FeatureCopy = { title: string; body: string }

export function FeaturesGrid() {
  const { locale } = useI18n()
  const copy = COPY[locale]

  return (
    <section id="features" className="relative overflow-hidden py-24 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/35 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-20 h-72 w-72 rounded-full bg-signal/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-[-12%] bottom-10 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-indigo-500 dark:text-indigo-400">
              {copy.eyebrow}
            </p>
            <h2 className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
              {copy.title}
            </h2>
          </div>
          <Link
            href="/docs"
            className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            {copy.docs}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, index) => (
            <FeatureCard key={copy.features[index].title} icon={f.icon} copy={copy.features[index]} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  icon: Icon,
  copy,
}: {
  icon: React.ComponentType<{ className?: string }>
  copy: FeatureCopy
}) {
  return (
    <div className="premium-surface group relative overflow-hidden rounded-3xl p-6 transition-all hover:-translate-y-1 hover:border-signal/40 hover:shadow-[0_28px_80px_-48px] hover:shadow-signal">
      {/* Hover glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-indigo-500/0 via-indigo-500/0 to-purple-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:from-indigo-500/10 dark:via-transparent dark:to-purple-500/10"
      />

      <div className="relative">
        {/* Icon */}
        <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/16 via-violet-500/14 to-fuchsia-500/16 ring-1 ring-inset ring-signal/25">
          <Icon className="size-5 text-indigo-600 dark:text-indigo-400" />
        </div>

        <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-foreground">
          {copy.title}
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          {copy.body}
        </p>
      </div>
    </div>
  )
}
