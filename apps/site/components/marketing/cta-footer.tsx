"use client"

import Link from "next/link"
import { Logo } from "@/components/nextapi/logo"
import { BrandButton } from "@/components/marketing/brand-button"
import { useTranslations } from "@/lib/i18n/context"

export function FinalCta() {
  const t = useTranslations()

  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-[1240px] px-6 py-28">
        <div className="flex flex-col items-start gap-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-indigo-500 dark:text-indigo-400">
            / start
          </span>
          <h2 className="max-w-[820px] text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-foreground md:text-[52px] lg:text-[64px]">
            {t.cta.title}
          </h2>
          <p className="max-w-[560px] text-pretty text-[16px] leading-relaxed text-muted-foreground">
            {t.cta.subtitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <BrandButton href="https://app.nextapi.top" showArrow>
              {t.cta.primary}
            </BrandButton>
            <BrandButton href="/docs" variant="outline">
              {t.cta.secondary}
            </BrandButton>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter() {
  const t = useTranslations()

  const integrationLinks: [string, string][] = [
    ["Cursor", "/docs/integrations/cursor"],
    ["n8n", "/docs/integrations/n8n"],
    ["ComfyUI", "/docs/integrations/comfyui"],
    ["Dify", "/docs/integrations/dify"],
    ["LangChain", "/docs/integrations/langchain"],
    ["Make", "/docs/integrations/make"],
  ]

  return (
    <footer className="bg-background">
      <div className="mx-auto max-w-[1240px] px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 max-w-[320px] text-[13px] leading-relaxed text-muted-foreground">
              {t.hero.subheadline}
            </p>
            <div className="mt-6 flex items-center gap-2">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-status-success op-pulse" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-status-success" />
              </span>
              <span className="text-[12px] text-muted-foreground">
                <a href="/status" className="hover:underline">{t.cta.footer.allSystems}</a>
              </span>
            </div>
          </div>
          {[
            {
              heading: t.footer.product,
              links: [
                ["Seedance", "/docs#create"],
                [t.webhooks.title, "/docs#events"],
                [t.common.docs, "/docs"],
              ] as [string, string][],
            },
            {
              heading: t.footer.integrations,
              links: integrationLinks,
            },
            {
              heading: t.footer.company,
              links: [
                [t.common.pricing, "/pricing"],
                ["Enterprise", "/enterprise"],
                [t.common.status, "/status"],
                [t.common.support, "mailto:support@nextapi.top"],
              ] as [string, string][],
            },
            {
              heading: t.footer.legal,
              links: [
                [t.footer.terms, "/legal/terms"],
                [t.footer.privacy, "/legal/privacy"],
                ["Acceptable Use", "/legal/aup"],
                ["SLA", "/legal/sla"],
                ["Security", "/security"],
              ] as [string, string][],
            },
          ].map((g) => (
            <div key={g.heading}>
              <h4 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {g.heading}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {g.links.map(([l, h]) => (
                  <li key={l}>
                    <Link
                      href={h}
                      className="text-[13px] text-foreground/80 transition-colors hover:text-foreground"
                    >
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-6">
          <span className="font-mono text-[11px] text-muted-foreground">
            © 2026 NextAPI · {t.footer.copyright}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            build 26.04.22
          </span>
        </div>
      </div>
    </footer>
  )
}
