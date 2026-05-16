"use client"

import Link from "next/link"
import { CheckCircle2, AlertTriangle, Loader2, Clock } from "lucide-react"

type ShotStatus = {
  shot_id: string
  prompt: string
  phase: "idle" | "queued" | "running" | "succeeded" | "failed"
  jobId?: string
  videoUrl?: string
  error?: string
}

type Props = {
  shots: ShotStatus[]
}

const phaseConfig = {
  idle: { icon: Clock, color: "border-border/40 bg-muted/20", text: "text-muted-foreground", label: "Idle" },
  queued: { icon: Clock, color: "border-blue-500/30 bg-blue-500/5", text: "text-blue-500", label: "Queued" },
  running: { icon: Loader2, color: "border-amber-500/30 bg-amber-500/5", text: "text-amber-500", label: "Running" },
  succeeded: { icon: CheckCircle2, color: "border-emerald-500/30 bg-emerald-500/5", text: "text-emerald-500", label: "Succeeded" },
  failed: { icon: AlertTriangle, color: "border-destructive/30 bg-destructive/5", text: "text-destructive", label: "Failed" },
} as const

export function ProgressGrid({ shots }: Props) {
  if (!shots.length) return null

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {shots.map((shot, i) => {
        const cfg = phaseConfig[shot.phase]
        const Icon = cfg.icon

        return (
          <div
            key={shot.shot_id}
            className={`relative overflow-hidden rounded-lg border p-2.5 transition-colors ${cfg.color}`}
            aria-label={`Shot ${i + 1}: ${cfg.label}`}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">#{i + 1}</span>
              <Icon
                className={`size-3.5 ${cfg.text} ${shot.phase === "running" ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </div>
            <div className={`mb-1 rounded-md font-mono text-[10px] uppercase tracking-[0.12em] ${cfg.text}`}>
              {cfg.label}
            </div>

            {shot.videoUrl ? (
              <div className="mb-1.5 aspect-video overflow-hidden rounded bg-black/10">
                <video
                  src={shot.videoUrl}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
            ) : (
              <p className="mb-1.5 line-clamp-2 text-[11px] leading-relaxed text-foreground/80">
                {shot.prompt || "—"}
              </p>
            )}

            {shot.error && (
              <p className="line-clamp-1 text-[10px] text-destructive">{shot.error}</p>
            )}

            {shot.jobId && (
              <Link
                href={`/jobs/${shot.jobId}`}
                className="mt-1 block font-mono text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {shot.jobId.slice(0, 10)}…
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
