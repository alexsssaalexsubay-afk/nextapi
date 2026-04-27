"use client"

import Link from "next/link"
import { ArrowRight, Code, Shield, TrendingUp, Zap } from "lucide-react"
import { useI18n } from "@/lib/i18n/context"

const FEATURE_META = [
  Zap,
  Shield,
  Code,
  TrendingUp,
] as const

const COPY = {
  en: {
    eyebrow: "Powerful. Flexible. Reliable.",
    title: "Everything you need to build AI video into your product",
    docs: "Explore Docs",
    features: [
      {
        title: "Lightning Fast",
        body: "P50 latency under 12 seconds. Dedicated lanes mean you never wait in a queue.",
      },
      {
        title: "Enterprise Grade",
        body: "SOC 2 compliance, contractual SLAs, and configurable content moderation profiles.",
      },
      {
        title: "Easy Integration",
        body: "Drop-in replacement for existing APIs. Simple REST API, clear docs, and multi-language SDKs.",
      },
      {
        title: "Scalable Performance",
        body: "Handle massive high-volume batch workloads with our optimized routing architecture.",
      },
    ],
  },
  zh: {
    eyebrow: "强大。灵活。可靠。",
    title: "把 AI 视频能力快速嵌入你的产品",
    docs: "查看文档",
    features: [
      {
        title: "极速生成",
        body: "专属通道减少排队等待，让高频视频任务拥有稳定响应。",
      },
      {
        title: "企业级保障",
        body: "支持合同级 SLA、内容安全配置与面向企业的稳定性要求。",
      },
      {
        title: "轻松接入",
        body: "标准 REST API、清晰文档、多语言 SDK，替换现有调用路径更容易。",
      },
      {
        title: "弹性吞吐",
        body: "为大规模批量任务优化路由与并发，支撑持续增长的业务负载。",
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
