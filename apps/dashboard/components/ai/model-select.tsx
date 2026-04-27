"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { AI_MODEL_CATALOG, type AIModelCatalogItem, type AIModelCategory } from "@/lib/ai-model-catalog"
import { cn } from "@/lib/utils"

const providerStyles: Record<AIModelCatalogItem["providerSlug"], string> = {
  nextapi: "from-indigo-500 to-sky-500 text-white",
  byteplus: "from-violet-500 to-fuchsia-500 text-white",
  deepseek: "from-slate-700 to-slate-950 text-white",
  openai: "from-emerald-500 to-teal-500 text-white",
  anthropic: "from-orange-500 to-rose-500 text-white",
  google: "from-blue-500 to-emerald-500 text-white",
  "black-forest": "from-neutral-700 to-stone-950 text-white",
  qwen: "from-sky-500 to-blue-700 text-white",
  glm: "from-cyan-500 to-indigo-600 text-white",
  kimi: "from-blue-950 to-slate-700 text-white",
  minimax: "from-pink-500 to-orange-500 text-white",
  kuaishou: "from-orange-500 to-amber-500 text-white",
}

export function ProviderLogo({ item, className }: { item: AIModelCatalogItem; className?: string }) {
  return (
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[11px] font-semibold shadow-sm", providerStyles[item.providerSlug], className)}>
      {item.provider === "BytePlus" ? "B+" : item.provider === "OpenAI" ? "AI" : item.provider.slice(0, 1)}
    </span>
  )
}

export function ModelSelect({
  label,
  value,
  onChange,
  category,
  helper,
  includeDisabled = false,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  category: AIModelCategory
  helper?: string
  includeDisabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const items = AI_MODEL_CATALOG.filter((item) => item.category === category && (includeDisabled || item.enabled))
  const selected = items.find((item) => item.id === value) ?? AI_MODEL_CATALOG.find((item) => item.id === value) ?? items[0]

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  if (!selected) return null

  return (
    <div ref={rootRef} className="relative">
      {label && <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-border/80 bg-background px-3 text-left text-[13px] shadow-sm transition hover:border-signal/40"
      >
        <ProviderLogo item={selected} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{selected.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {selected.provider} · {selected.status === "compat" ? "兼容路由" : selected.enabled ? "可用" : "未配置"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {helper && <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{helper}</div>}
      {open && (
        <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-xl">
          {items.map((item) => {
            const active = item.id === selected.id
            return (
              <button
                key={item.id}
                type="button"
                disabled={!item.enabled}
                onClick={() => {
                  if (!item.enabled) return
                  onChange(item.id)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition",
                  active ? "bg-signal/10" : "hover:bg-muted/70",
                  item.enabled ? "" : "cursor-not-allowed opacity-55",
                )}
              >
                <ProviderLogo item={item} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.provider} · {item.description}</span>
                </span>
                {active && <Check className="size-4 text-signal" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
