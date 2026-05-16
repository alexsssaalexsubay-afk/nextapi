"use client"

import { useState, useEffect, useId, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  Bot,
  BookOpen,
  Building2,
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
  UserRound,
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
  workspace = false,
  immersive = false,
}: {
  children: React.ReactNode
  activeHref?: string
  title?: string
  description?: string
  actions?: React.ReactNode
  workspace?: boolean
  immersive?: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const compactChrome = workspace || immersive
  const [orgName, setOrgName] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(compactChrome)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const commandListId = useId()
  const navigationMenuRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

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
      const storedSidebar = window.localStorage.getItem("nextapi.sidebar.collapsed")
      setSidebarCollapsed(compactChrome ? true : storedSidebar === "1")
    }
    let cancelled = false
    apiFetch("/v1/auth/me").then((res) => {
      if (cancelled) return
      const data = res as { org?: { name?: string }; balance?: number } | null
      if (data?.org?.name) {
        setOrgName(data.org.name)
      }
      if (typeof data?.balance === "number") {
        setBalance(data.balance)
      }
    }).catch(() => { /* non-fatal: sidebar still renders */ })
    return () => { cancelled = true }
  }, [compactChrome])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
        searchInputRef.current?.focus()
      }
      if (event.key === "Escape") {
        setNavigationOpen(false)
        setSearchOpen(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!navigationOpen) return
    function onPointerDown(event: PointerEvent) {
      if (navigationMenuRef.current?.contains(event.target as Node)) return
      setNavigationOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [navigationOpen])

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
  const commandItems = sections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      section: section.heading,
    })),
  )
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const visibleCommandItems = (normalizedSearch
    ? commandItems.filter((item) => `${item.label} ${item.section} ${item.href}`.toLowerCase().includes(normalizedSearch))
    : commandItems
  ).slice(0, 8)
  const activeCommandItem = commandItems.find((item) => item.href === activeHref)

  useEffect(() => {
    if (!searchOpen) return
    setActiveCommandIndex(0)
  }, [normalizedSearch, searchOpen])

  function openCommand(item: { href: string }) {
    setSearchOpen(false)
    setSearchTerm("")
    setNavigationOpen(false)
    if (item.href.startsWith("http")) {
      window.location.assign(item.href)
      return
    }
    router.push(item.href)
  }

  return (
    <div className="ops-canvas relative isolate flex min-h-screen overflow-hidden text-foreground">
      <div aria-hidden className="soft-noise pointer-events-none absolute inset-0 opacity-[0.10]" />
      <div aria-hidden className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-[0.08]" />
      {!immersive ? (
        <aside className={cn("relative z-10 hidden shrink-0 flex-col border-r border-white/10 bg-sidebar/82 shadow-[24px_0_80px_-70px] shadow-signal backdrop-blur-2xl transition-[width] duration-200 md:flex", sidebarCollapsed ? "w-[72px]" : "w-[240px]")}>
          <div className={cn("flex h-14 items-center border-b border-white/10 px-4", sidebarCollapsed ? "justify-center" : "justify-between")}>
            <Link href="/" className="flex min-w-0 items-center gap-2">
              <Logo />
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              className={cn("rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", sidebarCollapsed && "absolute left-1/2 -translate-x-1/2 opacity-0 focus:opacity-100")}
              aria-label={sidebarCollapsed ? t.common.expandSidebar : t.common.collapseSidebar}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
            <div className="ops-subpanel flex flex-1 items-center justify-between rounded-xl px-2 py-1.5">
              <div className="flex items-center gap-2">
                <div className="flex size-5 items-center justify-center rounded-md border border-signal/20 bg-signal/10 text-signal">
                  <Building2 className="size-3.5" aria-hidden="true" />
                </div>
                <span className={cn("max-w-[130px] truncate text-[12.5px] text-foreground", sidebarCollapsed && "hidden")}>
                  {orgName ?? t.dashboard.command.workspace}
                </span>
              </div>
                <span className={cn("font-mono text-[11px] uppercase tracking-wider text-status-success", sidebarCollapsed && "hidden")}>
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
                              ? "bg-gradient-to-r from-signal/16 via-signal/8 to-transparent text-foreground shadow-[inset_2px_0_0] shadow-signal"
                              : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
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
              <button type="button" onClick={toggleSidebar} className="mb-2 flex w-full items-center justify-center rounded-md px-2 py-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label={t.common.expandSidebar}>
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
            <div className={cn("ops-subpanel mt-2 rounded-xl p-2.5", sidebarCollapsed && "hidden")}>
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
      ) : null}

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className={cn("sticky top-0 z-30 flex items-center border-b border-white/10 bg-background/70 shadow-[0_18px_70px_-60px] shadow-signal backdrop-blur-2xl", compactChrome ? "h-11 gap-2 px-2 sm:px-3" : "h-14 gap-3 px-4 sm:px-5")}>
          {immersive ? (
            <div className="flex min-w-0 items-center gap-2">
              <Link href="/" className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card" aria-label="NextAPI dashboard">
                <Logo withWordmark={false} />
              </Link>
              <div className="relative" ref={navigationMenuRef}>
                <button
                  type="button"
                  onClick={() => setNavigationOpen((value) => !value)}
                  className="grid size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  aria-label={t.common.expandSidebar}
                  aria-expanded={navigationOpen}
                >
                  {navigationOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                </button>
                {navigationOpen ? (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover p-2 shadow-lg" data-immersive-nav-menu>
                    {sections.map((section) => (
                      <div key={section.heading} className="mb-2 last:mb-0">
                        <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{section.heading}</div>
                        <div className="grid gap-1">
                          {section.items.map((item) => {
                            const Icon = item.icon
                            const active = item.href === activeHref
                            return (
                              <button
                                key={`${section.heading}-${item.href}`}
                                type="button"
                                onClick={() => openCommand(item)}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition",
                                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                )}
                              >
                                <Icon className={cn("size-3.5", active && "text-signal")} />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                <span className="font-mono text-[10px] text-muted-foreground/70">{item.href.startsWith("http") ? "docs" : item.href}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex min-w-0 items-center gap-2" data-immersive-workspace-title title={description ?? undefined}>
                <span className="truncate text-[13px] font-medium tracking-tight text-foreground">{title ?? activeCommandItem?.label ?? "NextAPI"}</span>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "ops-pill relative flex h-8 min-w-0 items-center gap-2 rounded-full px-3 text-left text-[12.5px] text-muted-foreground transition-colors focus-within:border-signal/45 focus-within:text-foreground",
                compactChrome ? "hidden max-w-sm flex-1 md:flex" : "max-w-xl flex-1",
              )}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            >
              <Search className="size-3.5" />
              <input
                aria-label={t.common.typeToSearch}
                aria-controls={searchOpen ? commandListId : undefined}
                aria-activedescendant={searchOpen && visibleCommandItems[activeCommandIndex] ? commandOptionId(commandListId, activeCommandIndex) : undefined}
                ref={searchInputRef}
                value={searchTerm}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setSearchTerm(event.target.value)
                  setSearchOpen(true)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchOpen(false)
                    return
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    setSearchOpen(true)
                    setActiveCommandIndex((index) => Math.min(index + 1, Math.max(visibleCommandItems.length - 1, 0)))
                    return
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault()
                    setSearchOpen(true)
                    setActiveCommandIndex((index) => Math.max(index - 1, 0))
                    return
                  }
                  const activeItem = visibleCommandItems[activeCommandIndex] ?? visibleCommandItems[0]
                  if (event.key === "Enter" && activeItem) {
                    event.preventDefault()
                    openCommand(activeItem)
                  }
                }}
                placeholder={t.common.typeToSearch}
                className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <Kbd>⌘K</Kbd>
              {searchOpen && (
                <div id={commandListId} role="listbox" aria-label={t.common.typeToSearch} className="absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[280px] overflow-hidden rounded-lg border border-border bg-popover p-1.5 shadow-lg">
                  {visibleCommandItems.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">{t.common.empty}</div>
                  ) : visibleCommandItems.map((item, index) => {
                    const Icon = item.icon
                    const active = index === activeCommandIndex
                    return (
                      <button
                        key={`${item.section}-${item.href}`}
                        id={commandOptionId(commandListId, index)}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveCommandIndex(index)}
                        onClick={() => openCommand(item)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/45",
                          active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("size-3.5", active && "text-signal")} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground/70">{item.href.startsWith("http") ? "docs" : item.href}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {compactChrome && !immersive && title ? (
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <span className="max-w-[260px] truncate text-[13px] font-medium tracking-tight text-foreground">{title}</span>
              {description ? <span className="max-w-[360px] truncate text-[12px] text-muted-foreground xl:inline">{description}</span> : null}
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {compactChrome && actions ? <div className="hidden items-center gap-2 xl:flex">{actions}</div> : null}
            <div className={cn("ops-pill hidden items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-muted-foreground", compactChrome ? "2xl:inline-flex" : "md:inline-flex")}>
              <span>{t.dashboard.stats.available}</span>
              <span className="font-mono text-foreground">
                {balance !== null ? `$${(balance / 100).toFixed(2)}` : "—"}
              </span>
            </div>
            <Link
              href="/billing"
              className="premium-button rounded-full px-3 py-1.5 text-[12px] font-medium text-white"
            >
              {t.common.topUp}
            </Link>
            <div className="ops-pill flex items-center gap-1 rounded-full px-1 py-1">
              <button
                type="button"
                onClick={() => {
                  void onSignOut()
                }}
                disabled={signingOut}
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <LogOut className="size-3.5" />
                <span className={cn(immersive && "sr-only")}>{signingOut ? t.common.loading : t.common.signOut}</span>
              </button>
              <LocaleToggle />
              <ThemeToggle />
            </div>
            <div className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
              <UserRound className="size-4" aria-hidden="true" />
            </div>
          </div>
        </header>

        {!compactChrome && (title || description || actions) && (
          <div className="border-b border-white/10 bg-background/34 px-5 py-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {title && <h1 className="text-[20px] font-medium tracking-tight">{title}</h1>}
                {description && (
                  <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-muted-foreground">
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

function commandOptionId(listId: string, index: number) {
  return `${listId}-option-${index}`
}
