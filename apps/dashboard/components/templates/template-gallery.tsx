"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Clapperboard, Clock3, Layers3, Loader2, Megaphone, Mic2, Play, Route, Sparkles, Workflow } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { getBatchRun, listCharacters, listTemplates, runTemplate, runTemplateBatch, type BatchRunDetail, type CharacterRecord, type TemplateInputField, type TemplateRecord } from "@/lib/workflows"
import { useTranslations } from "@/lib/i18n/context"
import { useVideoModelCatalog } from "@/lib/use-video-model-catalog"
import { cn } from "@/lib/utils"

type TemplateKind = "short_drama" | "ecommerce" | "talking_creator"

type CurrentVideo = {
  id: string
  status: string
  output?: { url?: string; video_url?: string }
  error_code?: string
}

const ACTIVE_STATUSES = new Set(["queued", "submitting", "running", "retrying"])
const DEFAULT_TEMPLATE_MODEL = "seedance-2.0-pro"
const DEFAULT_RESOLUTIONS = ["480p", "720p", "1080p"]
const DEFAULT_RATIOS = ["9:16", "16:9", "1:1"]

type TemplateRuntimeConstraints = {
  durationMin: number
  durationMax: number
  resolutions: string[]
  ratios: string[]
}

export function TemplateGallery() {
  const t = useTranslations()
  const labels = t.templates
  const videoCatalog = useVideoModelCatalog()
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [selectedSlug, setSelectedSlug] = useState("")
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
      .then((rows) => {
        setTemplates(rows)
        setSelectedSlug((current) => current || rows[0]?.slug || "")
      })
      .catch(() => toast.error(labels.loadFailed))
      .finally(() => setLoading(false))
    listCharacters()
      .then(setCharacters)
      .catch(() => setCharacters([]))
  }, [labels.loadFailed])

  const cards = useMemo(() => templates, [templates])

  const selected = cards.find((item) => item.slug === selectedSlug) ?? cards[0]
  const kind = templateKind(selected?.slug ?? "")
  const videoURL = currentVideo?.output?.url || currentVideo?.output?.video_url
  const selectedMeta = selected ? templateMeta(selected.slug, labels) : { runtime: "—", inputs: "—", bestFor: "—" }
  const selectedRunnable = Boolean(selected?.workflow_json)
  const selectedModel = selected?.default_model || DEFAULT_TEMPLATE_MODEL
  const selectedCapability = videoCatalog.modelById[selectedModel]
  const runtimeConstraints: TemplateRuntimeConstraints = {
    durationMin: selectedCapability?.minDurationSeconds ?? 4,
    durationMax: selectedCapability?.maxDurationSeconds ?? 15,
    resolutions: selectedCapability?.supportedResolutions?.length ? selectedCapability.supportedResolutions : DEFAULT_RESOLUTIONS,
    ratios: selectedCapability?.supportedAspectRatios?.length ? selectedCapability.supportedAspectRatios : DEFAULT_RATIOS,
  }

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
    if (!selected || !selectedRunnable) {
      toast.error(labels.templateNotRunnable)
      return
    }
    setRunning(true)
    try {
      const payload = buildInputs(inputs, selected, runtimeConstraints)
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
    if (!selected || !selectedRunnable) {
      toast.error(labels.templateNotRunnable)
      return
    }
    setBatchRunning(true)
    try {
      const variables = parseBatchVariables(batchVariables)
      const result = await runTemplateBatch(selected.id, {
        inputs: buildInputs(inputs, selected, runtimeConstraints),
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
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-5 sm:py-5">
      <section className="premium-surface relative overflow-hidden rounded-[24px] p-4 sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-56 w-72 rounded-full bg-fuchsia-500/16 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-[-120px] left-1/4 h-56 w-[380px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-background/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal shadow-sm backdrop-blur-md">
              <Sparkles className="size-3" />
              {labels.eyebrow}
            </div>
            <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight sm:text-[30px]">{labels.title}</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{labels.subtitle}</p>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground">{labels.valueProof}</p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
            <TemplateHeroMetric icon={Route} label={labels.workflowCompile} value={labels.routeHint} />
            <TemplateHeroMetric icon={Clock3} label={labels.timeToRun} value={selectedMeta.runtime} />
            <TemplateHeroMetric icon={Layers3} label={labels.requiredInputs} value={selectedMeta.inputs} />
          </div>
        </div>
      </section>

      {cards.length > 0 ? (
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
      ) : (
        <NoTemplates labels={labels} loading={loading} />
      )}

      {selected ? <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="premium-surface rounded-[28px] p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">{labels.productionInputs}</p>
              <h2 className="mt-2 text-[20px] font-medium tracking-tight">{selected.name}</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{selected.description}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-background/55 px-3 py-2 text-right shadow-sm backdrop-blur-md">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{labels.estimated}</div>
              <div className="mt-1 text-sm font-medium">{selected.estimated_cost_cents ? `$${(selected.estimated_cost_cents / 100).toFixed(2)}` : "—"}</div>
            </div>
          </div>
          <div className="mb-5 grid gap-3 rounded-3xl border border-white/12 bg-background/42 p-3 md:grid-cols-3">
            <ProofPoint icon={Workflow} label={labels.workflowCompile} value={labels.routeHint} />
            <ProofPoint icon={Clock3} label={labels.timeToRun} value={selectedMeta.runtime} />
            <ProofPoint icon={CheckCircle2} label={labels.readyToRun} value={selectedMeta.bestFor} />
          </div>
          <TemplateForm template={selected} kind={kind} labels={labels} inputs={inputs} constraints={runtimeConstraints} onChange={updateInput} />
          <CharacterPicker
            kind={kind}
            labels={labels}
            characters={characters}
            onSelect={(key, url) => updateInput(key, url)}
          />
          <div className="mt-5 rounded-3xl border border-white/12 bg-background/55 p-4 shadow-sm backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium">{labels.batchTitle}</div>
                <p className="mt-1 text-[12px] text-muted-foreground">{labels.batchHint}</p>
              </div>
              <select value={batchMode} onChange={(event) => setBatchMode(event.target.value as "cartesian" | "zip")} className="h-8 rounded-full border border-white/12 bg-background/55 px-3 text-[12px] shadow-sm backdrop-blur-md">
                <option value="cartesian">{labels.batchCartesian}</option>
                <option value="zip">{labels.batchZip}</option>
              </select>
            </div>
            <textarea
              value={batchVariables}
              onChange={(event) => setBatchVariables(event.target.value)}
              rows={5}
              placeholder={labels.batchPlaceholder}
              className="mt-3 w-full resize-none rounded-2xl border border-white/12 bg-background/60 px-3 py-2 font-mono text-[11.5px] shadow-inner backdrop-blur-md focus:border-signal/45 focus:outline-none"
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={running || loading || !selectedRunnable}
              className="premium-button inline-flex h-10 items-center gap-2 rounded-full border border-white/20 px-5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {labels.generate}
            </button>
            <button
              type="button"
              onClick={submitBatch}
              disabled={batchRunning || loading || !selectedRunnable}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 bg-card/55 px-5 text-[13px] font-medium shadow-sm backdrop-blur-md disabled:opacity-60"
            >
              {batchRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {labels.generateBatch}
            </button>
            <span className="text-[12px] text-muted-foreground">{labels.reuseHint}</span>
          </div>
        </section>

        <aside className="space-y-4">
          <RunStatusPanel currentVideo={currentVideo} currentBatch={currentBatch} videoURL={videoURL} labels={labels} running={running || batchRunning} />
          <section className="rounded-[28px] border border-white/12 bg-card/40 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-signal" />
              <h3 className="text-sm font-medium">{labels.reusableCanvasTitle}</h3>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{labels.reusableCanvasBody}</p>
          </section>
        </aside>
      </div> : null}
    </div>
  )
}

function NoTemplates({ labels, loading }: { labels: ReturnType<typeof useTranslations>["templates"]; loading: boolean }) {
  return (
    <section className="premium-surface rounded-[28px] p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-3xl border border-white/12 bg-background/60 text-signal shadow-sm backdrop-blur-md">
        {loading ? <Loader2 className="size-5 animate-spin" /> : <Workflow className="size-5" />}
      </div>
      <h2 className="mt-4 text-lg font-medium">{loading ? labels.loadingTemplates : labels.noTemplatesTitle}</h2>
      <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        {loading ? labels.loadingTemplatesHint : labels.noTemplatesBody}
      </p>
    </section>
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

function TemplateHeroMetric({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-background/55 px-3 py-2 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3.5 text-signal" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

function ProofPoint({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-card/35 px-3 py-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-signal" />
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        <div className="mt-1 text-[12px] text-foreground">{value}</div>
      </div>
    </div>
  )
}

function RunStatusPanel({
  currentVideo,
  currentBatch,
  videoURL,
  labels,
  running,
}: {
  currentVideo: CurrentVideo | null
  currentBatch: BatchRunDetail | null
  videoURL?: string
  labels: ReturnType<typeof useTranslations>["templates"]
  running: boolean
}) {
  const status = currentVideo?.status ?? currentBatch?.status ?? (running ? "submitting" : "idle")
  const activeIndex = statusIndex(status)
  const steps = [
    { label: labels.queuedStep, status: "queued" },
    { label: labels.runningStep, status: "running" },
    { label: labels.succeededStep, status: "succeeded" },
  ]
  return (
    <section className="premium-surface overflow-hidden rounded-[28px]">
      <div className="border-b border-white/10 bg-background/30 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">{labels.currentRun}</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">{currentVideo || currentBatch ? labels.runningHint : labels.idleHint}</p>
          </div>
          <StatusBadge status={status} labels={labels} />
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div key={step.status} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border font-mono text-[11px]",
                  index < activeIndex && "border-status-success/40 bg-status-success/10 text-status-success",
                  index === activeIndex && "border-signal/40 bg-signal/10 text-signal",
                  index > activeIndex && "border-white/12 bg-card/40 text-muted-foreground",
                )}
              >
                {index < activeIndex ? <CheckCircle2 className="size-3.5" /> : index + 1}
              </span>
              <span className={cn("text-[12.5px]", index <= activeIndex ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/12 bg-background/60 p-3">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{labels.taskId}</div>
          <div className="mt-1 break-all font-mono text-[11px] text-foreground">{currentVideo?.id ?? currentBatch?.id ?? labels.noTask}</div>
          <div className="mt-2 text-[12px] text-muted-foreground">{labels.status}: <span className="text-foreground">{status}</span></div>
          {currentVideo?.error_code ? <div className="mt-2 rounded-xl border border-status-failed/30 bg-status-failed/10 px-3 py-2 text-[12px] text-status-failed">{currentVideo.error_code}</div> : null}
        </div>

        {videoURL ? (
          <div className="overflow-hidden rounded-3xl border border-white/12 bg-black">
            <video src={videoURL} controls className="aspect-video w-full object-contain" />
            <div className="border-t border-white/10 bg-background/80 px-3 py-2 text-[12px] text-status-success">{labels.outputReady}</div>
          </div>
        ) : null}

        {currentBatch?.summary ? (
          <div className="rounded-2xl border border-white/12 bg-background/60 p-3">
            <div className="mb-2 text-[12px] font-medium">{labels.batchSummary}</div>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
              <span>{labels.total}: {currentBatch.summary.total}</span>
              <span>{labels.succeeded}: {currentBatch.summary.succeeded}</span>
              <span>{labels.running}: {currentBatch.summary.running}</span>
              <span>{labels.failed}: {currentBatch.summary.failed}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function StatusBadge({ status, labels }: { status: string; labels: ReturnType<typeof useTranslations>["templates"] }) {
  const tone =
    status === "succeeded" ? "success" :
      status === "failed" || status === "timed_out" ? "failed" :
        status === "idle" ? "idle" :
          "running"
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em]",
        tone === "success" && "border-status-success/35 bg-status-success/10 text-status-success",
        tone === "failed" && "border-status-failed/35 bg-status-failed/10 text-status-failed",
        tone === "running" && "border-signal/35 bg-signal/10 text-signal",
        tone === "idle" && "border-white/12 bg-card/45 text-muted-foreground",
      )}
    >
      {status === "idle" ? labels.readyToRun : status}
    </span>
  )
}

function TemplatePreview({ slug }: { slug: string }) {
  const ecommerce = slug.includes("ecommerce")
  const talking = slug.includes("talking")
  return (
    <div className={cn("relative aspect-[16/9] overflow-hidden", ecommerce ? "bg-amber-500/10" : talking ? "bg-cyan-500/10" : "bg-fuchsia-500/10")}>
      <div aria-hidden className={cn("absolute inset-x-8 top-5 h-20 rounded-full blur-2xl", ecommerce ? "bg-amber-400/35" : talking ? "bg-cyan-400/35" : "bg-fuchsia-500/35")} />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_42%),radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.2),transparent_18%)]" />
      <div className="absolute bottom-3 left-3 right-3 grid grid-cols-[1fr_42px] gap-2">
        <div className="rounded-2xl border border-white/14 bg-background/60 p-2 shadow-sm backdrop-blur-md">
          <div className="h-2 w-20 rounded-full bg-signal/70" />
          <div className="mt-2 h-2 w-28 rounded-full bg-foreground/18" />
          <div className="mt-1.5 h-2 w-16 rounded-full bg-foreground/12" />
        </div>
        <div className="rounded-2xl border border-white/14 bg-background/60 p-2 shadow-sm backdrop-blur-md">
          <div className="h-full rounded-xl bg-[linear-gradient(160deg,rgba(255,255,255,0.35),rgba(255,255,255,0.06))]" />
        </div>
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
  const meta = templateMeta(template.slug, labels)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "premium-surface group overflow-hidden rounded-[28px] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-signal/35",
        active ? "border-signal/60 shadow-[0_24px_80px_-56px] shadow-signal" : "",
      )}
    >
      <div className="mb-4 overflow-hidden rounded-3xl border border-white/12 bg-background/55">
        <TemplatePreview slug={template.slug} />
      </div>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl border border-white/12 bg-background/65 shadow-sm backdrop-blur-md">
          <Icon className="size-4 text-signal" />
        </span>
        <div>
          <div className="text-[14px] font-medium">{template.name}</div>
          <div className="font-mono text-[10.5px] text-muted-foreground">{template.category}</div>
        </div>
      </div>
      <p className="mt-3 min-h-10 text-[12.5px] leading-relaxed text-muted-foreground">{template.description}</p>
      <div className="mt-3 rounded-2xl border border-white/12 bg-background/60 px-3 py-2 text-[12px] text-foreground shadow-sm backdrop-blur-md">
        {pricingCopy(template, labels)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10.5px] text-muted-foreground">
        <span className="rounded-xl border border-white/10 bg-card/35 px-2 py-1">{labels.timeToRun}: {meta.runtime}</span>
        <span className="rounded-xl border border-white/10 bg-card/35 px-2 py-1">{labels.estimated}: {template.estimated_cost_cents ? `$${(template.estimated_cost_cents / 100).toFixed(2)}` : "—"}</span>
      </div>
    </button>
  )
}

function pricingCopy(template: TemplateRecord, labels: ReturnType<typeof useTranslations>["templates"]) {
  const slug = template.slug
  if (slug.includes("ecommerce")) return labels.ecommerce.pricing
  if (slug.includes("talking")) return labels.talking.pricing
  if (!slug.includes("short-drama")) return template.description || labels.shortDrama.pricing
  return labels.shortDrama.pricing
}

function templateMeta(slug: string, labels: ReturnType<typeof useTranslations>["templates"]) {
  if (slug.includes("ecommerce")) {
    return { runtime: "5-10s", inputs: "4", bestFor: labels.ecommerce.bestFor }
  }
  if (slug.includes("talking")) {
    return { runtime: "5-10s", inputs: "4", bestFor: labels.talking.bestFor }
  }
  return { runtime: "5-10s", inputs: "4", bestFor: labels.shortDrama.bestFor }
}

function statusIndex(status: string) {
  if (status === "succeeded") return 3
  if (status === "running" || status === "retrying") return 1
  if (status === "queued" || status === "submitting") return 0
  if (status === "failed" || status === "timed_out" || status === "canceled" || status === "cancelled") return 2
  return -1
}

function TemplateForm({
  template,
  kind,
  labels,
  inputs,
  constraints,
  onChange,
}: {
  template: TemplateRecord
  kind: TemplateKind
  labels: ReturnType<typeof useTranslations>["templates"]
  inputs: Record<string, string>
  constraints: TemplateRuntimeConstraints
  onChange: (key: string, value: string) => void
}) {
  const dynamicFields = templateFields(template)
  const fallbackFields = kind === "short_drama" ? labels.shortDrama.fields :
    kind === "ecommerce" ? labels.ecommerce.fields :
      labels.talking.fields
  const entries: Array<[string, string, TemplateInputField | null]> = dynamicFields.length > 0
    ? dynamicFields.map((field) => [field.key, field.label, field])
    : Object.entries(fallbackFields).map(([key, label]) => [key, label, null])
  const defaultRatio = template.default_aspect_ratio ?? "9:16"
  const defaultResolution = template.default_resolution ?? "1080p"
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {entries.map(([key, label, field]) => (
        <label key={key} className={isLongInput(key, field) ? "md:col-span-2" : ""}>
          <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
          {isLongInput(key, field) ? (
            <textarea
              value={inputs[key] ?? ""}
              onChange={(event) => onChange(key, event.target.value)}
              rows={4}
              placeholder={field?.placeholder}
              className="w-full resize-none rounded-2xl border border-white/12 bg-background/55 px-3 py-2 text-[12.5px] shadow-inner backdrop-blur-md focus:border-signal/45 focus:outline-none"
            />
          ) : (
            <input
              value={inputs[key] ?? ""}
              onChange={(event) => onChange(key, event.target.value)}
              placeholder={field?.placeholder}
              className="h-9 w-full rounded-2xl border border-white/12 bg-background/55 px-3 text-[12.5px] shadow-inner backdrop-blur-md focus:border-signal/45 focus:outline-none"
            />
          )}
        </label>
      ))}
      <RangeField label={labels.duration} value={Number(inputs.duration || template.default_duration || constraints.durationMin)} min={constraints.durationMin} max={constraints.durationMax} onChange={(value) => onChange("duration", String(value))} />
      <SelectField label={labels.aspectRatio} value={inputs.aspect_ratio ?? defaultRatio} values={withCurrent(constraints.ratios, defaultRatio)} onChange={(value) => onChange("aspect_ratio", value)} />
      <SelectField label={labels.resolution} value={inputs.resolution ?? defaultResolution} values={withCurrent(constraints.resolutions, defaultResolution)} onChange={(value) => onChange("resolution", value)} />
    </div>
  )
}

