"use client"

import Link from "next/link"
import { Github, MessageCircle } from "lucide-react"

const LINKS = [
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "Enterprise", href: "/enterprise" },
  { label: "Security", href: "/security" },
  { label: "Status", href: "/status" },
  { label: "Legal", href: "/legal/terms" },
  { label: "Dashboard", href: "https://app.nextapi.top" },
] as const

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
            {LINKS.map((l) => (
              <Link
                key={l.label}
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
