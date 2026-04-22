"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useTranslations } from "@/lib/i18n/context"

const ITEMS = ["throughput", "contentPolicy", "migration"] as const

export function Faq() {
  const t = useTranslations()

  return (
    <section className="relative border-b border-border/60">
      <div className="mx-auto max-w-[1240px] px-6 py-24 md:py-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {t.faq.eyebrow}
            </span>
            <h2 className="text-balance text-[32px] font-medium leading-[1.15] tracking-tight md:text-[44px]">
              {t.faq.title}
            </h2>
            <p className="max-w-[320px] text-[14.5px] leading-relaxed text-muted-foreground">
              {t.faq.subtitle}
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {ITEMS.map((key, i) => {
              const item = t.faq.items[key]
              return (
                <AccordionItem
                  key={key}
                  value={key}
                  className="border-b border-border/60"
                >
                  <AccordionTrigger className="group py-5 text-left text-[15px] font-medium tracking-tight hover:no-underline">
                    <span className="flex items-start gap-4">
                      <span className="mt-0.5 font-mono text-[11px] text-muted-foreground/70">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-foreground group-hover:text-signal transition-colors">
                        {item.q}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 pl-10 text-[13.5px] leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
