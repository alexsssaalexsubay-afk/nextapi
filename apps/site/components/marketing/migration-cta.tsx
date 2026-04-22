"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/i18n/context"

export function MigrationCta() {
  const t = useTranslations()
  const m = t.migrationStrip

  return (
    <section className="relative bg-signal/[0.08]">
      <div className="absolute inset-x-0 top-0 h-px bg-signal/40" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-signal/40" />

      <div className="relative mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-6 px-6 py-14 md:flex-row md:items-center">
        <div className="flex-1 space-y-3">
          <h3 className="text-balance text-[22px] font-medium leading-tight tracking-tight text-foreground md:text-[26px]">
            {m.headingBefore}
            <span className="kw">{m.headingKw}</span>
            {m.headingAfter}
          </h3>
          <p className="max-w-[640px] text-[13.5px] leading-relaxed text-muted-foreground">
            {m.sub}
          </p>
        </div>
        <Button
          asChild
          className="h-11 shrink-0 gap-1.5 bg-signal px-5 text-[13.5px] font-medium hover:bg-signal/90"
          style={{ color: "var(--background)" }}
        >
          <Link href="/pricing#contact">
            {m.cta}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
