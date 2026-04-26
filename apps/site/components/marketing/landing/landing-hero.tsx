"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Copy,
  Sparkles,
} from "lucide-react"
import { track } from "@/lib/analytics"
import { useI18n } from "@/lib/i18n/context"
import { fetchMarketingSlots, type MarketingSlot } from "@/lib/marketing-slots"

const COPY = {
  en: {
    badge: "The Next Generation AI Video API Platform",
    titleTop: "Build. Scale. Innovate.",
    titleAccent: "AI Video",
    titleTail: ", Simplified.",
    subtitle:
      "Power your products with state-of-the-art video generation. Zero queue times, enterprise SLAs, and configurable trust & safety.",
    primaryCta: "Get Your API Key",
    secondaryCta: "View Documentation",
    trust: ["99.95% Uptime", "Zero Queue Times", "Enterprise Ready", "Developer First"],
    videoAria: "AI-generated video: drone orbiting a lighthouse at dusk",
    status: "Generating · 38s",
    prompt: "drone orbiting a lighthouse",
  },
  zh: {
    badge: "新一代 AI 视频 API 平台",
    titleTop: "构建。扩展。创新。",
    titleAccent: "AI 视频",
    titleTail: "，更简单。",
    subtitle:
      "用稳定的视频生成基础设施驱动你的产品：零排队、企业级 SLA、可配置的内容安全策略。",
    primaryCta: "获取 API Key",
    secondaryCta: "查看文档",
    trust: ["99.95% 可用性", "零排队", "企业级就绪", "开发者友好"],
    videoAria: "AI 生成视频：无人机黄昏环绕灯塔",
    status: "生成中 · 38s",
    prompt: "无人机环绕灯塔",
  },
} as const

export function LandingHero() {
  const { locale } = useI18n()
  const copy = COPY[locale]
  const [heroMain, setHeroMain] = useState<MarketingSlot | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const slots = await fetchMarketingSlots()
      if (cancelled) return
      const main = slots.find((s) => s.slot_key === "landing_hero_main") ?? null
      setHeroMain(main)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="relative isolate overflow-hidden">
      {/* Ambient background: soft radial gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[640px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(129,140,248,0.22),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-40 h-[400px] w-[400px] rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/20"
      />

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-6 pt-20 pb-24 lg:grid-cols-[1.05fr_1fr] lg:pt-28 lg:pb-32">
        {/* LEFT — copy */}
        <div>
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[12px] font-medium text-foreground/80 backdrop-blur-sm">
            <span className="relative inline-flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-indigo-500 opacity-75" />
              <span className="relative inline-block size-1.5 rounded-full bg-indigo-500" />
            </span>
            {copy.badge}
          </div>

          {/* Headline */}
          <h1 className="mt-6 text-balance font-sans text-5xl font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-6xl lg:text-[72px]">
            {copy.titleTop}
            <br />
            <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-purple-600 bg-clip-text text-transparent">
              {copy.titleAccent}
            </span>
            {copy.titleTail}
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-xl text-pretty text-[16px] leading-relaxed text-muted-foreground">
            {copy.subtitle}
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="https://app.nextapi.top"
              onClick={() => track("hero_signup_clicked")}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-3 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 transition-all hover:shadow-indigo-500/70 hover:brightness-110"
            >
              {copy.primaryCta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-muted"
            >
              {copy.secondaryCta}
            </Link>
          </div>

          {/* Trust checklist */}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {copy.trust.map((t) => (
              <li
                key={t}
                className="flex items-center gap-2 text-[13px] text-muted-foreground"
              >
                <CheckCircle2 className="size-4 text-indigo-500 dark:text-indigo-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* RIGHT — glowing player + code card */}
        <div className="relative">
          <HeroPlayerCard
            videoAria={copy.videoAria}
            status={copy.status}
            prompt={copy.prompt}
            heroMain={heroMain}
          />
        </div>
      </div>
    </section>
  )
}

function HeroPlayerCard({
  videoAria,
  status,
  prompt,
  heroMain,
}: {
  videoAria: string
  status: string
  prompt: string
  heroMain: MarketingSlot | null
}) {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      {/* Glow frame */}
      <div
        aria-hidden
        className="absolute -inset-[1px] rounded-[28px] bg-gradient-to-br from-indigo-500/60 via-purple-500/40 to-transparent opacity-70 blur-md"
      />
      <div className="relative overflow-hidden rounded-[24px] border border-border bg-card/90 shadow-[0_40px_80px_-30px] shadow-indigo-500/20 backdrop-blur-xl dark:shadow-indigo-500/40">
        {/* Window chrome */}
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="size-3 text-indigo-500 dark:text-indigo-400" />
            <span className="font-mono">seedance-2.0-pro</span>
          </div>
        </div>

        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          {heroMain?.url && heroMain.media_kind === "video" ? (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={heroMain.url}
              poster={heroMain.poster_url}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={videoAria}
            />
          ) : heroMain?.url && heroMain.media_kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote operator-controlled URL
            <img
              src={heroMain.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 bg-[radial-gradient(circle_at_76%_22%,rgba(255,196,87,0.95),transparent_14%),linear-gradient(180deg,#f97316_0%,#fb923c_28%,#312e81_72%,#0f172a_100%)]"
              role="img"
              aria-label={videoAria}
            >
              <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.75))]" />
              <div className="absolute bottom-[28%] left-[10%] h-px w-[80%] bg-white/25" />
              <div className="absolute bottom-[28%] right-[20%] h-24 w-1.5 rounded-full bg-zinc-900/80" />
              <div className="absolute bottom-[38%] right-[18.5%] h-5 w-10 rounded-t-full bg-zinc-900/80" />
            </div>
          )}

          {/* Soft top-to-bottom gradient for code readability */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40"
          />

          {/* Floating status pill */}
          <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
            <span className="relative inline-flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-block size-1.5 rounded-full bg-emerald-400" />
            </span>
            {status}
          </div>

          {/* Floating code snippet overlay — bottom */}
          <div className="absolute inset-x-4 bottom-4">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/85 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                  <Circle className="size-2 fill-indigo-400 text-indigo-400" />
                  POST /v1/videos
                </div>
                <button
                  type="button"
                  aria-label="Copy code"
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
              <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-[1.7] text-zinc-300">
                <code>
                  <span className="text-zinc-500">{"// generate.ts"}</span>
                  {"\n"}
                  <span className="text-purple-400">await</span>{" "}
                  <span className="text-cyan-300">nextapi</span>.
                  <span className="text-yellow-300">generate</span>
                  {"({ "}
                  {"\n"}
                  {"  "}
                  <span className="text-cyan-300">model</span>:{" "}
                  <span className="text-emerald-300">
                    &quot;seedance-2.0-pro&quot;
                  </span>
                  ,
                  {"\n"}
                  {"  "}
                  <span className="text-cyan-300">input</span>: {"{"}
                  {"\n"}
                  {"    "}
                  <span className="text-cyan-300">prompt</span>:{" "}
                  <span className="text-emerald-300">
                    &quot;{prompt}&quot;
                  </span>
                  ,
                  {"\n"}
                  {"    "}
                  <span className="text-cyan-300">duration_seconds</span>:{" "}
                  <span className="text-orange-300">6</span>
                  {"\n"}
                  {"  "}
                  {"}"}
                  {"\n"}
                  {"})"}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
