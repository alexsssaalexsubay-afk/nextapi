"use client"

import type { ReactNode } from "react"
import { useI18n } from "@/lib/i18n/context"
import { LocaleToggle } from "@/components/nextapi/locale-toggle"
import { Logo } from "@/components/nextapi/logo"

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useI18n()

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background px-4 overflow-hidden">
      {/* Background decoration: subtle gradient blur orb */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 -top-40 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-b from-indigo-500/10 to-transparent blur-3xl opacity-10 dark:opacity-10"
        style={{ zIndex: 0 }}
      />

      {/* Language switcher — top-right */}
      <div className="absolute top-4 right-4 z-20">
        <LocaleToggle />
      </div>

      {/* Card wrapper */}
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          {/* Logo header */}
          <a
            href="https://nextapi.top"
            className="flex justify-center"
            target="_blank"
            rel="noreferrer"
          >
            <Logo />
          </a>

          {children}
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 pb-6 text-center">
        <p className="text-[11px] text-muted-foreground">
          {t.footer?.copyright ?? "NextAPI Inc. All rights reserved."}
        </p>
      </footer>
    </div>
  )
}
