"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertOctagon,
  Banknote,
  Building2,
  Gauge,
  ListChecks,
  LifeBuoy,
  LogOut,
  Megaphone,
  ScrollText,
  ShieldCheck,
  Terminal,
  Users,
  Wallet,
} from "lucide-react"
import { Logo } from "@/components/nextapi/logo"
import { Kbd } from "@/components/nextapi/kbd"
import { ThemeToggle } from "@/components/nextapi/theme-toggle"
import { LocaleToggle } from "@/components/nextapi/locale-toggle"
import { MfaBanner } from "@/components/admin/mfa-banner"
import { useTranslations } from "@/lib/i18n/context"
import { logoutAdmin } from "@/lib/admin-api"
import { cn } from "@/lib/utils"

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: { value: string; tone?: "default" | "alert" | "warn" }
}

export function AdminShell({
  children,
  activeHref = "/",
  title,
  description,
  actions,
  meta,
}: {
  children: React.ReactNode
  activeHref?: string
  title?: string
  description?: string
  actions?: React.ReactNode
  meta?: React.ReactNode
}) {
  const t = useTranslations()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function onSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await logoutAdmin()
    } finally {
      setSigningOut(false)
      router.push("/sign-in")
      router.refresh()
    }
  }

  const sections: { heading: string; items: NavItem[] }[] = [
    {
      heading: t.nav.admin.operations,
      items: [
        { label: t.nav.admin.overview, href: "/", icon: Gauge },
        { label: "Jobs", href: "/jobs", icon: ListChecks },
        {
          label: t.nav.admin.attention,
          href: "/attention",
          icon: AlertOctagon,
          badge: { value: "7", tone: "alert" },
        },
        {
          label: t.nav.admin.incidents,
          href: "/incidents",
          icon: ShieldCheck,
          badge: { value: "1", tone: "warn" },
        },
      ],
    },
    {
      heading: t.nav.admin.ledger,
      items: [
        { label: t.nav.admin.credits, href: "/credits", icon: Banknote },
        { label: t.nav.admin.platformBudget, href: "/budget", icon: Wallet },
        { label: t.nav.admin.audit, href: "/audit", icon: ScrollText },
      ],
    },
    {
      heading: t.nav.admin.customers,
      items: [
        { label: t.nav.admin.users, href: "/users", icon: Users },
        { label: t.nav.admin.organizations, href: "/orgs", icon: Building2 },
        { label: t.nav.admin.leads, href: "/leads", icon: Megaphone },
      ],
    },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MfaBanner />
      <div className="flex flex-1">
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-4">
          <Link href="https://nextapi.top" className="flex items-center gap-2">
            <Logo />
          </Link>
          <span className="rounded-sm border border-status-failed/40 bg-status-failed/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-status-failed">
            {t.admin.shell.sidebarBadge}
          </span>
        </div>

        <div className="border-b border-sidebar-border px-3 py-2.5">
          <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-background/60 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-signal" />
              <span className="font-mono text-[11.5px] text-foreground">ops.nextapi.top</span>
            </div>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
              {t.admin.shell.prodBadge.toLowerCase()}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scroll-thin">
          {sections.map((s) => (
            <div key={s.heading} className="mb-5">
              <div className="mb-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
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
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] transition-colors",
                          active
                            ? "bg-sidebar-accent text-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("size-4", active ? "text-signal" : "")} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span
                            className={cn(
                              "rounded-sm px-1.5 font-mono text-[10px]",
                              item.badge.tone === "alert" &&
                                "bg-status-failed/15 text-status-failed",
                              item.badge.tone === "warn" &&
                                "bg-status-running/15 text-status-running",
                              (!item.badge.tone || item.badge.tone === "default") &&
                                "bg-sidebar-accent text-muted-foreground",
                            )}
                          >
                            {item.badge.value}
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
            href="https://docs.nextapi.top"
            target="_blank"
            rel="noreferrer"
            className="mb-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <LifeBuoy className="size-4" />
            {t.nav.admin.runbooks}
          </a>
          <div className="rounded-md border border-sidebar-border bg-background/60 p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t.admin.shell.onCall}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">22:14 UTC</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-full bg-signal/15 font-mono text-[9.5px] text-signal">
                MW
              </div>
              <span className="text-[12px] text-foreground">m. winters</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 font-mono text-[11.5px] text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              admin
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground">
              {title?.toLowerCase().replace(/\s+/g, "-") ?? "overview"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button className="flex h-7 items-center gap-2 rounded-md border border-border/80 bg-card/40 px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground">
              <span>{t.admin.shell.jumpTo}</span>
              <Kbd>⌘K</Kbd>
            </button>
            <div className="hidden items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-2 py-1 font-mono text-[11px] text-muted-foreground md:flex">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-status-success op-pulse" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-status-success" />
              </span>
              api · 142 rps · p99 412ms
            </div>
            <button
              type="button"
              onClick={() => {
                void onSignOut()
              }}
              disabled={signingOut}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="size-3.5" />
              {signingOut ? t.common.loading : t.common.signOut}
            </button>
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </header>

        {(title || description || actions || meta) && (
          <div className="border-b border-border/60 px-6 py-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {title && (
                  <h1 className="flex items-center gap-3 text-[20px] font-medium tracking-tight">
                    {title}
                  </h1>
                )}
                {description && (
                  <p className="mt-1 max-w-[680px] text-[13px] leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
                {meta && (
                  <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                    {meta}
                  </div>
                )}
              </div>
              {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
          </div>
        )}

        <main className="flex-1">{children}</main>
      </div>
      </div>
    </div>
  )
}
