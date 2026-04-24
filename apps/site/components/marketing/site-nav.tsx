"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Menu, X } from "lucide-react"
import { ThemeToggle } from "@/components/nextapi/theme-toggle"
import { LocaleToggle } from "@/components/nextapi/locale-toggle"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"
import { track } from "@/lib/analytics"

/**
 * Brand mark: real logo (auto switches between light/dark variants) + wordmark.
 * Logo files live in /apps/site/public/logo-{light,dark}.png (transparent bg).
 */
function BrandMark() {
  return (
    <span className="flex items-center gap-2 select-none">
      <Image
        src="/logo-dark.png"
        alt=""
        aria-hidden
        width={28}
        height={28}
        priority
        className="hidden h-7 w-7 object-contain dark:block"
      />
      <Image
        src="/logo-light.png"
        alt=""
        aria-hidden
        width={28}
        height={28}
        priority
        className="block h-7 w-7 object-contain dark:hidden"
      />
      <span className="font-sans text-[17px] font-semibold tracking-[-0.02em] text-foreground">
        next
        <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
          API
        </span>
      </span>
    </span>
  )
}

export function SiteNav() {
  const t = useTranslations()
  const sn = t.siteNav
  const navLinks = [
    { label: sn.features, href: "/#features" },
    { label: sn.docs, href: "/docs" },
    { label: sn.pricing, href: "/pricing" },
    { label: sn.enterprise, href: "/enterprise" },
  ] as const

  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border/70 bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Left: logo + desktop links */}
        <div className="flex items-center gap-10">
          <Link
            href="/"
            aria-label="NextAPI home"
            className="flex items-center"
          >
            <BrandMark />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right: locale, theme, sign in, CTA */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex md:items-center md:gap-1">
            <LocaleToggle />
            <ThemeToggle />
          </div>
          <a
            href={process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.nextapi.top"}
            onClick={() => track("nav_login_clicked")}
            className="hidden text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
          >
            {sn.logIn}
          </a>
          <a
            href={process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.nextapi.top"}
            onClick={() => track("cta_get_started_clicked")}
            className="group relative hidden items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-[13px] font-medium text-white shadow-[0_0_20px_-5px] shadow-indigo-500/40 transition-all hover:shadow-indigo-500/60 hover:brightness-110 md:inline-flex"
          >
            {sn.getStarted}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>

          {/* Mobile menu trigger */}
          <button
            type="button"
            aria-label={sn.menuAria}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-9 items-center justify-center rounded-md text-foreground/80 hover:bg-muted md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="border-t border-border/70 bg-background md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm font-medium text-foreground/80 hover:bg-muted"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
              <div className="flex items-center gap-1">
                <LocaleToggle />
                <ThemeToggle />
              </div>
              <a
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.nextapi.top"}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-[13px] font-medium text-white"
              >
                {sn.getStarted}
                <ArrowRight className="size-3.5" />
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
