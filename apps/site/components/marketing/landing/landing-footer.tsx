"use client"

import Link from "next/link"
import { Github, MessageCircle } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"

function Wordmark() {
  return (
    <span className="font-sans text-[15px] font-semibold tracking-[-0.02em] text-foreground">
      next
      <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
        API
      </span>
    </span>
  )
}

export function LandingFooter() {
  const sn = useTranslations().siteNav
  const links = [
    { label: sn.docs, href: "/docs" },
    { label: sn.pricing, href: "/pricing" },
    { label: sn.enterprise, href: "/enterprise" },
    { label: sn.security, href: "/security" },
    { label: sn.status, href: "/status" },
    { label: sn.legal, href: "/legal/terms" },
    { label: sn.dashboard, href: "https://app.nextapi.top" },
  ] as const

  return (
    <footer className="border-t border-border/70 bg-background py-10">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-6">
            <Link href="/" aria-label="NextAPI home">
              <Wordmark />
            </Link>
            <span className="text-[12.5px] text-muted-foreground">
              © 2026 NextAPI, Inc.
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <Link
              href="https://github.com/nextapi"
              aria-label="NextAPI on GitHub"
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Github className="size-4" />
            </Link>
            <Link
              href="https://discord.gg/nextapi"
              aria-label="NextAPI on Discord"
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MessageCircle className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