function templateFields(template: TemplateRecord): TemplateInputField[] {
  const preferred = Array.isArray(template.recommended_inputs_schema) ? template.recommended_inputs_schema : []
  const fallback = Array.isArray(template.input_schema) ? template.input_schema : []
  return (preferred.length > 0 ? preferred : fallback)
    .filter((field) => field && typeof field.key === "string" && typeof field.label === "string")
    .filter((field) => !["duration", "aspect_ratio", "resolution"].includes(field.key))
}

function isLongInput(key: string, field: TemplateInputField | null) {
  return field?.type === "textarea" || key.includes("plot") || key.includes("script") || key.includes("selling") || key.includes("prompt") || key.includes("brief")
}

function RangeField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const safeValue = Math.min(max, Math.max(min, value))
  const progress = ((safeValue - min) / Math.max(1, max - min)) * 100
  return (
    <label className="rounded-2xl border border-white/12 bg-background/55 px-3 py-2 shadow-sm backdrop-blur-md md:col-span-2">
      <span className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="rounded-full border border-signal/25 bg-signal/10 px-2 py-0.5 font-mono text-[12px] text-signal">{safeValue}s</span>
      </span>
      <div className="mt-3 rounded-full bg-muted/55 p-1">
        <input
          type="range"
          min={min}
          max={max}
          value={safeValue}
          onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))))}
          className="h-2 w-full cursor-pointer rounded-full accent-signal"
          style={{ background: `linear-gradient(90deg, var(--signal) ${progress}%, transparent ${progress}%)` }}
        />
      </div>
      <span className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{min}s</span>
        <span>{Math.round((min + max) / 2)}s</span>
        <span>{max}s</span>
      </span>
    </label>
  )
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-2xl border border-white/12 bg-background/55 px-3 text-[12.5px] shadow-sm backdrop-blur-md">
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}

