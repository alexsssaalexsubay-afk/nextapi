"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  Bot,
  BookOpen,
  Clapperboard,
  CreditCard,
  FolderOpen,
  Gauge,
  Key,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Webhook,
  Workflow,
} from "lucide-react"
import { Logo } from "@/components/nextapi/logo"
import { Kbd } from "@/components/nextapi/kbd"
import { ThemeToggle } from "@/components/nextapi/theme-toggle"
import { LocaleToggle } from "@/components/nextapi/locale-toggle"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"
import { apiFetch, logoutAccount } from "@/lib/api"
import { BUILD_LABEL, BUILD_SHA } from "@/lib/build-info"

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
  const router = useRouter()
  const [orgName, setOrgName] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [initials, setInitials] = useState<string>("—")
  const [signingOut, setSigningOut] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  async function onSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await logoutAccount()
    } finally {
      setSigningOut(false)
      router.push("/sign-in")
      router.refresh()
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.info(`[NextAPI dashboard] build ${BUILD_LABEL}`)
      setSidebarCollapsed(window.localStorage.getItem("nextapi.sidebar.collapsed") === "1")
    }
    let cancelled = false
    apiFetch("/v1/auth/me").then((res) => {
      if (cancelled) return
      const data = res as { org?: { name?: string }; balance?: number } | null
      if (data?.org?.name) {
        setOrgName(data.org.name)
        setInitials(
          data.org.name
            .split(/[\s-_]+/)
            .slice(0, 2)
            .map((w: string) => w[0]?.toUpperCase() ?? "")
            .join("") || "–",
        )
      }
      if (typeof data?.balance === "number") {
        setBalance(data.balance)
      }
    }).catch(() => { /* non-fatal: sidebar still renders */ })
    return () => { cancelled = true }
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed((value) => {
      const next = !value
      window.localStorage.setItem("nextapi.sidebar.collapsed", next ? "1" : "0")
      return next
    })
  }

  const sections = [
    {
      heading: t.common.overview,
      items: [
        { label: t.nav.dashboard.home, href: "/", icon: LayoutDashboard },
        { label: t.nav.dashboard.jobs, href: "/jobs", icon: Activity },
        { label: t.nav.dashboard.usage, href: "/usage", icon: Gauge },
      ],
    },
    {
      heading: t.nav.dashboard.build,
      items: [
        { label: t.nav.dashboard.keys, href: "/keys", icon: Key },
        { label: t.nav.dashboard.library, href: "/library", icon: FolderOpen },
        { label: t.nav.dashboard.templates, href: "/templates", icon: Clapperboard },
        { label: t.nav.dashboard.director, href: "/director", icon: Bot },
        { label: t.nav.dashboard.canvas, href: "/canvas", icon: Workflow },
        {
          label: t.nav.dashboard.batchStudio,
          href: "/batch",
          icon: Clapperboard,
        },
        { label: t.nav.dashboard.webhooks, href: "/webhooks", icon: Webhook },
        { label: t.nav.dashboard.docs, href: "https://nextapi.top/docs", icon: BookOpen },
      ],
    },
    {
      heading: t.nav.dashboard.account,
      items: [
        { label: t.nav.dashboard.vip, href: "/vip", icon: CreditCard },
        { label: t.nav.dashboard.billing, href: "/billing", icon: CreditCard },
        { label: t.nav.dashboard.recharge, href: "/recharge", icon: CreditCard },
      ],
    },
  ]

  return (
    <div className="brand-aurora relative isolate flex min-h-screen overflow-hidden bg-background">
      <div aria-hidden className="soft-noise pointer-events-none absolute inset-0 opacity-[0.16]" />
      <div aria-hidden className="pointer-events-none absolute right-[-10%] top-[-12%] h-[440px] w-[520px] rounded-full bg-fuchsia-500/12 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-18%] left-[28%] h-[380px] w-[520px] rounded-full bg-cyan-400/10 blur-3xl" />

      <aside className={cn("relative z-10 hidden shrink-0 flex-col border-r border-white/10 bg-sidebar/82 shadow-[24px_0_80px_-68px] shadow-signal backdrop-blur-2xl transition-[width] duration-200 md:flex", sidebarCollapsed ? "w-[72px]" : "w-[240px]")}>
        <div className={cn("flex h-14 items-center border-b border-white/10 px-4", sidebarCollapsed ? "justify-center" : "justify-between")}>
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Logo />
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground", sidebarCollapsed && "absolute left-1/2 -translate-x-1/2 opacity-0 focus:opacity-100")}
            aria-label={sidebarCollapsed ? t.common.expandSidebar : t.common.collapseSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <div className="flex flex-1 items-center justify-between rounded-xl border border-white/10 bg-background/52 px-2 py-1.5 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-sm bg-signal/10 font-mono text-[10px] font-medium text-signal">
                {initials[0] ?? "–"}
              </div>
              <span className={cn("max-w-[130px] truncate text-[12.5px] text-foreground", sidebarCollapsed && "hidden")}>
                {orgName ?? "—"}
              </span>
            </div>
            <span className={cn("font-mono text-[10px] uppercase tracking-wider text-muted-foreground", sidebarCollapsed && "hidden")}>
              live
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scroll-thin">
          {sections.map((s) => (
            <div key={s.heading} className="mb-5">
              <div className={cn("mb-1.5 px-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground", sidebarCollapsed && "sr-only")}>
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
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                          sidebarCollapsed && "justify-center px-0",
                          active
                            ? "bg-gradient-to-r from-signal/18 via-fuchsia-500/12 to-transparent text-foreground shadow-[inset_2px_0_0] shadow-signal"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("size-4", active ? "text-signal" : "")} />
                        <span className={cn("flex-1", sidebarCollapsed && "sr-only")}>{item.label}</span>
                        {"badge" in item && (item as { badge?: string }).badge && (
                          <span className={cn("rounded-sm bg-sidebar-accent px-1.5 font-mono text-[10px] text-muted-foreground", sidebarCollapsed && "hidden")}>
                            {(item as { badge?: string }).badge}
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
            href="mailto:support@nextapi.top?subject=NextAPI%20support%20request"
            className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground", sidebarCollapsed && "justify-center")}
            title={sidebarCollapsed ? t.common.support : undefined}
          >
            <LifeBuoy className="size-4" />
            <span className={cn(sidebarCollapsed && "sr-only")}>{t.common.support}</span>
          </a>
          <div className={cn("mt-2 rounded-xl border border-white/10 bg-background/55 p-2.5 shadow-sm backdrop-blur-md", sidebarCollapsed && "hidden")}>
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-status-success op-pulse" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-status-success" />
              </span>
              <span className="text-[12px] text-foreground">{t.cta.footer.allSystems}</span>
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
              NextAPI · production
            </div>
            <div
              className="mt-1 font-mono text-[10px] text-muted-foreground/80"
              title={BUILD_LABEL}
            >
              build {BUILD_SHA}
            </div>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-background/64 px-6 shadow-[0_18px_70px_-58px] shadow-signal backdrop-blur-2xl">
          <button
            type="button"
            onClick={() => router.push("/jobs")}
            className="flex h-8 min-w-0 max-w-xl flex-1 items-center gap-2 rounded-full border border-white/12 bg-card/55 px-3 text-left text-[12.5px] text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:border-signal/30 hover:bg-card"
          >
            <Search className="size-3.5" />
            <span className="flex-1">{t.common.typeToSearch}</span>
            <Kbd>⌘K</Kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/12 bg-card/55 px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm backdrop-blur-md md:inline-flex">
              <span>{t.dashboard.stats.available}</span>
              <span className="font-mono text-foreground">
                {balance !== null ? `$${(balance / 100).toFixed(2)}` : "—"}
              </span>
            </div>
            <Link
              href="/billing"
              className="premium-button rounded-full border border-white/20 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.42),transparent_30%),linear-gradient(110deg,#2563eb_0%,#7c3aed_42%,#db2777_100%)] px-3 py-1.5 text-[12px] font-medium text-white transition-all"
            >
              {t.common.topUp}
            </Link>
            <div className="flex items-center gap-1 rounded-full border border-white/12 bg-card/45 px-1.5 py-1 shadow-sm backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                void onSignOut()
              }}
              disabled={signingOut}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/12 bg-card/55 px-2.5 text-[12px] text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:border-border hover:bg-card hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="size-3.5" />
              {signingOut ? t.common.loading : t.common.signOut}
            </button>
            <LocaleToggle />
            <ThemeToggle />
            </div>
            <div className="flex size-7 items-center justify-center rounded-full border border-white/14 bg-card/70 font-mono text-[11px] text-foreground shadow-sm backdrop-blur-md">
              {initials.slice(0, 2) || "–"}
            </div>
          </div>
        </header>

        {(title || description || actions) && (
          <div className="border-b border-white/10 bg-background/30 px-6 py-6 backdrop-blur-sm">
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

        <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
      </div>
    </div>
  )
}
