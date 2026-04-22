"use client"

import Link from "next/link"
import {
  Activity,
  BookOpen,
  CreditCard,
  Gauge,
  Key,
  LayoutDashboard,
  LifeBuoy,
  Search,
  Webhook,
} from "lucide-react"
import { Logo } from "@/components/nextapi/logo"
import { Kbd } from "@/components/nextapi/kbd"
import { ThemeToggle } from "@/components/nextapi/theme-toggle"
import { LocaleToggle } from "@/components/nextapi/locale-toggle"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

export function DashboardShell({
  children,
  activeHref = "/",
  title,
  description,
  actions,
}: {
  children: React.ReactNode
  activeHref?: string
  title?: string
  description?: string
  actions?: React.ReactNode
}) {
  const t = useTranslations()

  const sections = [
    {
      heading: t.common.overview,
      items: [
        { label: t.nav.dashboard.home, href: "/", icon: LayoutDashboard },
        { label: t.nav.dashboard.jobs, href: "/jobs", icon: Activity, badge: "12" },
        { label: t.nav.dashboard.usage, href: "/usage", icon: Gauge },
      ],
    },
    {
      heading: t.nav.dashboard.build,
      items: [
        { label: t.nav.dashboard.keys, href: "/keys", icon: Key },
        { label: t.nav.dashboard.webhooks, href: "/webhooks", icon: Webhook },
        { label: t.nav.dashboard.docs, href: "https://nextapi.top/docs", icon: BookOpen },
      ],
    },
    {
      heading: t.nav.dashboard.account,
      items: [
        { label: t.nav.dashboard.billing, href: "/billing", icon: CreditCard },
      ],
    },
  ]

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
          </Link>
        </div>

        <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2.5">
          <div className="flex flex-1 items-center justify-between rounded-md border border-sidebar-border bg-background/60 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-sm bg-signal/10 font-mono text-[10px] font-medium text-signal">
                A
              </div>
              <span className="text-[12.5px] text-foreground">acme-prod</span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              live
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scroll-thin">
          {sections.map((s) => (
            <div key={s.heading} className="mb-5">
              <div className="mb-1.5 px-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                {s.heading}
              </div>
              <ul className="flex flex-col gap-0.5">
                {s.items.map((item) => {
                  const active = item.href === activeHref
                  const Icon = item.icon
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                          active
                            ? "bg-sidebar-accent text-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("size-4", active ? "text-signal" : "")} />
                        <span className="flex-1">{item.label}</span>
                        {"badge" in item && item.badge && (
                          <span className="rounded-sm bg-sidebar-accent px-1.5 font-mono text-[10px] text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <a
            href="mailto:support@nextapi.dev?subject=NextAPI%20support%20request"
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <LifeBuoy className="size-4" />
            {t.common.support}
          </a>
          <div className="mt-2 rounded-md border border-sidebar-border bg-background/60 p-2.5">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-status-success op-pulse" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-status-success" />
              </span>
              <span className="text-[12px] text-foreground">{t.cta.footer.allSystems}</span>
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
              Seedance · 99.982% · 30d
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur-xl">
          <button className="flex h-8 flex-1 items-center gap-2 rounded-md border border-border/80 bg-card/50 px-3 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-border hover:bg-card">
            <Search className="size-3.5" />
            <span className="flex-1">{t.common.typeToSearch}</span>
            <Kbd>⌘K</Kbd>
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-[12px] text-muted-foreground md:inline-flex">
              <span className="font-mono text-foreground">142.80</span> {t.common.credits}
            </span>
            <Link
              href="/billing"
              className="rounded-md border border-border/80 bg-card/50 px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-card"
            >
              {t.common.topUp}
            </Link>
            <LocaleToggle />
            <ThemeToggle />
            <div className="flex size-7 items-center justify-center rounded-full border border-border/80 bg-card font-mono text-[11px] text-foreground">
              JL
            </div>
          </div>
        </header>

        {(title || description || actions) && (
          <div className="border-b border-border/60 px-6 py-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {title && <h1 className="text-[22px] font-medium tracking-tight">{title}</h1>}
                {description && (
                  <p className="mt-1 max-w-[640px] text-[13.5px] leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
          </div>
        )}

        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
