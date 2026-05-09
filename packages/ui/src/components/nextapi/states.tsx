"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { AlertTriangle, Inbox, RefreshCcw } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type StateFrameProps = {
  tone?: "neutral" | "danger"
  className?: string
  children: ReactNode
}

function StateFrame({ tone = "neutral", className, children }: StateFrameProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border px-6 py-10 text-center",
        tone === "danger"
          ? "border-status-failed/25 bg-status-failed-dim/10"
          : "border-border/80 bg-card/40",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  primaryHref = "/dashboard/jobs/new",
  primaryLabel,
  secondaryHref = "/docs",
  secondaryLabel,
  className,
}: {
  title?: string
  description?: string
  primaryHref?: string
  primaryLabel?: string
  secondaryHref?: string
  secondaryLabel?: string
  className?: string
}) {
  const t = useTranslations()
  return (
    <StateFrame className={className}>
      <div className="relative mb-5 flex size-12 items-center justify-center rounded-xl border border-border/80 bg-card">
        <Inbox className="size-5 text-muted-foreground" />
        <span className="absolute -right-1 -top-1 size-2 rounded-full bg-status-idle" />
      </div>
      <h3 className="text-[15px] font-medium tracking-tight text-foreground">
        {title ?? t.jobs.empty.title}
      </h3>
      <p className="mt-2 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        {description ?? t.jobs.empty.description}
      </p>
      <div className="mt-5 flex items-center gap-2">
        <Link
          href={primaryHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:bg-foreground/90"
        >
          {primaryLabel ?? t.jobs.empty.cta}
        </Link>
        <Link
          href={secondaryHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card"
        >
          {secondaryLabel ?? t.jobs.empty.secondary}
        </Link>
      </div>
    </StateFrame>
  )
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  const t = useTranslations()
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 bg-card/70 px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {t.jobs.loading.title}
        </span>
        <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="size-2.5 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
          api.nextapi.top
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="h-3 w-40 rounded-sm bg-muted-foreground/10 op-shimmer" />
            <div className="h-5 w-20 rounded-full bg-muted-foreground/10 op-shimmer" />
            <div className="h-3 w-28 rounded-sm bg-muted-foreground/10 op-shimmer" />
            <div className="h-3 flex-1 rounded-sm bg-muted-foreground/10 op-shimmer" />
            <div className="h-3 w-16 rounded-sm bg-muted-foreground/10 op-shimmer" />
            <div className="h-3 w-20 rounded-sm bg-muted-foreground/10 op-shimmer" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ErrorState({
  title,
  code = "upstream_unavailable",
  requestId = "req_8fA2…bE01",
  description,
  retryHref,
  className,
}: {
  title?: string
  code?: string
  requestId?: string
  description?: string
  retryHref?: string
  className?: string
}) {
  const t = useTranslations()
  return (
    <StateFrame tone="danger" className={className}>
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-status-failed/30 bg-status-failed-dim/20">
        <AlertTriangle className="size-5 text-status-failed" />
      </div>
      <h3 className="text-[15px] font-medium tracking-tight text-foreground">
        {title ?? t.jobs.error.title}
      </h3>
      <p className="mt-2 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
        {description ?? t.jobs.error.description}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-[11.5px]">
        <dt className="text-left text-muted-foreground">{t.jobs.error.code}</dt>
        <dd className="text-left text-status-failed">{code}</dd>
        <dt className="text-left text-muted-foreground">{t.jobs.error.requestId}</dt>
        <dd className="text-left text-foreground/90">{requestId}</dd>
      </dl>

      <div className="mt-5 flex items-center gap-2">
        <Link
          href={retryHref ?? "/dashboard/jobs"}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:bg-foreground/90"
        >
          <RefreshCcw className="size-3.5" />
          {t.jobs.error.cta}
        </Link>
        <Link
          href="https://status.nextapi.top"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card"
        >
          {t.jobs.error.status}
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          {t.common.dashboard}
        </Link>
      </div>
    </StateFrame>
  )
}
