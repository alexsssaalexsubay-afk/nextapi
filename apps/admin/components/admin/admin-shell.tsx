"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  AlertOctagon,
  Bot,
  Banknote,
  Building2,
  Gauge,
  Image,
  ListChecks,
  LifeBuoy,
  LogOut,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
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
import { BUILD_LABEL, BUILD_SHA } from "@/lib/build-info"
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem("nextapi.admin.sidebar.collapsed") === "1")
  }, [])

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

  function toggleSidebar() {
    setSidebarCollapsed((value) => {
      const next = !value
      window.localStorage.setItem("nextapi.admin.sidebar.collapsed", next ? "1" : "0")
      return next
    })
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
        },
        {
          label: t.nav.admin.incidents,
          href: "/incidents",
          icon: ShieldCheck,
        },
      ],
    },
    {
      heading: t.nav.admin.ledger,
      items: [
        { label: t.nav.admin.credits, href: "/credits", icon: Banknote },
        { label: t.nav.admin.pricing, href: "/pricing", icon: Percent },
        { label: t.nav.admin.aiProviders, href: "/ai-providers", icon: Bot },
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
        { label: t.nav.admin.marketing, href: "/marketing", icon: Image },
      ],
    },
  ]

  return (
    <div className="brand-aurora relative isolate flex min-h-screen flex-col overflow-hidden bg-background">
      <div aria-hidden className="soft-noise pointer-events-none absolute inset-0 opacity-[0.14]" />
      <div aria-hidden className="pointer-events-none absolute -right-40 top-[-10%] h-[420px] w-[560px] rounded-full bg-rose-500/12 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-18%] left-[18%] h-[380px] w-[520px] rounded-full bg-signal/12 blur-3xl" />
      <MfaBanner />
      <div className="relative z-10 flex flex-1">
      <aside className={cn("hidden shrink-0 flex-col border-r border-white/10 bg-sidebar/84 shadow-[24px_0_80px_-68px] shadow-status-failed backdrop-blur-2xl transition-[width] duration-200 md:flex", sidebarCollapsed ? "w-[72px]" : "w-[236px]")}>
        <div className={cn("flex h-12 items-center border-b border-white/10 px-4", sidebarCollapsed ? "justify-center" : "justify-between")}>
          <Link href="https://nextapi.top" className="flex items-center gap-2">
            <Logo />
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn("rounded-md p-1.5 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground", sidebarCollapsed && "absolute left-1/2 -translate-x-1/2 opacity-0 focus:opacity-100")}
            aria-label={sidebarCollapsed ? t.common.expandSidebar : t.common.collapseSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <span className={cn("rounded-sm border border-status-failed/40 bg-status-failed/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-status-failed", sidebarCollapsed && "hidden")}>
            {t.admin.shell.sidebarBadge}
          </span>
        </div>

        <div className={cn("border-b border-white/10 px-3 py-2.5", sidebarCollapsed && "px-2")}>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/55 px-2 py-1.5 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-signal" />
              <span className={cn("font-mono text-[11.5px] text-foreground", sidebarCollapsed && "sr-only")}>ops.nextapi.top</span>
            </div>
            <span className={cn("font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground", sidebarCollapsed && "hidden")}>
              {t.admin.shell.prodBadge.toLowerCase()}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scroll-thin">
          {sections.map((s) => (
            <div key={s.heading} className="mb-5">
              <div className={cn("mb-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground", sidebarCollapsed && "sr-only")}>
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
                        title={sidebarCollapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] transition-colors",
                          sidebarCollapsed && "justify-center px-0",
                          active
                            ? "bg-gradient-to-r from-status-failed/16 via-signal/10 to-transparent text-foreground shadow-[inset_2px_0_0] shadow-status-failed"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                        )}
                        >
                        <Icon className={cn("size-4", active ? "text-signal" : "")} />
                        <span className={cn("flex-1", sidebarCollapsed && "sr-only")}>{item.label}</span>
                        {item.badge && (
                          <span
                            className={cn(
                              "rounded-sm px-1.5 font-mono text-[10px]",
                              sidebarCollapsed && "hidden",
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
          {sidebarCollapsed && (
            <button type="button" onClick={toggleSidebar} className="mb-2 flex w-full items-center justify-center rounded-md px-2 py-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" aria-label={t.common.expandSidebar}>
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          <a
            href="https://docs.nextapi.top"
            target="_blank"
            rel="noreferrer"
            title={sidebarCollapsed ? t.nav.admin.runbooks : undefined}
            className={cn("mb-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground", sidebarCollapsed && "justify-center")}
          >
            <LifeBuoy className="size-4" />
            <span className={cn(sidebarCollapsed && "sr-only")}>{t.nav.admin.runbooks}</span>
          </a>
          <div className={cn("rounded-xl border border-white/10 bg-background/55 p-2.5 shadow-sm backdrop-blur-md", sidebarCollapsed && "hidden")}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t.admin.shell.onCall}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">manual</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-full bg-signal/15 font-mono text-[9.5px] text-signal">
                OP
              </div>
              <span className="text-[12px] text-foreground">{t.admin.shell.prodBadge.toLowerCase()}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-white/10 bg-background/64 px-6 shadow-[0_18px_70px_-58px] shadow-status-failed backdrop-blur-2xl">
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
            <button className="flex h-7 items-center gap-2 rounded-full border border-white/12 bg-card/55 px-2.5 text-[11.5px] text-muted-foreground shadow-sm backdrop-blur-md hover:text-foreground">
              <span>{t.admin.shell.jumpTo}</span>
              <Kbd>⌘K</Kbd>
            </button>
            <div className="hidden items-center gap-1.5 rounded-full border border-white/12 bg-card/55 px-2 py-1 font-mono text-[11px] text-muted-foreground shadow-sm backdrop-blur-md md:flex">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-status-success op-pulse" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-status-success" />
              </span>
              api · telemetry pending
            </div>
            <span
              className="hidden font-mono text-[10px] text-muted-foreground/80 md:inline"
              title={BUILD_LABEL}
            >
              build {BUILD_SHA}
            </span>
            <button
              type="button"
              onClick={() => {
                void onSignOut()
              }}
              disabled={signingOut}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/12 bg-card/55 px-2.5 text-[11.5px] text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:border-border hover:bg-card hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="size-3.5" />
              {signingOut ? t.common.loading : t.common.signOut}
            </button>
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </header>

        {(title || description || actions || meta) && (
          <div className="border-b border-white/10 bg-background/30 px-6 py-5 backdrop-blur-sm">
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
