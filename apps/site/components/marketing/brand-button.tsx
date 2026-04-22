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
 * (/, /pricing, /docs). Primary = indigo→purple gradient pill,
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
      ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 hover:shadow-indigo-500/70 hover:brightness-110"
      : "border border-border bg-card text-foreground hover:border-foreground/20 hover:bg-muted"

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
