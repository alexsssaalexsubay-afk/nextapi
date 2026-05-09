"use client"

import { useState } from "react"
import { AlertTriangle, ArrowRight, Play, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useTranslations } from "@/lib/i18n/context"

type Phase = "idle" | "queued" | "running" | "done"
type PresetKey = "productHero" | "characterWalk" | "adOpener"

const presetPosters: Record<PresetKey, string> = {
  productHero: "/samples/ad-creative.jpg",
  characterWalk: "/samples/character.jpg",
  adOpener: "/samples/lighthouse-dusk.jpg",
}

/* Stubbed result video — real endpoint returns a different URL per job. */
const RESULT_VIDEO = "/samples/playground-result.mp4"

export function InlinePlayground() {
  const t = useTranslations()
  const [phase, setPhase] = useState<Phase>("idle")
  const [activePreset, setActivePreset] = useState<PresetKey>("adOpener")
  const [prompt, setPrompt] = useState<string>(t.playground.presetPrompts.adOpener)

  const runGeneration = () => {
    if (phase === "queued" || phase === "running") return
    setPhase("queued")
    window.setTimeout(() => setPhase("running"), 600)
    // Skeleton visible ~2s total, then show the result
    window.setTimeout(() => setPhase("done"), 2200)
  }

  const applyPreset = (k: PresetKey) => {
    setActivePreset(k)
    setPrompt(t.playground.presetPrompts[k])
    setPhase("idle")
  }

  return (
    <section className="relative border-b border-border/60">
      <div className="mx-auto max-w-[1240px] px-6 py-24 lg:py-32">
        <div className="mb-12 flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {t.playground.eyebrow}
          </span>
          <h2 className="max-w-[680px] text-balance text-[34px] font-medium leading-[1.15] tracking-tight md:text-[46px]">
            {t.playground.title}
          </h2>
          <p className="max-w-[560px] text-[14.5px] leading-relaxed text-muted-foreground">
            {t.playground.subtitle}
          </p>
        </div>

        {/* ─── Demo preview banner ─── */}
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-400/10 px-4 py-2.5 text-[12.5px] text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>{t.playground.marketing.previewBanner}</span>
          <a
            href="https://app.nextapi.top/sign-up"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 underline underline-offset-2 hover:opacity-80"
          >
            Sign up
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          {/* ─── Input card ─── */}
          <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card/40 p-5">
            <label className="flex flex-col gap-2">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                {t.playground.textareaLabel}
              </span>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t.playground.textareaPlaceholder}
                rows={4}
                className="w-full resize-none border-border/70 bg-background/50 font-mono text-[13px] leading-relaxed focus-visible:border-signal/50 focus-visible:ring-signal/20"
              />
            </label>

            {/* Preset chips below textarea */}
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(t.playground.presets) as PresetKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => applyPreset(k)}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    activePreset === k
                      ? "border-signal/50 bg-signal/10 text-signal"
                      : "border-border/70 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {t.playground.presets[k]}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[12px] text-muted-foreground">{t.playground.hint}</p>
              <Button
                onClick={runGeneration}
                disabled={phase === "queued" || phase === "running"}
                className="h-9 gap-1.5 bg-signal px-4 text-[12.5px] font-medium hover:bg-signal/90 disabled:opacity-80"
                style={{ color: "var(--background)" }}
              >
                {phase === "queued" || phase === "running" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    {t.playground.generating}
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 fill-current" />
                    {t.playground.marketing.showSample}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ─── Output card ─── */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40">
            <div className="relative aspect-video w-full overflow-hidden bg-background">
              {phase === "idle" && (
                <video
                  key={`idle-${activePreset}`}
                  src={RESULT_VIDEO}
                  poster={presetPosters[activePreset]}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover opacity-60"
                />
              )}
              {phase === "done" && (
                <>
                  <video
                    key="done"
                    src={RESULT_VIDEO}
                    poster={presetPosters[activePreset]}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-signal/40 bg-signal/15 px-2 py-1 font-mono text-[10.5px] text-signal backdrop-blur-md">
                    <span className="size-1.5 rounded-full bg-signal op-pulse" />
                    {t.playground.status.done}
                  </div>
                </>
              )}
              {(phase === "queued" || phase === "running") && (
                <div className="absolute inset-0 op-shimmer">
                  <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2 py-1 font-mono text-[10.5px] text-foreground backdrop-blur-md">
                    <span className="size-1.5 rounded-full bg-status-running op-pulse" />
                    {phase === "queued"
                      ? t.playground.status.queued
                      : t.playground.status.running}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
              <p className="truncate text-[12px] text-muted-foreground">
                {t.playground.resultCaption}{" "}
                {phase === "done" && (
                  <span className="ml-1 rounded border border-amber-400/50 bg-amber-400/10 px-1 py-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                    {t.playground.marketing.sampleLabel}
                  </span>
                )}
              </p>
              <span className="shrink-0 font-mono text-[11px] text-signal">
                {phase === "done" ? "4.8s · 1.00cr" : "pending"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
