"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Bot, Check, ChevronDown, Clapperboard, FileText, Image as ImageIcon, Search, Sparkles, UserRound, Video } from "lucide-react"
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

export function ProviderLogo({ item, className }: { item: AIModelCatalogItem; className?: string }) {
  const Icon =
    item.category === "text" ? FileText :
      item.category === "image" ? ImageIcon :
        item.category === "video" ? Video :
          item.category === "avatar" ? UserRound :
            item.provider === "BytePlus" ? Clapperboard :
              item.provider === "OpenAI" ? Bot :
                Sparkles

  return (
    <span
      className={cn("grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground", className)}
      title={item.provider}
    >
      <Icon className="size-4" aria-hidden="true" />
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
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null)
  const listboxId = useId()
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
  const optionItems = useMemo(() => [
    ...recommendedItems,
    ...groupedItems.flatMap((group) => group.items),
  ], [groupedItems, recommendedItems])
  const enabledOptionItems = useMemo(() => optionItems.filter((item) => item.enabled), [optionItems])
  const hasMatches = filteredItems.length > 0

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const current = enabledOptionItems.find((item) => item.id === selected?.id) ?? enabledOptionItems[0] ?? null
    setActiveOptionId(current?.id ?? null)
  }, [enabledOptionItems, open, selected?.id])

  const pickItem = useCallback((item: AIModelCatalogItem) => {
    if (!item.enabled) return
    onChange(item.id)
    setOpen(false)
  }, [onChange])

  const moveActiveOption = useCallback((delta: number) => {
    if (enabledOptionItems.length === 0) return
    setActiveOptionId((current) => {
      const currentIndex = enabledOptionItems.findIndex((item) => item.id === current)
      const safeIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = (safeIndex + delta + enabledOptionItems.length) % enabledOptionItems.length
      return enabledOptionItems[nextIndex]?.id ?? null
    })
  }, [enabledOptionItems])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (!open) {
        setOpen(true)
      } else {
        moveActiveOption(1)
      }
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        setOpen(true)
      } else {
        moveActiveOption(-1)
      }
      return
    }
    if (event.key === "Enter" && open && activeOptionId) {
      const item = enabledOptionItems.find((entry) => entry.id === activeOptionId)
      if (item) {
        event.preventDefault()
        pickItem(item)
      }
      return
    }
    if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  const dropdownClassName = cn(
    "overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-2 text-popover-foreground",
    dropdownMode === "inline"
      ? "relative mt-2 max-h-64 w-full"
      : "absolute left-0 top-full z-[80] mt-2 max-h-[min(22rem,60vh)] w-full min-w-[18rem] max-w-[calc(100vw-2rem)] sm:min-w-[24rem]",
  )

  if (!selected) return null

  return (
    <div ref={rootRef} className="relative min-w-0" onKeyDown={onKeyDown}>
      {label && <div className="mb-1 text-xs text-muted-foreground">{label}</div>}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-[13px] transition hover:border-signal/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dense ? "h-9" : "h-10",
          open && "border-signal/45 bg-card",
        )}
      >
        <ProviderLogo item={selected} className={cn(dense ? "size-7" : "size-8")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{selected.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {selected.provider} · {modelStatusLabel(selected, statusLabels)}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {helper && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{helper}</div>}
      {open && (
        <div className={dropdownClassName}>
          {items.length > 4 && (
            <label className="mb-2 flex h-9 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-[12px] text-muted-foreground">
              <Search className="size-3.5" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={statusLabels?.searchPlaceholder ?? "Search models..."}
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId ? modelOptionDomId(listboxId, activeOptionId) : undefined}
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          )}
          {items.length === 0 && (
            <div className="rounded-md border border-border bg-muted/35 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {helper ?? "No models are available for this capability yet."}
            </div>
          )}
          {items.length > 0 && !hasMatches && (
            <div className="rounded-md border border-border bg-muted/35 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {statusLabels?.noMatches ?? "No matching models."}
            </div>
          )}
          <div id={listboxId} role="listbox" aria-label={label ?? statusLabels?.allModels ?? "Models"} aria-activedescendant={activeOptionId ? modelOptionDomId(listboxId, activeOptionId) : undefined}>
            {recommendedItems.length > 0 && (
              <div className="mb-2 rounded-lg border border-signal/20 bg-background p-1">
                <div className="flex items-center justify-between px-2 py-1 text-xs font-medium uppercase tracking-[0.14em] text-signal">
                  <span>{statusLabels?.recommended ?? "Recommended"}</span>
                  <span>{statusLabels?.bestForFlow ?? "Best fit"}</span>
                </div>
                {recommendedItems.map((item) => (
                  <ModelOption
                    key={`recommended-${item.id}`}
                    id={modelOptionDomId(listboxId, item.id)}
                    item={item}
                    active={item.id === selected.id}
                    highlighted={item.id === activeOptionId}
                    statusLabels={statusLabels}
                    onMouseEnter={() => item.enabled && setActiveOptionId(item.id)}
                    onPick={() => pickItem(item)}
                  />
                ))}
              </div>
            )}
            {groupedItems.map((group) => (
              <div key={group.provider} className="mt-1.5 first:mt-0">
                <div className="flex items-center justify-between px-2 py-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <span>{group.provider}</span>
                  <span>{group.items.length}</span>
                </div>
                {group.items.map((item) => (
                  <ModelOption
                    key={item.id}
                    id={modelOptionDomId(listboxId, item.id)}
                    item={item}
                    active={item.id === selected.id}
                    highlighted={item.id === activeOptionId}
                    statusLabels={statusLabels}
                    onMouseEnter={() => item.enabled && setActiveOptionId(item.id)}
                    onPick={() => pickItem(item)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ModelOption({
  id,
  item,
  active,
  highlighted,
  statusLabels,
  onMouseEnter,
  onPick,
}: {
  id: string
  item: AIModelCatalogItem
  active: boolean
  highlighted: boolean
  statusLabels?: ModelSelectStatusLabels
  onMouseEnter: () => void
  onPick: () => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      disabled={!item.enabled}
      onMouseEnter={onMouseEnter}
      onClick={onPick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/45",
        active ? "border-signal/30 bg-signal/10" : "border-transparent hover:border-border hover:bg-muted/55",
        highlighted && !active && "border-signal/25 bg-signal/5",
        item.enabled ? "" : "cursor-not-allowed opacity-55",
      )}
    >
      <ProviderLogo item={item} className="size-8" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium">{item.name}</span>
          <span className="shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
            {modelStatusLabel(item, statusLabels)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.description}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {item.tier && (
            <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-xs text-muted-foreground">
              {tierLabel(item.tier, statusLabels)}
            </span>
          )}
          {(item.capabilities ?? []).slice(0, 2).map((capability) => (
            <span key={capability} className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
              {capability.replace("_", " ")}
            </span>
          ))}
        </span>
      </span>
      {active && <Check className="size-4 shrink-0 text-signal" />}
    </button>
  )
}

function modelOptionDomId(listboxId: string, modelId: string) {
  return `${listboxId}-${modelId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
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
