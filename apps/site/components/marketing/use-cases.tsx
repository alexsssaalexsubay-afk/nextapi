"use client"

import { ArrowRight } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"

type CardKey = "shortDrama" | "ad" | "ecommerce" | "consumer"

const cards: { key: CardKey; video: string; poster: string }[] = [
  { key: "shortDrama", video: "/samples/usecase-short-drama.mp4", poster: "/samples/short-drama.jpg" },
  { key: "ad",         video: "/samples/usecase-ad.mp4",          poster: "/samples/ad-creative.jpg" },
  { key: "ecommerce",  video: "/samples/usecase-ecommerce.mp4",   poster: "/samples/ecommerce.jpg" },
  { key: "consumer",   video: "/samples/usecase-consumer.mp4",    poster: "/samples/character.jpg" },
]

export function UseCases() {
  const t = useTranslations()

  return (
    <section className="relative border-b border-border/60">
      <div className="mx-auto max-w-[1240px] px-6 py-24 lg:py-32">
        <div className="mb-12 flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {t.useCases.eyebrow}
          </span>
          <h2 className="max-w-[720px] text-balance text-[34px] font-medium leading-[1.15] tracking-tight md:text-[46px]">
            {t.useCases.title}
          </h2>
          <p className="max-w-[620px] text-[14.5px] leading-relaxed text-muted-foreground">
            {t.useCases.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ key, video, poster }) => {
            const c = t.useCases.cards[key]
            return (
              <article
                key={key}
                className="group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 transition-colors hover:border-border"
              >
                <div className="relative aspect-video overflow-hidden border-b border-border/60">
                  <video
                    src={video}
                    poster={poster}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={c.category}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur-md">
                    <span className="size-1.5 rounded-full bg-signal" />
                    8s loop
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <h3 className="text-[16px] font-medium tracking-tight text-foreground">
                    {c.category}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {c.tagline}
                  </p>
                  <div className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[12px] text-muted-foreground transition-colors group-hover:text-signal">
                    {t.common.readDocs}
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
