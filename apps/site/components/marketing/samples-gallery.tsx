"use client"

import { useTranslations } from "@/lib/i18n/context"

type Sample = {
  key:
    | "lighthouse"
    | "shanghaiAlley"
    | "perfumeSplash"
    | "sneakerTurn"
    | "detective"
    | "tokyo"
    | "watchMacro"
    | "fogStreet"
  poster: string
  video: string
  aspect: "16/9" | "9/16"
}

/* TODO: replace /samples/sample-N.mp4 with real Seedance MP4 loops when ready. */
const samples: Sample[] = [
  { key: "lighthouse",    poster: "/samples/lighthouse-dusk.jpg", video: "/samples/sample-1.mp4", aspect: "16/9" },
  { key: "shanghaiAlley", poster: "/samples/short-drama.jpg",     video: "/samples/sample-2.mp4", aspect: "9/16" },
  { key: "perfumeSplash", poster: "/samples/ad-creative.jpg",     video: "/samples/sample-3.mp4", aspect: "16/9" },
  { key: "sneakerTurn",   poster: "/samples/ecommerce.jpg",       video: "/samples/sample-4.mp4", aspect: "9/16" },
  { key: "detective",     poster: "/samples/character.jpg",       video: "/samples/sample-5.mp4", aspect: "16/9" },
  { key: "tokyo",         poster: "/samples/cityscape.jpg",       video: "/samples/sample-6.mp4", aspect: "16/9" },
  { key: "watchMacro",    poster: "/samples/product-macro.jpg",   video: "/samples/sample-7.mp4", aspect: "9/16" },
  { key: "fogStreet",     poster: "/samples/scene.jpg",           video: "/samples/sample-8.mp4", aspect: "16/9" },
]

const aspectClass: Record<Sample["aspect"], string> = {
  "16/9": "aspect-video",
  "9/16": "aspect-[9/16]",
}

export function SamplesGallery() {
  const t = useTranslations()

  return (
    <section className="relative border-b border-border/60">
      <div className="mx-auto max-w-[1240px] px-6 py-24 lg:py-32">
        <div className="mb-12 flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {t.samples.eyebrow}
          </span>
          <h2 className="max-w-[720px] text-balance text-[34px] font-medium leading-[1.15] tracking-tight md:text-[46px]">
            {t.samples.title}
          </h2>
          <p className="max-w-[560px] text-[14.5px] leading-relaxed text-muted-foreground">
            {t.samples.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
          {samples.map((s) => {
            const item = t.samples.items[s.key]
            return (
              <figure
                key={s.key}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-all duration-300 hover:scale-[1.02] hover:border-border"
              >
                <div className={`relative ${aspectClass[s.aspect]} overflow-hidden bg-background`}>
                  {/* Poster image always visible; video overlays when available */}
                  <img
                    src={s.poster}
                    alt={item.prompt}
                    className="h-full w-full object-cover"
                  />
                  <video
                    src={s.video}
                    poster={s.poster}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={item.prompt}
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLVideoElement).style.display = "none" }}
                  />

                  {/* Top-left tag chip */}
                  <div className="absolute left-2 top-2 rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground backdrop-blur-md">
                    {item.tag}
                  </div>

                  {/* Bottom-left prompt reveal on hover */}
                  <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-background/95 via-background/55 to-transparent p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <p className="line-clamp-2 font-mono text-[11px] leading-snug text-foreground/90">
                      {item.prompt}
                    </p>
                  </figcaption>
                </div>
              </figure>
            )
          })}
        </div>
      </div>
    </section>
  )
}
