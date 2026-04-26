"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { fetchMarketingSlots, type MarketingSlot } from "@/lib/marketing-slots"

type Item = {
  src: string
  badge: string
  alt: string
  /** Tailwind aspect-ratio class for visual variety. */
  aspect: string
  /** Optional vertical offset (even indexes offset down on desktop). */
  offsetY?: string
}

const BASE_ITEMS: Item[] = [
  {
    src: "/samples/short-drama.jpg",
    badge: "Short Drama",
    alt: "Cinematic close-up in a rainy neon alley",
    aspect: "aspect-[3/4]",
    offsetY: "md:translate-y-0",
  },
  {
    src: "/samples/ad-creative.jpg",
    badge: "Ad Creative",
    alt: "Luxury perfume bottle with liquid splash",
    aspect: "aspect-[4/5]",
    offsetY: "md:translate-y-8",
  },
  {
    src: "/samples/ecommerce.jpg",
    badge: "E-commerce",
    alt: "Premium sneaker on a matte dark turntable",
    aspect: "aspect-square",
    offsetY: "md:translate-y-0",
  },
  {
    src: "/samples/lighthouse-dusk.jpg",
    badge: "Cinematic",
    alt: "Drone orbiting a lighthouse at dusk",
    aspect: "aspect-[4/5]",
    offsetY: "md:translate-y-8",
  },
  {
    src: "/samples/cityscape.jpg",
    badge: "Urban",
    alt: "Aerial shot of a neon-lit futuristic city at night",
    aspect: "aspect-[3/4]",
    offsetY: "md:translate-y-0",
  },
]

export function GalleryStrip() {
  const [remoteSlots, setRemoteSlots] = useState<MarketingSlot[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const slots = await fetchMarketingSlots()
      if (!cancelled) setRemoteSlots(slots)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const items = useMemo(() => {
    return BASE_ITEMS.map((item, index) => {
      const key = `gallery_strip_${index + 1}`
      const slot = remoteSlots.find((s) => s.slot_key === key && s.media_kind === "image")
      if (slot?.url) {
        return { ...item, src: slot.url }
      }
      return item
    })
  }, [remoteSlots])

  return (
    <section id="gallery" className="relative py-24 sm:py-32">
      {/* Ambient gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[400px] -translate-y-1/2 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(168,85,247,0.08),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
            Create anything.{" "}
            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              Imagine everything.
            </span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Sampled from production traffic this week. Raw model output,
            no hand-picks.
          </p>
        </div>

        {/* Horizontal scroll on mobile, staggered grid on desktop */}
        <div className="mt-12">
          <div className="scroll-thin -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-12 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-12">
            {items.map((item) => (
              <GalleryCard key={`${item.badge}-${item.src}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function GalleryCard({ item }: { item: Item }) {
  const remote = item.src.startsWith("https://")
  return (
    <figure
      className={`group relative flex-none snap-start overflow-hidden rounded-2xl border border-border bg-muted shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:hover:shadow-indigo-500/20 ${item.offsetY ?? ""}`}
    >
      <div className={`${item.aspect} relative w-[72vw] sm:w-[46vw] md:w-auto`}>
        {remote ? (
          // eslint-disable-next-line @next/next/no-img-element -- operator-controlled CDN URL
          <img
            src={item.src}
            alt={item.alt}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <Image
            src={item.src || "/placeholder.svg"}
            alt={item.alt}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(min-width: 1024px) 20vw, (min-width: 640px) 46vw, 72vw"
          />
        )}

        {/* Dark gradient for badge readability */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/10"
        />

        {/* Badge */}
        <figcaption className="absolute left-3 top-3">
          <span className="inline-flex items-center rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
            {item.badge}
          </span>
        </figcaption>
      </div>
    </figure>
  )
}
