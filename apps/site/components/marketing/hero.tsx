"use client"

import Link from "next/link"
import { ArrowRight, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CodeBlock } from "@/components/nextapi/code-block"
import { useTranslations } from "@/lib/i18n/context"

const curlExample = `curl https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "Drone orbiting a lighthouse at dusk",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }'

# 202 accepted — credits estimated up-front, reconcile on completion`

const jsonResponse = `{
  "id": "vid_7Hc9Xk2Lm3NpQ4rS",
  "status": "queued",
  "estimated_cost_cents": 100
}`

export function Hero() {
  const t = useTranslations()
  const seg = t.hero.headlineSegments
  const sub = t.hero.subheadSegments

  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0 bg-grid bg-grid-fade opacity-60" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/40 to-transparent" />

      <div className="relative mx-auto max-w-[1240px] px-6 pt-20 pb-24 md:pt-28 md:pb-28">
        <div className="grid grid-cols-1 gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-center">
          {/* ─── Left column ─── */}
          <div className="flex flex-col items-start gap-6">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-signal op-pulse" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-signal" />
              </span>
              {t.hero.badge}
              <ArrowRight className="size-3" />
            </Link>

            <h1 className="max-w-[640px] text-balance font-sans text-[40px] font-medium leading-[1.05] tracking-tight md:text-[58px]">
              {seg.before}
              <span className="text-signal">{seg.accent}</span>
              {seg.middle}
              <span className="text-muted-foreground/60 line-through decoration-muted-foreground/40 decoration-2">
                {seg.muted}
              </span>
              {seg.after}
            </h1>

            <p className="max-w-[540px] text-pretty text-[15px] leading-relaxed text-muted-foreground md:text-[16px]">
              {sub.p1}
              <span className="kw">{sub.kw1}</span>
              {sub.p2}
              <span className="kw">{sub.kw2}</span>
              {sub.p3}
              <span className="kw">{sub.kw3}</span>
              {sub.p4}
              <span className="kw">{sub.kw4}</span>
              {sub.p5}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="h-10 gap-1.5 bg-signal px-4 text-[13.5px] font-medium text-signal-foreground hover:bg-signal/90"
                style={{ color: "var(--background)" }}
              >
                <Link href="https://app.nextapi.top">
                  {t.hero.cta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-10 gap-1.5 border-border/80 bg-card/40 px-4 text-[13.5px] font-medium text-foreground hover:bg-card"
              >
                <Link href="/docs">{t.hero.ctaSecondary}</Link>
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-signal" />
                <span className="kw">{t.hero.trust.partnerKw}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-muted-foreground/60" />
                <span>
                  <span className="kw">{t.hero.trust.uptimeKw}</span>
                  {t.hero.trust.uptimeTail}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-muted-foreground/60" />
                <span>
                  <span className="kw">{t.hero.trust.refundKw}</span>
                  {t.hero.trust.refundTail}
                </span>
              </span>
            </div>

            <div className="mt-8 w-full max-w-[620px]">
              <CodeBlock
                tabs={[
                  { label: "curl", language: "bash", code: curlExample },
                  { label: "response.json", language: "json", code: jsonResponse },
                ]}
                showLineNumbers={false}
              />
            </div>
          </div>

          {/* ─── Right column: hero video ─── */}
          <HeroVideo />
        </div>
      </div>
    </section>
  )
}

function HeroVideo() {
  const t = useTranslations()
  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/40 glow-ring">
        {/* 16:9 box — muted autoplay loop; poster carries full frame until MP4 is dropped in */}
        <div className="relative aspect-video w-full">
          <video
            src="/samples/hero-drone.mp4"
            poster="/samples/lighthouse-dusk.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Drone orbiting a lighthouse at dusk — NextAPI video output"
            className="h-full w-full object-cover"
          />

          {/* Top-left time badge */}
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2 py-1 font-mono text-[10.5px] text-foreground backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-status-running op-pulse" />
            LIVE · 0:15
          </div>
          {/* Top-right model chip */}
          <div className="absolute right-3 top-3 rounded-md border border-border/60 bg-background/70 px-2 py-1 font-mono text-[10.5px] text-muted-foreground backdrop-blur-md">
            seedance-2.0-pro
          </div>

          {/* Scanline gradient overlay for dev-infra feel */}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent"
            aria-hidden
          />
        </div>

        {/* Caption bar */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-card/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11.5px] text-muted-foreground">
              {t.hero.videoCaption}
            </p>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-signal">
            <span className="kw">{t.hero.videoMetaTime}</span>
            <span className="mx-1 text-muted-foreground">·</span>
            {t.hero.videoMetaCost}
          </span>
        </div>
      </div>
    </div>
  )
}
