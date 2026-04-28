"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { AI_MODEL_CATALOG, type AIModelCatalogItem, type AIModelCategory } from "@/lib/ai-model-catalog"
import { cn } from "@/lib/utils"

type ModelSelectStatusLabels = {
  live?: string
  configured?: string
  compat?: string
  comingSoon?: string
  recommended?: string
  allModels?: string
  bestForFlow?: string
  tierAdvanced?: string
  tierPrimary?: string
  tierEconomy?: string
  tierExperimental?: string
  tierCompat?: string
  searchPlaceholder?: string
  noMatches?: string
}

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
  availableModelIds,
  statusLabels,
  dropdownMode = "popover",
  dense = false,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  category: AIModelCategory
  helper?: string
  includeDisabled?: boolean
  availableModelIds?: string[]
  statusLabels?: ModelSelectStatusLabels
  dropdownMode?: "popover" | "inline"
  dense?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement | null>(null)
  const availableModelSet = availableModelIds && availableModelIds.length > 0 ? new Set(availableModelIds) : null
  const items = AI_MODEL_CATALOG.filter((item) =>
    item.category === category &&
    (!availableModelSet || availableModelSet.has(item.id)) &&
    (includeDisabled || item.enabled),
  )
  const selected = items.find((item) => item.id === value) ?? AI_MODEL_CATALOG.find((item) => item.id === value) ?? items[0]
  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return items
    return items.filter((item) => {
      const haystack = [
        item.name,
        item.id,
        item.provider,
        item.description,
        item.tier ?? "",
        ...(item.capabilities ?? []),
      ].join(" ").toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [items, normalizedQuery])
  const recommendedItems = (normalizedQuery ? [] : filteredItems)
    .filter((item) => item.enabled && (item.tier === "primary" || item.tier === "advanced" || item.status === "live"))
    .slice(0, 3)
  const recommendedIds = new Set(recommendedItems.map((item) => item.id))
  const groupedItems = filteredItems
    .filter((item) => !recommendedIds.has(item.id))
    .reduce<Array<{ provider: string; items: AIModelCatalogItem[] }>>((groups, item) => {
    const group = groups.find((entry) => entry.provider === item.provider)
    if (group) {
      group.items.push(item)
    } else {
      groups.push({ provider: item.provider, items: [item] })
    }
    return groups
  }, [])
  const hasMatches = filteredItems.length > 0

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  if (!selected) return null

  const dropdownClassName = cn(
    "overflow-y-auto overscroll-contain rounded-2xl border border-white/12 bg-popover/96 p-2 text-popover-foreground shadow-[0_24px_80px_-45px_rgba(79,70,229,0.45)] backdrop-blur-2xl scroll-thin",
    dropdownMode === "inline"
      ? "relative mt-2 max-h-64 w-full"
      : "absolute left-0 top-full z-[80] mt-2 max-h-[min(22rem,60vh)] w-full min-w-[18rem] max-w-[calc(100vw-2rem)] sm:min-w-[24rem]",
  )

  return (
    <div ref={rootRef} className="relative min-w-0">
      {label && <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border border-border/80 bg-background px-2.5 text-left text-[13px] shadow-sm transition hover:border-signal/40",
          dense ? "h-9" : "h-10",
          open && "border-signal/45 ring-4 ring-signal/10",
        )}
      >
        <ProviderLogo item={selected} className={cn("rounded-xl", dense ? "size-7" : "size-8")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{selected.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {selected.provider} · {modelStatusLabel(selected, statusLabels)}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {helper && <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{helper}</div>}
      {open && (
        <div className={dropdownClassName}>
          {items.length > 4 && (
            <label className="mb-2 flex h-9 items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-2.5 text-[12px] text-muted-foreground">
              <Search className="size-3.5" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={statusLabels?.searchPlaceholder ?? "Search models..."}
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          )}
          {items.length === 0 && (
            <div className="rounded-xl border border-border/70 bg-muted/35 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {helper ?? "No models are available for this capability yet."}
            </div>
          )}
          {items.length > 0 && !hasMatches && (
            <div className="rounded-xl border border-border/70 bg-muted/35 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {statusLabels?.noMatches ?? "No matching models."}
            </div>
          )}
          {recommendedItems.length > 0 && (
            <div className="mb-2 rounded-xl border border-signal/20 bg-signal/10 p-1">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-signal">
                <span>{statusLabels?.recommended ?? "Recommended"}</span>
                <span>{statusLabels?.bestForFlow ?? "Best fit"}</span>
              </div>
              {recommendedItems.map((item) => (
                <ModelOption
                  key={`recommended-${item.id}`}
                  item={item}
                  active={item.id === selected.id}
                  statusLabels={statusLabels}
                  onPick={() => {
                    onChange(item.id)
                    setOpen(false)
                  }}
                />
              ))}
            </div>
          )}
          {groupedItems.map((group) => (
            <div key={group.provider} className="mt-1.5 first:mt-0">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span>{group.provider}</span>
                <span>{group.items.length}</span>
              </div>
              {group.items.map((item) => (
                <ModelOption
                  key={item.id}
                  item={item}
                  active={item.id === selected.id}
                  statusLabels={statusLabels}
                  onPick={() => {
                    if (!item.enabled) return
                    onChange(item.id)
                    setOpen(false)
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ModelOption({
  item,
  active,
  statusLabels,
  onPick,
}: {
  item: AIModelCatalogItem
  active: boolean
  statusLabels?: ModelSelectStatusLabels
  onPick: () => void
}) {
  return (
    <button
      type="button"
      disabled={!item.enabled}
      onClick={onPick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-all duration-150",
        active ? "bg-signal/10 ring-1 ring-signal/25" : "hover:bg-muted/70",
        item.enabled ? "active:scale-[0.99]" : "cursor-not-allowed opacity-55",
      )}
    >
      <ProviderLogo item={item} className="size-8 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium">{item.name}</span>
          <span className="shrink-0 rounded-full border border-border/70 bg-background/45 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {modelStatusLabel(item, statusLabels)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.description}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {item.tier && (
            <span className="rounded-full border border-white/10 bg-card/45 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tierLabel(item.tier, statusLabels)}
            </span>
          )}
          {(item.capabilities ?? []).slice(0, 2).map((capability) => (
            <span key={capability} className="rounded-full border border-signal/20 bg-signal/10 px-1.5 py-0.5 text-[10px] text-signal">
              {capability.replace("_", " ")}
            </span>
          ))}
        </span>
      </span>
      {active && <Check className="size-4 shrink-0 text-signal" />}
    </button>
  )
}

function modelStatusLabel(item: AIModelCatalogItem, labels?: ModelSelectStatusLabels) {
  if (item.status === "compat") return labels?.compat ?? "Compatible"
  if (item.status === "coming_soon" || !item.enabled) return labels?.comingSoon ?? "Not live"
  if (item.status === "configured") return labels?.configured ?? "Configured"
  return labels?.live ?? "Live"
}

function tierLabel(tier: NonNullable<AIModelCatalogItem["tier"]>, labels?: ModelSelectStatusLabels) {
  if (tier === "advanced") return labels?.tierAdvanced ?? "Advanced"
  if (tier === "primary") return labels?.tierPrimary ?? "Primary"
  if (tier === "economy") return labels?.tierEconomy ?? "Economy"
  if (tier === "experimental") return labels?.tierExperimental ?? "Experimental"
  return labels?.tierCompat ?? "Compat"
}
