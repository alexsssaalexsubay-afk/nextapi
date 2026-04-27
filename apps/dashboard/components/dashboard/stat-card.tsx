import type { ComponentType } from "react"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  unit,
  trend,
  caption,
  sparkline,
  icon: Icon,
  tone = "signal",
  className,
}: {
  label: string
  value: string
  unit?: string
  trend?: { value: string; positive?: boolean }
  caption?: string
  sparkline?: number[]
  icon?: ComponentType<{ className?: string }>
  tone?: "signal" | "success" | "warn" | "muted"
  className?: string
}) {
  return (
    <div className={cn("premium-surface relative flex min-h-40 flex-col gap-3 overflow-hidden rounded-3xl p-5", className)}>
      <div aria-hidden className={cn(
        "pointer-events-none absolute -right-10 -top-10 size-28 rounded-full blur-2xl",
        tone === "signal" && "bg-signal/18",
        tone === "success" && "bg-status-success/16",
        tone === "warn" && "bg-status-running/16",
        tone === "muted" && "bg-muted-foreground/10",
      )} />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span className={cn(
            "flex size-8 items-center justify-center rounded-2xl border border-white/12 bg-background/55 shadow-sm backdrop-blur-md",
            tone === "success" && "text-status-success",
            tone === "warn" && "text-status-running",
            tone === "muted" && "text-muted-foreground",
            tone === "signal" && "text-signal",
          )}>
            <Icon className="size-4" />
          </span>
        )}
        {trend && (
          <span
            className={cn(
              "font-mono text-[11px]",
              trend.positive ? "text-status-success" : "text-status-failed",
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[30px] font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {unit && <span className="text-[12.5px] text-muted-foreground">{unit}</span>}
      </div>
      {sparkline && <Sparkline data={sparkline} />}
      {caption && <div className="text-[12px] text-muted-foreground">{caption}</div>}
    </div>
  )
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = Math.max(1, max - min)
  const w = 240
  const h = 36
  const step = w / (data.length - 1)
  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(" ")

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.86 0.15 175)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="oklch(0.86 0.15 175)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke="oklch(0.86 0.15 175)"
        strokeWidth="1.25"
        points={points}
      />
      <polygon
        fill="url(#spark)"
        points={`0,${h} ${points} ${w},${h}`}
      />
    </svg>
  )
}
