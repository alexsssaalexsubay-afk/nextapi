"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Circle,
  Copy,
  Film,
  Gauge,
  Layers3,
  Route,
  Sparkles,
  WandSparkles,
} from "lucide-react"
import { track } from "@/lib/analytics"
import { useI18n } from "@/lib/i18n/context"
import { fetchMarketingSlots, type MarketingSlot } from "@/lib/marketing-slots"

const COPY = {
  en: {
    badge: "Production video API control plane",
    titleTop: "Generate, route, and reconcile",
    titleAccent: " AI video",
    titleTail: " without the ops drag.",
    subtitle:
      "One API surface for video jobs, model routing, signed webhooks, credit reservation, and final cost reconciliation. Built for teams shipping real product flows, not one-off demos.",
    primaryCta: "Open Dashboard",
    secondaryCta: "Read API Docs",
    trust: ["Reserve credits", "Route provider", "Track every job", "Reconcile on completion"],
    videoAria: "AI-generated video: drone orbiting a lighthouse at dusk",
    status: "Generating · 38s",
    prompt: "drone orbiting a lighthouse",
  },
  zh: {
    badge: "生产级 AI 视频 API 控制面",
    titleTop: "生成、路由、对账",
    titleAccent: " AI 视频",
    titleTail: "不再靠人工救火。",
    subtitle:
      "一套 API 同时处理视频任务、模型路由、签名 Webhook、点数预留和最终成本对账。为真实产品流而做，不是一次性 Demo。",
    primaryCta: "打开控制台",
    secondaryCta: "阅读 API 文档",
    trust: ["预留点数", "路由供应商", "追踪任务状态", "完成后对账"],
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
    <section className="ops-canvas relative isolate overflow-hidden border-b border-border/70">
      <div aria-hidden className="soft-noise pointer-events-none absolute inset-0 opacity-[0.18]" />
      <div aria-hidden className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-[0.12]" />
      <div
        aria-hidden
        className="ops-hairline pointer-events-none absolute inset-x-0 top-0 h-px"
      />

      <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl grid-cols-1 items-center gap-12 px-6 pt-16 pb-12 lg:grid-cols-[0.95fr_1.05fr] lg:pt-24">
        <div className="relative z-10">
          <div className="ops-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold text-foreground/85">
            <span className="relative inline-flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-status-success opacity-75" />
              <span className="relative inline-block size-1.5 rounded-full bg-status-success" />
            </span>
            {copy.badge}
          </div>

          <h1 className="mt-6 max-w-4xl text-balance font-display text-5xl font-semibold leading-[1.02] text-foreground sm:text-7xl lg:text-[76px]">
            {copy.titleTop}
            <span className="bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent drop-shadow-sm">
              {copy.titleAccent}
            </span>
            {copy.titleTail}
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-[16px] leading-relaxed text-muted-foreground">
            {copy.subtitle}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="https://app.nextapi.top"
              onClick={() => track("hero_signup_clicked")}
              className="premium-button group inline-flex items-center gap-2 rounded-full border border-white/20 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.42),transparent_30%),linear-gradient(110deg,#2563eb_0%,#7c3aed_42%,#db2777_100%)] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_18px_48px_-18px] shadow-fuchsia-500/70 transition-all"
            >
              {copy.primaryCta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/docs"
              className="ops-interactive inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/55 px-5 py-3 text-[14px] font-semibold text-foreground shadow-sm backdrop-blur-md hover:border-signal/35 hover:bg-white/75 dark:border-white/10 dark:bg-white/8 dark:hover:bg-white/12"
            >
              {copy.secondaryCta}
            </Link>
          </div>

          <ul className="mt-8 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
            {copy.trust.map((t) => (
              <li
                key={t}
                className="ops-subpanel flex min-h-16 flex-col justify-between rounded-xl p-3 text-[13px] text-muted-foreground"
              >
                <CheckCircle2 className="size-4 text-status-success" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 lg:translate-y-6">
          <HeroPlayerCard
            videoAria={copy.videoAria}
            status={copy.status}
            prompt={copy.prompt}
            heroMain={heroMain}
          />
        </div>
      </div>
      <div aria-hidden className="mx-auto h-12 max-w-7xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
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
    <div className="relative mx-auto w-full max-w-2xl">
      <div aria-hidden className="absolute -left-8 top-20 size-40 rounded-full bg-cyan-400/20 blur-3xl" />
      <div aria-hidden className="absolute -right-10 bottom-8 size-52 rounded-full bg-amber-400/14 blur-3xl" />

      <div className="ops-panel relative overflow-hidden rounded-2xl">
        {/* Window chrome */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-400" />
            <span className="size-2.5 rounded-full bg-amber-300" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <WandSparkles className="size-3.5 text-fuchsia-500" />
            <span className="font-mono">director.workflow.live</span>
          </div>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-[1.2fr_0.8fr]">
          <div className="relative aspect-[16/11] overflow-hidden rounded-xl bg-muted shadow-inner">
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
            className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/55"
          />

          {/* Floating status pill */}
          <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
            <span className="relative inline-flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-block size-1.5 rounded-full bg-emerald-400" />
            </span>
            {status}
          </div>

          <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur-md">
            <Film className="size-3.5" />
            4 shots · 9:16 · 1080p
          </div>
          </div>

          <div className="flex min-h-[260px] flex-col gap-3">
            <div className="rounded-xl border border-white/10 bg-zinc-950/88 p-3 text-white shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  <Clapperboard className="size-4 text-fuchsia-300" />
                  AI Director
                </div>
                <span className="rounded-full bg-emerald-400/14 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                  live
                </span>
              </div>
              <div className="space-y-2">
                {[
                  ["Script", "GPT / Claude / Kimi"],
                  ["Storyboard", "Seedream / Nano Banana"],
                  ["Video", "Seedance / Kling"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.045] p-2">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
                    <div className="mt-0.5 text-[13px] text-zinc-200">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Route, label: "Route", value: "auto" },
                { icon: Gauge, label: "Queue", value: "p95" },
                { icon: Layers3, label: "Merge", value: "ready" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border/70 bg-background/55 p-2.5 shadow-sm backdrop-blur">
                  <item.icon className="size-4 text-signal" />
                  <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{item.label}</div>
                  <div className="font-mono text-[13px] text-foreground">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Floating code snippet overlay — bottom */}
        <div className="px-3 pb-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/92 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                  <Circle className="size-2 fill-indigo-400 text-indigo-400" />
                  POST /v1/videos
                </div>
                <button
                  type="button"
                  aria-label="Copy code"
                  className="ops-interactive rounded-md border border-transparent p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
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
  )
}
