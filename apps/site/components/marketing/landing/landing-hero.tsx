"use client"

import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Copy,
  Sparkles,
} from "lucide-react"
import { track } from "../../../lib/analytics"

const TRUST_ITEMS = [
  "99.95% Uptime",
  "Zero Queue Times",
  "Enterprise Ready",
  "Developer First",
] as const

export function LandingHero() {
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
            The Next Generation AI Video API Platform
          </div>

          {/* Headline */}
          <h1 className="mt-6 text-balance font-sans text-5xl font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-6xl lg:text-[72px]">
            Build. Scale. Innovate.
            <br />
            <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-purple-600 bg-clip-text text-transparent">
              AI Video
            </span>
            , Simplified.
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-xl text-pretty text-[16px] leading-relaxed text-muted-foreground">
            Power your products with state-of-the-art Seedance 2.0 video
            generation. Zero queue times, enterprise SLAs, and configurable
            trust &amp; safety.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="https://dash.nextapi.top"
              onClick={() => track("hero_signup_clicked")}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-3 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 transition-all hover:shadow-indigo-500/70 hover:brightness-110"
            >
              Get Your API Key
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-muted"
            >
              View Documentation
            </Link>
          </div>

          {/* Trust checklist */}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {TRUST_ITEMS.map((t) => (
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
          <HeroPlayerCard />
        </div>
      </div>
    </section>
  )
}

function HeroPlayerCard() {
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

        {/* Video poster */}
        <div className="relative aspect-[16/10] bg-muted">
          <video
            className="h-full w-full object-cover"
            poster="/samples/lighthouse-dusk.jpg"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/samples/lighthouse-dusk.mp4" type="video/mp4" />
          </video>

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
            Generating · 38s
          </div>

          {/* Floating code snippet overlay — bottom */}
          <div className="absolute inset-x-4 bottom-4">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/85 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                  <Circle className="size-2 fill-indigo-400 text-indigo-400" />
                  POST /v1/videos/generate
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
                  <span className="text-cyan-300">videos</span>.
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
                  <span className="text-cyan-300">prompt</span>:{" "}
                  <span className="text-emerald-300">
                    &quot;drone orbiting a lighthouse&quot;
                  </span>
                  ,
                  {"\n"}
                  {"  "}
                  <span className="text-cyan-300">duration</span>:{" "}
                  <span className="text-orange-300">6</span>
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
