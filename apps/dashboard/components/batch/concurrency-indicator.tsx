"use client"

import { Activity } from "lucide-react"

type Props = {
  inFlight: number
  burstLimit: number
  unlimited: boolean
  maxParallel?: number | null
}

export function ConcurrencyIndicator({ inFlight, burstLimit, unlimited, maxParallel }: Props) {
  const pct = unlimited ? 0 : burstLimit > 0 ? Math.min(100, (inFlight / burstLimit) * 100) : 0
  const barColor =
    pct > 90 ? "bg-destructive" : pct > 70 ? "bg-yellow-500" : "bg-emerald-500"

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <Activity className="size-4 text-muted-foreground" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">In-flight</span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {inFlight}
            {!unlimited && <span className="text-muted-foreground"> / {maxParallel ?? burstLimit}</span>}
            {unlimited && <span className="text-muted-foreground"> (unlimited)</span>}
          </span>
        </div>
        {!unlimited && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
