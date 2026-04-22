"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

export type JobRow = {
  id: string
  status: JobStatus
  model: string
  prompt: string
  // localized credit cell. Use this instead of legacy `credits`.
  creditsAmount: string
  creditsKind: "reserved" | "billed" | "refunded"
  // Either an ISO timestamp or a simple "32s" ago value. We let
  // the consumer precompute relative display for now.
  submitted: string
  duration: string
  // deprecated but tolerated
  credits?: string
}

export const sampleJobs: JobRow[] = [
  {
    id: "job_7Hc9Xk2Lm3NpQ4rS",
    status: "running",
    model: "seedance-2.0-pro",
    prompt: "Drone orbiting a lighthouse at dusk, cinematic, 35mm",
    submitted: "32s",
    duration: "—",
    creditsAmount: "1.00",
    creditsKind: "reserved",
  },
  {
    id: "job_6Gb8Wj1Kl2MoP3qR",
    status: "queued",
    model: "seedance-2.0-pro",
    prompt: "Overhead shot of a ramen bowl, steam rising",
    submitted: "48s",
    duration: "—",
    creditsAmount: "1.00",
    creditsKind: "reserved",
  },
  {
    id: "job_5Fa7Vi0Jk1LnO2pQ",
    status: "succeeded",
    model: "seedance-2.0-pro",
    prompt: "Two climbers on a sunrise ridge, wide lens",
    submitted: "4m",
    duration: "41.2s",
    creditsAmount: "0.84",
    creditsKind: "billed",
  },
  {
    id: "job_4E9z6Uh9Ij0KmN1o",
    status: "succeeded",
    model: "seedance-2.0-lite",
    prompt: "Espresso pour in slow motion, macro",
    submitted: "11m",
    duration: "22.9s",
    creditsAmount: "0.38",
    creditsKind: "billed",
  },
  {
    id: "job_3D8y5Tg8Hi9JlM0n",
    status: "failed",
    model: "seedance-2.0-pro",
    prompt: "Abstract product shot with shifting liquid",
    submitted: "19m",
    duration: "12.4s",
    creditsAmount: "0.00",
    creditsKind: "refunded",
  },
  {
    id: "job_2C7x4Sf7Gh8IkL9m",
    status: "succeeded",
    model: "seedance-2.0-pro",
    prompt: "Low-angle tracking shot of a skateboarder",
    submitted: "32m",
    duration: "39.7s",
    creditsAmount: "1.00",
    creditsKind: "billed",
  },
]

export function JobsTable({
  rows,
  compact = false,
}: {
  rows: JobRow[]
  compact?: boolean
}) {
  const t = useTranslations()

  const kindLabel: Record<JobRow["creditsKind"], string> = {
    reserved: t.usage.reserved.toLowerCase(),
    billed: t.usage.billed.toLowerCase(),
    refunded: t.usage.refunded.toLowerCase(),
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-card/70 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.id}</th>
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.status}</th>
              {!compact && (
                <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.key}</th>
              )}
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.prompt}</th>
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.created}</th>
              {!compact && (
                <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.duration}</th>
              )}
              <th className="px-4 py-2.5 font-mono font-normal">{t.jobs.columns.billed}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  "group transition-colors hover:bg-card/60",
                  r.status === "failed" && "bg-status-failed-dim/15",
                )}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/jobs/${r.id}`}
                    className="font-mono text-[12px] text-foreground underline-offset-4 hover:underline"
                  >
                    {r.id.slice(0, 18)}…
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} />
                </td>
                {!compact && (
                  <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                    {r.model}
                  </td>
                )}
                <td className="max-w-[260px] truncate px-4 py-3 text-foreground/90">{r.prompt}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                  {r.submitted}
                </td>
                {!compact && (
                  <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                    {r.duration}
                  </td>
                )}
                <td className="px-4 py-3 font-mono text-[12px] text-foreground/90">
                  <span>{r.creditsAmount}</span>{" "}
                  <span className="text-muted-foreground">{kindLabel[r.creditsKind]}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/jobs/${r.id}`}
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