function buildInputs(inputs: Record<string, string>, template: TemplateRecord, constraints: TemplateRuntimeConstraints) {
  const requestedDuration = Number(inputs.duration || template.default_duration || constraints.durationMin)
  const requestedRatio = inputs.aspect_ratio || template.default_aspect_ratio || "9:16"
  const requestedResolution = inputs.resolution || template.default_resolution || "1080p"
  const base = {
    duration: Math.min(constraints.durationMax, Math.max(constraints.durationMin, requestedDuration)),
    aspect_ratio: constraints.ratios.includes(requestedRatio) ? requestedRatio : constraints.ratios[0] ?? "9:16",
    resolution: constraints.resolutions.includes(requestedResolution) ? requestedResolution : constraints.resolutions[0] ?? "720p",
  }
  const fields = templateFields(template)
  const allowed = fields.length > 0 ? new Set(fields.map((field) => field.key)) : null
  const out: Record<string, string | number> = { ...base }
  for (const [key, value] of Object.entries(inputs)) {
    if (["duration", "aspect_ratio", "resolution"].includes(key)) continue
    if (allowed && !allowed.has(key)) continue
    if (value !== "") out[key] = value
  }
  return out
}

function withCurrent(values: string[], current: string) {
  if (!current || values.includes(current)) return values
  return [current, ...values]
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
