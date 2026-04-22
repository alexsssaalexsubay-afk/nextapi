"use client"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { LoadingRows } from "@/components/nextapi/states"
import { useTranslations } from "@/lib/i18n/context"

export default function Loading() {
  const t = useTranslations()

  return (
    <DashboardShell
      activeHref="/jobs"
      title={t.jobs.title}
      description={t.jobs.subtitle}
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-24 rounded-md op-shimmer"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
        <LoadingRows rows={6} />
      </div>
    </DashboardShell>
  )
}
