"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Cpu,
  Film,
  ImageIcon,
  Loader2,
  Minus,
  Plus,
  Route,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react"
import { ModelSelect } from "@/components/ai/model-select"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { useTranslations } from "@/lib/i18n/context"
import { useVideoModelCatalog } from "@/lib/use-video-model-catalog"
import { createDirectorWorkflow, generateDirectorShotImages, generateDirectorShots, getDirectorStatus, listCharacters, runBackendDirectorPipeline, type CharacterRecord, type DirectorCharacterInput, type DirectorEngineStatus, type DirectorShot, type DirectorStatus, type DirectorStoryboard, type WorkflowRunResult } from "@/lib/workflows"
import { cn } from "@/lib/utils"

type BusyStage = "shots" | "images" | "workflow" | "director"

type PipelineStep = {
  id: "brief" | "script" | "storyboard" | "references" | "workflow" | "canvas"
  label: string
}

const DEFAULT_RATIOS = ["9:16", "16:9", "1:1"]
const DEFAULT_RESOLUTIONS = ["480p", "720p", "1080p"]

export default function DirectorPage() {
  const t = useTranslations()
  const labels = t.directorPage
  const [story, setStory] = useState("")
  const [genre, setGenre] = useState("short drama")
  const [style, setStyle] = useState("cinematic realistic")
  const [shotCount, setShotCount] = useState(3)
  const [duration, setDuration] = useState(5)
  const [ratio, setRatio] = useState("9:16")
  const [resolution, setResolution] = useState("1080p")
  const [videoModel, setVideoModel] = useState("seedance-2.0-pro")
  const [storyboard, setStoryboard] = useState<DirectorStoryboard | null>(null)
  const [status, setStatus] = useState<DirectorStatus | null>(null)
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [selectedCharacterIDs, setSelectedCharacterIDs] = useState<string[]>([])
  const [workflowID, setWorkflowID] = useState<string | null>(null)
  const [workflowRun, setWorkflowRun] = useState<WorkflowRunResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyStage, setBusyStage] = useState<BusyStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heroExpanded, setHeroExpanded] = useState(false)
  const videoCatalog = useVideoModelCatalog()

  useEffect(() => {
    getDirectorStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
    listCharacters()
      .then(setCharacters)
      .catch(() => setCharacters([]))
  }, [])

  useEffect(() => {
    if (videoCatalog.state !== "ready" || videoCatalog.modelIds.length === 0) return
    setVideoModel((current) => videoCatalog.modelIds.includes(current) ? current : videoCatalog.modelIds[0])
  }, [videoCatalog.modelIds, videoCatalog.state])

  const selectedVideoCapability = videoCatalog.modelById[videoModel]
  const durationMin = selectedVideoCapability?.minDurationSeconds ?? 4
  const durationMax = selectedVideoCapability?.maxDurationSeconds ?? 15
  const ratioOptions = selectedVideoCapability?.supportedAspectRatios?.length ? selectedVideoCapability.supportedAspectRatios : DEFAULT_RATIOS
  const resolutionOptions = selectedVideoCapability?.supportedResolutions?.length ? selectedVideoCapability.supportedResolutions : DEFAULT_RESOLUTIONS

  useEffect(() => {
    setDuration((current) => clampNumber(current, durationMin, durationMax))
  }, [durationMin, durationMax])

  useEffect(() => {
    setRatio((current) => ratioOptions.includes(current) ? current : ratioOptions[0] ?? "9:16")
  }, [ratioOptions])

  useEffect(() => {
    setResolution((current) => resolutionOptions.includes(current) ? current : resolutionOptions[0] ?? "720p")
  }, [resolutionOptions])

  function directorCharacters(): DirectorCharacterInput[] {
    const selected = new Set(selectedCharacterIDs)
    return characters
      .filter((character) => selected.has(character.id))
      .map((character) => ({
        name: character.name,
        asset_id: character.id,
        reference_images: Array.isArray(character.reference_images) ? character.reference_images : [],
      }))
  }

  async function generate() {
    setLoading(true)
    setBusyStage("shots")
    setError(null)
    setWorkflowID(null)
    setWorkflowRun(null)
    try {
      const next = await generateDirectorShots({
        engine: "advanced",
        story,
        genre,
        style,
        shot_count: shotCount,
        duration_per_shot: duration,
        characters: directorCharacters(),
      })
      setStoryboard(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.generateFailed)
    } finally {
      setLoading(false)
      setBusyStage(null)
    }
  }

  async function createWorkflow() {
    if (!storyboard) return
    setLoading(true)
    setBusyStage("workflow")
    setError(null)
    try {
      const res = await createDirectorWorkflow({
        storyboard,
        options: {
          name: storyboard.title,
          ratio,
          resolution,
          generate_audio: false,
          model: videoModel,
        },
      })
      setWorkflowID(res.workflow.id)
      setWorkflowRun(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.workflowFailed)
    } finally {
      setLoading(false)
      setBusyStage(null)
    }
  }

  async function generateImages() {
    if (!storyboard) return
    setLoading(true)
    setBusyStage("images")
    setError(null)
    try {
      const res = await generateDirectorShotImages({ shots: storyboard.shots, style, resolution: "1024x1024" })
      setStoryboard({ ...storyboard, shots: res.shots })
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.imageFailed)
    } finally {
      setLoading(false)
      setBusyStage(null)
    }
  }

  async function generateDirectorWorkflow() {
    setLoading(true)
    setBusyStage("director")
    setError(null)
    setWorkflowID(null)
    setWorkflowRun(null)
    try {
      const res = await runBackendDirectorPipeline({
        engine: "advanced",
        story,
        genre,
        style,
        shot_count: shotCount,
        duration_per_shot: duration,
        characters: directorCharacters(),
        generate_images: status?.image_provider_configured ?? false,
        run_workflow: true,
        options: {
          name: labels.directorWorkflowName,
          ratio,
          resolution,
          generate_audio: false,
          model: videoModel,
          enable_merge: true,
        },
      })
      setWorkflowID(res.record?.id ?? null)
      setWorkflowRun(res.run ?? null)
      setStoryboard({
        title: res.plan.title,
        summary: res.plan.summary,
        engine_used: res.plan.engine_used ?? res.engine_used,
        engine_status: res.plan.engine_status ?? res.engine_status,
        shots: res.plan.shots.map((shot) => ({
          shotIndex: shot.shotIndex,
          title: shot.title,
          duration: shot.duration,
          scene: shot.scene ?? "",
          camera: shot.camera,
          emotion: shot.emotion,
          action: shot.action,
          videoPrompt: shot.videoPrompt,
          imagePrompt: shot.imagePrompt ?? "",
          negativePrompt: shot.negativePrompt ?? "",
          referenceAssets: shot.referenceAssetIds ?? shot.referenceAssets ?? [],
          referenceImageUrl: shot.referenceImageUrl,
          referenceImageAssetId: shot.referenceImageAssetId,
        })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.workflowFailed)
    } finally {
      setLoading(false)
      setBusyStage(null)
    }
  }

  function updateShot(index: number, patch: Partial<DirectorShot>) {
    setStoryboard((current) => current ? {
      ...current,
      shots: current.shots.map((shot, i) => i === index ? { ...shot, ...patch } : shot),
    } : current)
  }

  function usePreset(nextStory: string, nextGenre: string, nextStyle: string) {
    setStory(nextStory)
    setGenre(nextGenre)
    setStyle(nextStyle)
    setWorkflowID(null)
  }

  const modelCatalogBlocked = videoCatalog.state !== "ready" || videoCatalog.modelIds.length === 0
  const blocked = !status?.available || modelCatalogBlocked
  const imageBlocked = status != null && !status.image_provider_configured
  const totalDuration = storyboard?.shots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0) ?? shotCount * duration
  const estimatedCostCents = estimateDirectorVideoCostCents(videoModel, shotCount, duration, videoCatalog.priceCentsPerSecond)
  const estimatedBudget = formatUSD(estimatedCostCents)
  const activePipelineStep = workflowID ? "canvas" :
    busyStage === "director" || busyStage === "workflow" ? "workflow" :
      busyStage === "images" ? "references" :
        storyboard ? "storyboard" :
          busyStage === "shots" ? "storyboard" :
            "brief"
  const pipelineSteps: PipelineStep[] = [
    { id: "brief", label: labels.pipelineBrief },
    { id: "script", label: labels.pipelineScript },
    { id: "storyboard", label: labels.pipelineStoryboard },
    { id: "references", label: labels.pipelineReferences },
    { id: "workflow", label: labels.pipelineWorkflow },
    { id: "canvas", label: labels.pipelineCanvas },
  ]
  const activeBusyLabel = busyStage ? busyStageLabel(busyStage, labels) : null

  return (
    <DashboardShell activeHref="/director">
      <div className="space-y-4 p-4 sm:p-5">
        <section className="premium-surface relative overflow-hidden rounded-[24px] p-4 sm:p-5">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-56 w-72 rounded-full bg-fuchsia-500/16 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[260px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-background/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal shadow-sm backdrop-blur-md">
                  <Sparkles className="size-3" />
                  {labels.eyebrow}
                </span>
                <span className="text-[12.5px] text-muted-foreground">{labels.title}</span>
              </div>
              <h1 className="mt-2 max-w-4xl text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
                {labels.primaryPromise}
              </h1>
              {heroExpanded && (
                <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
                  {labels.storyHint}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CompactMetric label={labels.estimatedShots} value={`${shotCount}`} />
              <CompactMetric label={labels.totalRuntime} value={`${totalDuration}s`} />
              <CompactMetric label={labels.estimatedBudget} value={estimatedBudget} />
              <button
                type="button"
                onClick={() => setHeroExpanded((value) => !value)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/12 bg-card/55 px-3 text-[12px] text-muted-foreground shadow-sm backdrop-blur-md transition hover:border-signal/35 hover:text-foreground"
              >
                <Route className="size-3.5" />
                {labels.consoleRoute}
                <ChevronDown className={cn("size-3.5 transition", heroExpanded && "rotate-180")} />
              </button>
            </div>
          </div>
          {heroExpanded && (
            <div className="relative mt-4 rounded-2xl border border-white/12 bg-background/50 p-3 shadow-sm backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                  {labels.consoleRoute}
                </span>
                {activeBusyLabel ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/10 px-2 py-1 text-[11px] text-signal">
                    <Loader2 className="size-3 animate-spin" />
                    {activeBusyLabel}
                  </span>
                ) : null}
              </div>
              <PipelineStepper steps={pipelineSteps} activeId={activePipelineStep} loading={loading} compact />
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(330px,0.82fr)_minmax(0,1.4fr)_340px]">
          <section className="premium-surface space-y-5 rounded-[28px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">{labels.stepStory}</p>
                <h2 className="mt-2 text-xl font-medium tracking-tight">{labels.briefTitle}</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{labels.briefSubtitle}</p>
              </div>
              <Clapperboard className="size-5 text-signal" />
            </div>

            <div className="grid gap-2">
              <PresetButton label={labels.presetShortDrama} onClick={() => usePreset(labels.presetShortDramaStory, "short drama", "cinematic realistic")} />
              <PresetButton label={labels.presetEcommerce} onClick={() => usePreset(labels.presetEcommerceStory, "ecommerce", "premium commercial")} />
              <PresetButton label={labels.presetTalkingCreator} onClick={() => usePreset(labels.presetTalkingCreatorStory, "talking creator", "clean studio")} />
            </div>

            <CharacterMemoryPicker
              labels={labels}
              characters={characters}
              selectedIDs={selectedCharacterIDs}
              onToggle={(id) => {
                setSelectedCharacterIDs((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
                setWorkflowID(null)
                setWorkflowRun(null)
              }}
            />

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              {labels.story}
              <textarea
                className="min-h-52 rounded-3xl border border-white/12 bg-background/55 px-4 py-3 text-sm leading-relaxed text-foreground shadow-inner backdrop-blur-md placeholder:text-muted-foreground/55 focus:border-signal/45 focus:outline-none"
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder={labels.storyPlaceholder}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.genre} value={genre} onChange={setGenre} />
              <Field label={labels.style} value={style} onChange={setStyle} />
              <ShotCountStepper label={labels.shots} decreaseLabel={labels.decreaseShots} increaseLabel={labels.increaseShots} value={shotCount} min={1} max={12} onChange={setShotCount} />
              <RangeField label={labels.secondsPerShot} value={duration} min={durationMin} max={durationMax} onChange={setDuration} />
              <OptionSelect label={labels.outputRatio} value={ratio} values={withCurrent(ratioOptions, ratio)} onChange={setRatio} />
              <OptionSelect label={labels.resolution} value={resolution} values={withCurrent(resolutionOptions, resolution)} onChange={setResolution} />
            </div>

            <ModelSelect
              label={labels.modelCatalog}
              value={videoModel}
              onChange={setVideoModel}
              category="video"
              helper={modelCatalogBlocked ? labels.modelCatalogUnavailable : labels.modelCatalogHint}
              availableModelIds={videoCatalog.modelIds}
              statusLabels={{
                live: labels.online,
                configured: labels.configured,
                compat: labels.compatRoute,
                comingSoon: labels.comingSoon,
                recommended: labels.recommendedModels,
                bestForFlow: labels.bestForFlow,
                searchPlaceholder: labels.modelSearchPlaceholder,
                noMatches: labels.modelNoMatches,
                tierAdvanced: labels.tierAdvanced,
                tierPrimary: labels.tierPrimary,
                tierEconomy: labels.tierEconomy,
                tierExperimental: labels.tierExperimental,
                tierCompat: labels.tierCompat,
              }}
            />

            <div className="rounded-3xl border border-white/12 bg-background/50 p-3 shadow-sm backdrop-blur-md">
              <button
                disabled={loading || blocked || story.trim() === ""}
                onClick={() => void generateDirectorWorkflow()}
                className="premium-button inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyStage === "director" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busyStage === "director" ? labels.working : `${labels.generateDirectorWorkflow} · ${estimatedBudget}`}
              </button>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {labels.runAllHint} {labels.estimateHint}: {estimatedBudget} · {shotCount} {labels.shotUnit} · {shotCount * duration}s.
                </p>
                <button
                  disabled={loading || blocked || story.trim() === ""}
                  onClick={() => void generate()}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-card/55 px-3 text-[12px] shadow-sm backdrop-blur-md hover:border-signal/35 disabled:opacity-50"
                >
                  {busyStage === "shots" ? <Loader2 className="size-3.5 animate-spin" /> : <Film className="size-3.5" />}
                  {labels.generateShots}
                </button>
              </div>
            </div>
          </section>

          <section className="premium-surface min-h-[680px] overflow-hidden rounded-[28px]">
            <div className="border-b border-white/10 bg-background/30 px-5 py-4 backdrop-blur-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">{labels.editShots}</p>
                  <h2 className="mt-2 text-xl font-medium tracking-tight">{labels.shotTimeline}</h2>
                  <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
                    {storyboard?.summary ?? labels.shotTimelineSubtitle}
                  </p>
                </div>
                {storyboard && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={loading || imageBlocked}
                      onClick={() => void generateImages()}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-card/55 px-3 text-sm shadow-sm backdrop-blur-md disabled:opacity-50"
                    >
                      {busyStage === "images" ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
                      {labels.generateImages}
                    </button>
                    <button
                      disabled={loading || blocked}
                      onClick={() => void createWorkflow()}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 text-sm text-signal disabled:opacity-50"
                    >
                      {busyStage === "workflow" ? <Loader2 className="size-3.5 animate-spin" /> : <Workflow className="size-3.5" />}
                      {labels.createWorkflow}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 p-5">
              {workflowID && <WorkflowReadyCard workflowID={workflowID} run={workflowRun} labels={labels} />}
              {storyboard ? (
                storyboard.shots.map((shot, index) => (
                  <ShotCard key={`${shot.shotIndex}-${index}`} shot={shot} index={index} labels={labels} onChange={(patch) => updateShot(index, patch)} />
                ))
              ) : (
                <EmptyStoryboard labels={labels} />
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <RuntimePanel status={status} storyboard={storyboard} labels={labels} />
            <HandoffPanel workflowID={workflowID} run={workflowRun} labels={labels} />
          </aside>
        </div>
      </div>
    </DashboardShell>
  )
}

function PipelineStepper({ steps, activeId, loading, compact = false }: { steps: PipelineStep[]; activeId: PipelineStep["id"]; loading: boolean; compact?: boolean }) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId))
  return (
    <ol className={cn(compact ? "grid gap-2 sm:grid-cols-3 xl:grid-cols-6" : "space-y-2")}>
      {steps.map((step, index) => {
        const active = index === activeIndex
        const done = index < activeIndex
        return (
          <li key={step.id} className={cn("flex items-center gap-3", compact && "rounded-xl border border-white/10 bg-card/35 px-2 py-1.5")}>
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
                compact ? "size-6" : "size-7",
                done && "border-status-success/40 bg-status-success/10 text-status-success",
                active && "border-signal/45 bg-signal/12 text-signal shadow-[0_0_28px_-14px] shadow-signal",
                !done && !active && "border-white/12 bg-card/45 text-muted-foreground",
              )}
            >
              {active && loading ? <Loader2 className="size-3.5 animate-spin" /> : done ? <CheckCircle2 className="size-3.5" /> : index + 1}
            </span>
            <span className={cn("text-[12.5px]", active ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function CharacterMemoryPicker({
  labels,
  characters,
  selectedIDs,
  onToggle,
}: {
  labels: ReturnType<typeof useTranslations>["directorPage"]
  characters: CharacterRecord[]
  selectedIDs: string[]
  onToggle: (id: string) => void
}) {
  const visible = characters.slice(0, 6)
  return (
    <section className="rounded-3xl border border-white/12 bg-background/45 p-3 shadow-sm backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-2xl border border-signal/20 bg-signal/10 text-signal">
          <UsersRound className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{labels.characterMemoryTitle}</h3>
            {selectedIDs.length > 0 ? (
              <span className="rounded-full border border-status-success/30 bg-status-success/10 px-2 py-0.5 font-mono text-[10px] text-status-success">
                {selectedIDs.length} {labels.selectedCharacters}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            {characters.length > 0 ? labels.characterMemorySubtitle : labels.characterMemoryEmpty}
          </p>
        </div>
      </div>
      {visible.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {visible.map((character) => {
            const active = selectedIDs.includes(character.id)
            const cover = Array.isArray(character.reference_images) ? character.reference_images[0] : ""
            return (
              <button
                key={character.id}
                type="button"
                onClick={() => onToggle(character.id)}
                className={cn(
                  "group flex min-w-32 max-w-40 items-center gap-2 rounded-2xl border bg-card/45 px-2 py-2 text-left transition",
                  active ? "border-signal/45 bg-signal/12 text-foreground shadow-[0_0_26px_-18px] shadow-signal" : "border-white/10 text-muted-foreground hover:border-signal/30 hover:text-foreground",
                )}
                aria-pressed={active}
              >
                {cover ? (
                  <img src={cover} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background/65 text-xs text-muted-foreground">
                    {character.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium">{character.name}</span>
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{active ? labels.characterSelected : labels.useCharacterMemory}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function RuntimePanel({ status, storyboard, labels }: { status: DirectorStatus | null; storyboard: DirectorStoryboard | null; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  return (
    <section className="premium-surface space-y-3 rounded-[28px] p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-2xl border border-white/12 bg-background/60 text-signal shadow-sm backdrop-blur-md">
          <Cpu className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-medium">{labels.runtimeTitle}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{labels.runtimeSubtitle}</p>
        </div>
      </div>
      <StatusBanner status={status} labels={labels} />
      <div className="grid gap-2">
        <ProviderStatus label={labels.textProvider} ready={status?.text_provider_configured} labels={labels} />
        <ProviderStatus label={labels.imageProvider} ready={status?.image_provider_configured} labels={labels} />
        <ProviderStatus label={labels.merge} ready={status?.merge_enabled} labels={labels} enabledCopy />
      </div>
      <EngineStatusCard storyboard={storyboard} status={status} labels={labels} />
    </section>
  )
}

function HandoffPanel({ workflowID, run, labels }: { workflowID: string | null; run: WorkflowRunResult | null; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  if (workflowID) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-status-success/35 bg-status-success/10 shadow-[0_24px_80px_-60px] shadow-status-success">
        <div className="p-4">
          <div className="flex items-center gap-2 text-status-success">
            <CheckCircle2 className="size-4" />
            <h2 className="text-sm font-medium text-foreground">{run ? labels.workflowQueuedTitle : labels.workflowReadyTitle}</h2>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{run ? labels.workflowQueuedBody : labels.workflowReadyBody}</p>
          {run ? <RunSummary run={run} labels={labels} /> : null}
          <Link href={`/canvas?workflow=${workflowID}`} className="premium-button mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-white/20 px-4 text-sm font-semibold text-white">
            {labels.openCanvas}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-[28px] border border-white/12 bg-card/40 p-4 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Workflow className="size-4 text-signal" />
        <h2 className="text-sm font-medium">{labels.nextStepTitle}</h2>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{labels.nextStepBody}</p>
    </section>
  )
}

function WorkflowReadyCard({ workflowID, run, labels }: { workflowID: string; run: WorkflowRunResult | null; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-status-success/35 bg-status-success/10 px-4 py-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckCircle2 className="size-4 text-status-success" />
          {run ? labels.workflowQueued : labels.workflowCreated}
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{workflowID}</div>
        {run ? <div className="mt-1 text-[11.5px] text-muted-foreground">{run.batch_run_id ? `${labels.batchRun}: ${run.batch_run_id}` : `${labels.runStatus}: ${run.status}`}</div> : null}
      </div>
      <Link href={`/canvas?workflow=${workflowID}`} className="inline-flex h-9 items-center gap-2 rounded-full border border-status-success/35 bg-status-success/10 px-3 text-sm text-status-success">
        {labels.openCanvas}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  )
}

function RunSummary({ run, labels }: { run: WorkflowRunResult; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  const jobs = run.job_ids?.length ?? (run.task_id ? 1 : 0)
  const hasBatchSummary = run.total != null || run.accepted != null || run.rejected != null
  return (
    <div className="mt-3 grid gap-2 rounded-2xl border border-white/12 bg-background/45 p-3 text-[11.5px] text-muted-foreground">
      <Meta label={labels.runStatus} value={run.status} />
      {hasBatchSummary ? <Meta label={labels.batchAccepted} value={`${run.accepted ?? jobs}/${run.total ?? jobs}`} /> : null}
      {run.rejected ? <Meta label={labels.batchRejected} value={String(run.rejected)} /> : null}
      {jobs > 0 ? <Meta label={labels.jobsQueued} value={String(jobs)} /> : null}
      {run.batch_run_id ? <Meta label={labels.batchRun} value={run.batch_run_id} /> : null}
      {run.merge_job_id ? <Meta label={labels.mergeJob} value={run.merge_job_id} /> : null}
    </div>
  )
}

function EmptyStoryboard({ labels }: { labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  const steps = [labels.emptyStepBrief, labels.emptyStepGenerate, labels.emptyStepCanvas]
  return (
    <div className="grid min-h-[500px] place-items-center rounded-[28px] border border-dashed border-white/14 bg-background/35 px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex size-14 items-center justify-center rounded-3xl border border-white/12 bg-card/65 text-signal shadow-sm backdrop-blur-md">
          <Sparkles className="size-6" />
        </div>
        <h3 className="mt-5 text-lg font-medium">{labels.emptyTitle}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{labels.emptyBody}</p>
        <div className="mt-6 grid gap-2 text-left">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/45 px-3 py-2 text-[12.5px] text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-full bg-signal/10 font-mono text-[11px] text-signal">{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ShotCard({ shot, index, labels, onChange }: { shot: DirectorShot; index: number; labels: ReturnType<typeof useTranslations>["directorPage"]; onChange: (patch: Partial<DirectorShot>) => void }) {
  const shotNumber = shot.shotIndex || index + 1
  return (
    <article className="group rounded-[28px] border border-white/10 bg-background/42 p-4 shadow-sm backdrop-blur-md transition-all hover:border-signal/25 hover:bg-background/55">
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-card/55">
          {shot.referenceImageUrl ? (
            <img src={shot.referenceImageUrl} alt={shot.title} className="aspect-[4/5] w-full object-cover" />
          ) : (
            <div className="grid aspect-[4/5] place-items-center bg-[radial-gradient(circle_at_35%_18%,rgba(124,58,237,0.28),transparent_35%),linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]">
              <div className="text-center">
                <ImageIcon className="mx-auto size-7 text-signal" />
                <p className="mt-2 px-4 text-[11px] text-muted-foreground">{labels.noReference}</p>
              </div>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-signal/30 bg-signal/10 px-2 py-1 font-mono text-[11px] text-signal">
              SHOT {shotNumber}
            </span>
            <span className="rounded-full border border-white/12 bg-card/45 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {shot.duration}s
            </span>
          </div>
          <input
            className="mt-3 w-full bg-transparent text-base font-medium tracking-tight outline-none"
            value={shot.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <div className="mt-3 grid gap-2 text-[11.5px] text-muted-foreground md:grid-cols-3">
            <Meta label={labels.camera} value={shot.camera || labels.planOnly} />
            <Meta label={labels.emotion} value={shot.emotion || labels.planOnly} />
            <Meta label={labels.action} value={shot.action || labels.planOnly} />
          </div>
          <div className="mt-4 grid gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {labels.videoPrompt}
              <textarea
                className="min-h-24 rounded-2xl border border-white/12 bg-background/60 px-3 py-2 text-sm text-foreground focus:border-signal/45 focus:outline-none"
                value={shot.videoPrompt}
                onChange={(e) => onChange({ videoPrompt: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {labels.imagePrompt}
              <textarea
                className="min-h-20 rounded-2xl border border-white/12 bg-background/60 px-3 py-2 text-sm text-foreground focus:border-signal/45 focus:outline-none"
                value={shot.imagePrompt}
                onChange={(e) => onChange({ imagePrompt: e.target.value })}
              />
            </label>
          </div>
        </div>
      </div>
    </article>
  )
}

function StatusBanner({ status, labels }: { status: DirectorStatus | null; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/12 bg-background/55 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-md">
        <Loader2 className="size-3.5 animate-spin text-signal" />
        {labels.statusLoading}
      </div>
    )
  }
  if (status.available) {
    const runtimeStatus = getRuntimeStatus(null, status)
    const fallbackUsed = runtimeStatus?.fallback_used ?? status.fallback_used ?? runtimeStatus?.engine_used === "advanced_fallback"
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-2xl px-3 py-2 text-xs",
          fallbackUsed
            ? "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
            : "border border-status-success/35 bg-status-success/10 text-status-success",
        )}
      >
        {fallbackUsed ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />}
        <span>{fallbackUsed ? `${labels.fallbackActive} · ${labels.usageNotice}` : labels.usageNotice}</span>
      </div>
    )
  }
  const text = status.blocking_reason === "vip_required" ? labels.vipRequired : labels.providerMissing
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function ProviderStatus({ label, ready, labels, enabledCopy = false }: { label: string; ready?: boolean; labels: ReturnType<typeof useTranslations>["directorPage"]; enabledCopy?: boolean }) {
  const value = ready ? (enabledCopy ? labels.enabled : labels.configured) : (enabledCopy ? labels.disabled : labels.missing)
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/45 px-3 py-2 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", ready ? "text-status-success" : "text-status-failed")}>{value}</span>
    </div>
  )
}

function EngineStatusCard({ storyboard, status, labels }: { storyboard: DirectorStoryboard | null; status: DirectorStatus | null; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  const runtimeStatus = getRuntimeStatus(storyboard, status)
  const engineUsed = storyboard?.engine_used ?? runtimeStatus?.engine_used ?? status?.engine_used

  if (!engineUsed && !runtimeStatus) {
    return null
  }

  const fallbackUsed = runtimeStatus?.fallback_used ?? status?.fallback_used ?? engineUsed === "advanced_fallback"
  const configured = runtimeStatus?.sidecar_configured ?? status?.sidecar_configured
  const healthy = runtimeStatus?.sidecar_healthy ?? status?.sidecar_healthy
  const reason = runtimeStatus?.reason ?? status?.reason

  return (
    <div className="rounded-2xl border border-white/12 bg-background/55 px-3 py-3 text-xs shadow-sm backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">{labels.engineRuntime}</span>
        {fallbackUsed && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-200">{labels.fallbackActive}</span>}
      </div>
      <div className="mt-2 grid gap-2 text-muted-foreground">
        {runtimeStatus?.requested_engine && <Meta label={labels.requestedEngine} value={runtimeStatus.requested_engine} />}
        {engineUsed && <Meta label={labels.engineUsed} value={formatEngine(engineUsed, labels)} />}
        {configured !== undefined && <Meta label={labels.sidecarConfigured} value={formatBool(configured, labels)} />}
        {healthy !== undefined && <Meta label={labels.sidecarHealthy} value={formatBool(healthy, labels)} />}
      </div>
      {reason && <p className="mt-2 text-muted-foreground">{labels.fallbackReason}: {reason}</p>}
    </div>
  )
}

function getRuntimeStatus(storyboard: DirectorStoryboard | null, status: DirectorStatus | null): DirectorEngineStatus | null {
  if (storyboard?.engine_status) {
    return storyboard.engine_status
  }
  if (status?.engine_status) {
    return status.engine_status
  }
  if (status?.runtime) {
    return status.runtime
  }
  if (!status) {
    return null
  }
  if (
    status.requested_engine ||
    status.engine_used ||
    status.fallback_used !== undefined ||
    status.sidecar_configured !== undefined ||
    status.sidecar_healthy !== undefined ||
    status.reason
  ) {
    return {
      requested_engine: status.requested_engine,
      engine_used: status.engine_used,
      fallback_used: status.fallback_used,
      sidecar_configured: status.sidecar_configured,
      sidecar_healthy: status.sidecar_healthy,
      reason: status.reason,
    }
  }
  return null
}

function formatEngine(engine: string, labels: ReturnType<typeof useTranslations>["directorPage"]) {
  if (engine === "advanced_sidecar") return labels.engineAdvancedSidecar
  if (engine === "advanced_fallback") return labels.engineAdvancedFallback
  if (engine === "nextapi") return labels.engineNextapi
  return engine
}

function formatBool(value: boolean, labels: ReturnType<typeof useTranslations>["directorPage"]) {
  return value ? labels.yes : labels.no
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-card/40 px-2 py-1.5">
      <span>{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between rounded-2xl border border-white/12 bg-background/45 px-3 py-2 text-left text-[12.5px] text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:border-signal/35 hover:text-foreground">
      <span>{label}</span>
      <ArrowRight className="size-3.5" />
    </button>
  )
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-2xl border border-white/12 bg-background/55 px-3 py-2 shadow-sm backdrop-blur-md">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tracking-tight">{value}</div>
    </div>
  )
}

function busyStageLabel(stage: BusyStage, labels: ReturnType<typeof useTranslations>["directorPage"]) {
  if (stage === "shots") return labels.busyShots
  if (stage === "images") return labels.busyImages
  if (stage === "workflow") return labels.busyWorkflow
  return labels.busyDirector
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}<input className="h-9 rounded-2xl border border-white/12 bg-background/55 px-3 text-sm text-foreground shadow-inner backdrop-blur-md focus:border-signal/45 focus:outline-none" value={value} onChange={(e) => onChange(e.target.value)} /></label>
}

function OptionSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-2xl border border-white/12 bg-background/55 px-3 text-sm text-foreground shadow-inner backdrop-blur-md focus:border-signal/45 focus:outline-none"
      >
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}

function ShotCountStepper({ label, decreaseLabel, increaseLabel, value, min, max, onChange }: { label: string; decreaseLabel: string; increaseLabel: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const safeValue = clampNumber(value, min, max)
  const steps = Array.from({ length: max - min + 1 }, (_, index) => min + index)

  return (
    <div className="col-span-2 rounded-2xl border border-white/12 bg-background/55 px-3 py-2 shadow-sm backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safeValue <= min}
            onClick={() => onChange(clampNumber(safeValue - 1, min, max))}
            className="grid size-7 place-items-center rounded-full border border-white/12 bg-card/55 text-muted-foreground transition hover:border-signal/35 hover:text-foreground disabled:opacity-40"
            aria-label={decreaseLabel}
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-8 text-center font-mono text-sm text-foreground">{safeValue}</span>
          <button
            type="button"
            disabled={safeValue >= max}
            onClick={() => onChange(clampNumber(safeValue + 1, min, max))}
            className="grid size-7 place-items-center rounded-full border border-white/12 bg-card/55 text-muted-foreground transition hover:border-signal/35 hover:text-foreground disabled:opacity-40"
            aria-label={increaseLabel}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {steps.map((step) => {
          const active = step === safeValue
          const filled = step <= safeValue
          return (
            <button
              key={step}
              type="button"
              onClick={() => onChange(step)}
              className={cn(
                "relative h-7 flex-1 rounded-full border text-[10px] transition",
                active && "border-signal/50 bg-signal/20 font-semibold text-signal shadow-[0_0_20px_-12px] shadow-signal",
                !active && filled && "border-signal/25 bg-signal/10 text-signal/80",
                !active && !filled && "border-white/10 bg-card/35 text-muted-foreground/70 hover:border-signal/30 hover:text-foreground",
              )}
              aria-pressed={active}
            >
              {step}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RangeField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const safeValue = clampNumber(value, min, max)
  const span = Math.max(1, max - min)
  const progress = ((safeValue - min) / span) * 100
  return (
    <label className="flex flex-col gap-2 rounded-2xl border border-white/12 bg-background/55 px-3 py-2 shadow-sm backdrop-blur-md">
      <span className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="rounded-full border border-signal/25 bg-signal/10 px-2 py-0.5 font-mono text-sm text-signal">{safeValue}s</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={safeValue}
        onChange={(e) => onChange(clampNumber(Number(e.target.value), min, max))}
        className="h-2 cursor-pointer rounded-full accent-signal"
        style={{ background: `linear-gradient(90deg, var(--signal) ${progress}%, transparent ${progress}%)` }}
      />
      <span className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{min}s</span>
        <span>{Math.round((min + max) / 2)}s</span>
        <span>{max}s</span>
      </span>
    </label>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function estimateDirectorVideoCostCents(model: string, shotCount: number, duration: number, prices: Record<string, number>) {
  const safeShots = clampNumber(shotCount, 1, 100)
  const safeDuration = clampNumber(duration, 4, 15)
  const centsPerSecond = prices[model] ?? (model.includes("fast") ? 10 : 15)
  return safeShots * safeDuration * centsPerSecond
}

function formatUSD(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

function withCurrent(values: string[], current: string) {
  if (!current || values.includes(current)) return values
  return [current, ...values]
}
