"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  href: string
  children: React.ReactNode
  variant?: "primary" | "outline"
  size?: "md" | "lg"
  className?: string
  showArrow?: boolean
  external?: boolean
}

/**
 * Shared brand CTA used across the landing page and marketing pages
 * (/, /pricing, /docs). Primary = indigo to purple gradient pill,
 * outline = bordered pill that adapts to the current theme.
 * Dashboard/admin buttons keep their neutral product-UI style.
 */
export function BrandButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  showArrow,
  external,
}: Props) {
  const base =
    "group relative inline-flex items-center gap-2 rounded-full font-medium transition-all"
  const sizeClass =
    size === "lg" ? "px-6 py-3 text-[14px]" : "px-5 py-3 text-[14px]"

  const variantClass =
    variant === "primary"
      ? "premium-button border border-white/20 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.42),transparent_30%),linear-gradient(110deg,#2563eb_0%,#7c3aed_42%,#db2777_100%)] text-white shadow-[0_18px_48px_-18px] shadow-fuchsia-500/70"
      : "border border-border/80 bg-card/70 text-foreground shadow-sm backdrop-blur-md hover:border-signal/30 hover:bg-card hover:shadow-[0_12px_30px_-22px] hover:shadow-signal"

  const content = (
    <>
      {children}
      {showArrow && (
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  )

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn(base, sizeClass, variantClass, className)}
      >
        {content}
      </a>
    )
  }

  return (
    <Link href={href} className={cn(base, sizeClass, variantClass, className)}>
      {content}
    </Link>
  )
}
