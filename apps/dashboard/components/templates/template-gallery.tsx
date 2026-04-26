"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Clapperboard, Loader2, Megaphone, Mic2, Play } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { getBatchRun, listCharacters, listTemplates, runTemplate, runTemplateBatch, type BatchRunDetail, type CharacterRecord, type TemplateRecord } from "@/lib/workflows"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type TemplateKind = "short_drama" | "ecommerce" | "talking_creator"

type CurrentVideo = {
  id: string
  status: string
  output?: { url?: string; video_url?: string }
  error_code?: string
}

const ACTIVE_STATUSES = new Set(["queued", "submitting", "running", "retrying"])
const FALLBACK_SLUGS = [
  "short-drama-production-v1",
  "ecommerce-product-production-v1",
  "talking-creator-production-v1",
]

export function TemplateGallery() {
  const t = useTranslations()
  const labels = t.templates
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [selectedSlug, setSelectedSlug] = useState(FALLBACK_SLUGS[0])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchMode, setBatchMode] = useState<"cartesian" | "zip">("cartesian")
  const [batchVariables, setBatchVariables] = useState("")
  const [currentVideo, setCurrentVideo] = useState<CurrentVideo | null>(null)
  const [currentBatch, setCurrentBatch] = useState<BatchRunDetail | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    listTemplates()
      .then((rows) => setTemplates(rows.filter((row) => FALLBACK_SLUGS.includes(row.slug))))
      .catch(() => toast.error(labels.loadFailed))
      .finally(() => setLoading(false))
    listCharacters()
      .then(setCharacters)
      .catch(() => setCharacters([]))
  }, [labels.loadFailed])

  const cards = useMemo(() => FALLBACK_SLUGS.map((slug) => {
    const template = templates.find((item) => item.slug === slug)
    return template ?? fallbackTemplate(slug, labels)
  }), [labels, templates])

  const selected = cards.find((item) => item.slug === selectedSlug) ?? cards[0]
  const kind = templateKind(selected.slug)
  const videoURL = currentVideo?.output?.url || currentVideo?.output?.video_url

  const refreshVideo = useCallback(async (id: string) => {
    const video = await apiFetch(`/v1/videos/${id}`) as CurrentVideo
    setCurrentVideo(video)
    return video
  }, [])

  useEffect(() => {
    if (!currentVideo?.id || !ACTIVE_STATUSES.has(currentVideo.status)) return
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = setTimeout(() => {
      void refreshVideo(currentVideo.id).catch(() => undefined)
    }, 4000)
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [currentVideo?.id, currentVideo?.status, refreshVideo])

  useEffect(() => {
    if (!currentBatch?.id) return
    const summary = currentBatch.summary
    const done = summary && summary.total > 0 && summary.succeeded + summary.failed >= summary.total
    if (done) return
    const timer = setTimeout(() => {
      void getBatchRun(currentBatch.id)
        .then(setCurrentBatch)
        .catch(() => undefined)
    }, 4000)
    return () => clearTimeout(timer)
  }, [currentBatch])

  const updateInput = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    if (running) return
    setRunning(true)
    try {
      const payload = buildInputs(kind, inputs)
      const result = await runTemplate(selected.id, payload)
      setCurrentVideo({ id: result.task_id, status: result.status })
      toast.success(labels.runCreated)
      void refreshVideo(result.task_id).catch(() => undefined)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : labels.runFailed)
    } finally {
      setRunning(false)
    }
  }

  const submitBatch = async () => {
    if (batchRunning) return
    setBatchRunning(true)
    try {
      const variables = parseBatchVariables(batchVariables)
      const result = await runTemplateBatch(selected.id, {
        inputs: buildInputs(kind, inputs),
        variables,
        mode: batchMode,
        name: `${selected.name} batch`,
        max_parallel: 5,
      })
      setCurrentBatch({
        id: result.batch_run_id,
        status: result.status,
        summary: {
          total: result.total,
          queued: result.accepted,
          running: 0,
          succeeded: 0,
          failed: result.rejected,
        },
      })
      toast.success(labels.batchCreated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : labels.batchFailed)
    } finally {
      setBatchRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">{labels.eyebrow}</p>
          <h1 className="mt-2 text-[28px] font-medium tracking-tight">{labels.title}</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{labels.subtitle}</p>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">{labels.valueProof}</p>
        </div>
        <div className="rounded-full border border-border/70 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          {labels.routeHint}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((template) => (
          <TemplateCard
            key={template.slug}
            template={template}
            active={template.slug === selectedSlug}
            labels={labels}
            onClick={() => {
              setSelectedSlug(template.slug)
              setCurrentVideo(null)
            }}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-border/70 bg-card/40 p-5">
          <div className="mb-4">
            <h2 className="text-[18px] font-medium">{selected.name}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{selected.description}</p>
          </div>
          <TemplateForm kind={kind} labels={labels} inputs={inputs} onChange={updateInput} />
          <CharacterPicker
            kind={kind}
            labels={labels}
            characters={characters}
            onSelect={(key, url) => updateInput(key, url)}
          />
          <div className="mt-5 rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium">{labels.batchTitle}</div>
                <p className="mt-1 text-[12px] text-muted-foreground">{labels.batchHint}</p>
              </div>
              <select value={batchMode} onChange={(event) => setBatchMode(event.target.value as "cartesian" | "zip")} className="h-8 rounded-md border border-border/80 bg-background px-2 text-[12px]">
                <option value="cartesian">{labels.batchCartesian}</option>
                <option value="zip">{labels.batchZip}</option>
              </select>
            </div>
            <textarea
              value={batchVariables}
              onChange={(event) => setBatchVariables(event.target.value)}
              rows={5}
              placeholder={labels.batchPlaceholder}
              className="mt-3 w-full resize-none rounded-md border border-border/80 bg-background px-3 py-2 font-mono text-[11.5px] focus:outline-none"
            />
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={running || loading}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[13px] font-medium text-background disabled:opacity-60"
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {labels.generate}
            </button>
            <button
              type="button"
              onClick={submitBatch}
              disabled={batchRunning || loading}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border/80 px-5 text-[13px] font-medium disabled:opacity-60"
            >
              {batchRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {labels.generateBatch}
            </button>
            <span className="text-[12px] text-muted-foreground">{labels.reuseHint}</span>
          </div>
        </section>

        <aside className="rounded-2xl border border-border/70 bg-card/40 p-5">
          <div className="text-[13px] font-medium">{labels.resultTitle}</div>
          <div className="mt-3 rounded-xl border border-border/70 bg-background/70 p-3">
            <div className="font-mono text-[11px] text-muted-foreground">{currentVideo?.id ?? labels.noTask}</div>
            <div className="mt-2 text-[12px]">{labels.status}: {currentVideo?.status ?? "idle"}</div>
            {videoURL ? <video src={videoURL} controls className="mt-3 aspect-video w-full rounded-md bg-black object-contain" /> : null}
            {currentVideo?.error_code ? <div className="mt-2 text-[12px] text-status-failed">{currentVideo.error_code}</div> : null}
          </div>
          {currentBatch ? (
            <div className="mt-3 rounded-xl border border-border/70 bg-background/70 p-3">
              <div className="font-mono text-[11px] text-muted-foreground">{currentBatch.id}</div>
              <div className="mt-2 text-[12px]">{labels.batchStatus}: {currentBatch.status}</div>
              {currentBatch.summary ? (
                <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>{labels.total}: {currentBatch.summary.total}</span>
                  <span>{labels.succeeded}: {currentBatch.summary.succeeded}</span>
                  <span>{labels.running}: {currentBatch.summary.running}</span>
                  <span>{labels.failed}: {currentBatch.summary.failed}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function CharacterPicker({
  kind,
  labels,
  characters,
  onSelect,
}: {
  kind: TemplateKind
  labels: ReturnType<typeof useTranslations>["templates"]
  characters: CharacterRecord[]
  onSelect: (key: string, url: string) => void
}) {
  if (characters.length === 0) return null
  const target = kind === "talking_creator" ? "character_image" : "female_image"
  return (
    <div className="mt-4 rounded-xl border border-border/70 bg-background/60 p-4">
      <div className="text-[13px] font-medium">{labels.characterLibrary}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {characters.slice(0, 8).map((character) => {
          const first = Array.isArray(character.reference_images) ? character.reference_images[0] : ""
          if (!first) return null
          return (
            <button
              key={character.id}
              type="button"
              onClick={() => onSelect(target, first)}
              className="rounded-full border border-border/80 px-3 py-1 text-[12px] text-muted-foreground hover:bg-card hover:text-foreground"
            >
              {labels.useCharacter}: {character.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  active,
  labels,
  onClick,
}: {
  template: TemplateRecord
  active: boolean
  labels: ReturnType<typeof useTranslations>["templates"]
  onClick: () => void
}) {
  const Icon = template.slug.includes("ecommerce") ? Megaphone : template.slug.includes("talking") ? Mic2 : Clapperboard
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-card/40 p-4 text-left transition-colors hover:bg-card/70",
        active ? "border-signal" : "border-border/70",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/80">
          <Icon className="size-4 text-signal" />
        </span>
        <div>
          <div className="text-[14px] font-medium">{template.name}</div>
          <div className="font-mono text-[10.5px] text-muted-foreground">{template.category}</div>
        </div>
      </div>
      <p className="mt-3 min-h-10 text-[12.5px] leading-relaxed text-muted-foreground">{template.description}</p>
      <div className="mt-3 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-[12px] text-foreground">
        {pricingCopy(template.slug, labels)}
      </div>
      <div className="mt-3 font-mono text-[11px] text-muted-foreground">
        {labels.estimated}: {template.estimated_cost_cents ? `$${(template.estimated_cost_cents / 100).toFixed(2)}` : "—"}
      </div>
    </button>
  )
}

function pricingCopy(slug: string, labels: ReturnType<typeof useTranslations>["templates"]) {
  if (slug.includes("ecommerce")) return labels.ecommerce.pricing
  if (slug.includes("talking")) return labels.talking.pricing
  return labels.shortDrama.pricing
}

function TemplateForm({
  kind,
  labels,
  inputs,
  onChange,
}: {
  kind: TemplateKind
  labels: ReturnType<typeof useTranslations>["templates"]
  inputs: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  const fields = kind === "short_drama" ? labels.shortDrama.fields :
    kind === "ecommerce" ? labels.ecommerce.fields :
      labels.talking.fields
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(fields).map(([key, label]) => (
        <label key={key} className={key.includes("plot") || key.includes("script") || key.includes("selling") ? "md:col-span-2" : ""}>
          <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
          {key.includes("plot") || key.includes("script") || key.includes("selling") ? (
            <textarea
              value={inputs[key] ?? ""}
              onChange={(event) => onChange(key, event.target.value)}
              rows={4}
              className="w-full resize-none rounded-md border border-border/80 bg-background px-3 py-2 text-[12.5px] focus:outline-none"
            />
          ) : (
            <input
              value={inputs[key] ?? ""}
              onChange={(event) => onChange(key, event.target.value)}
              className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[12.5px] focus:outline-none"
            />
          )}
        </label>
      ))}
      <SelectField label={labels.duration} value={inputs.duration ?? "5"} values={["5", "10"]} onChange={(value) => onChange("duration", value)} />
      <SelectField label={labels.aspectRatio} value={inputs.aspect_ratio ?? "9:16"} values={["9:16", "16:9", "1:1"]} onChange={(value) => onChange("aspect_ratio", value)} />
      <SelectField label={labels.resolution} value={inputs.resolution ?? "1080p"} values={["480p", "720p", "1080p"]} onChange={(value) => onChange("resolution", value)} />
    </div>
  )
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[12.5px]">
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}

function buildInputs(kind: TemplateKind, inputs: Record<string, string>) {
  const base = {
    duration: Number(inputs.duration || 5),
    aspect_ratio: inputs.aspect_ratio || "9:16",
    resolution: inputs.resolution || "1080p",
  }
  if (kind === "short_drama") {
    return {
      ...base,
      female_image: inputs.female_image,
      male_image: inputs.male_image,
      scene: inputs.scene,
      plot: inputs.plot,
    }
  }
  if (kind === "ecommerce") {
    return {
      ...base,
      product_image: inputs.product_image,
      selling_points: inputs.selling_points,
      model_style: inputs.model_style,
      scene: inputs.scene,
    }
  }
  return {
    ...base,
    character_image: inputs.character_image,
    script: inputs.script,
    tone: inputs.tone,
    background: inputs.background,
  }
}

function parseBatchVariables(raw: string): Record<string, unknown[]> {
  if (!raw.trim()) return {}
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const out: Record<string, unknown[]> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) throw new Error(`Batch variable ${key} must be an array`)
    out[key] = value
  }
  return out
}

function templateKind(slug: string): TemplateKind {
  if (slug.includes("ecommerce")) return "ecommerce"
  if (slug.includes("talking")) return "talking_creator"
  return "short_drama"
}

function fallbackTemplate(slug: string, labels: ReturnType<typeof useTranslations>["templates"]): TemplateRecord {
  const kind = templateKind(slug)
  const copy = kind === "short_drama" ? labels.shortDrama : kind === "ecommerce" ? labels.ecommerce : labels.talking
  return {
    id: slug,
    slug,
    name: copy.title,
    description: copy.description,
    category: kind,
    visibility: "system",
    estimated_cost_cents: 500,
  }
}
