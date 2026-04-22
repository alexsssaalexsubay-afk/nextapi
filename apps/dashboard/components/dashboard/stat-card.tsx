import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  unit,
  trend,
  caption,
  sparkline,
  className,
}: {
  label: string
  value: string
  unit?: string
  trend?: { value: string; positive?: boolean }
  caption?: string
  sparkline?: number[]
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border/80 bg-card/50 p-5", className)}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
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
        <span className="font-mono text-[28px] font-medium tracking-tight text-foreground">
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
