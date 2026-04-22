"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"

export function JobBackLink() {
  const t = useTranslations()
  return (
    <Link
      href="/jobs"
      className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      {t.jobs.detail.backToJobs}
    </Link>
  )
}
