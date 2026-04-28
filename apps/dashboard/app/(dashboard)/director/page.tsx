"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
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
import { Slider } from "@/components/ui/slider"
import { useTranslations } from "@/lib/i18n/context"
import { useVideoModelCatalog } from "@/lib/use-video-model-catalog"
import { createDirectorWorkflow, generateDirectorShotImages, generateDirectorShots, getDirectorStatus, listCharacters, runBackendDirectorPipeline, type CharacterRecord, type DirectorCharacterInput, type DirectorEngineStatus, type DirectorShot, type DirectorStatus, type DirectorStoryboard, type WorkflowRunResult } from "@/lib/workflows"
import { cn } from "@/lib/utils"

type BusyStage = "shots" | "images" | "workflow" | "director"
type ActionKey = BusyStage
type ActionFeedback = "success" | "error"
type ActionButtonState = "available" | "disabled" | "loading" | ActionFeedback
type ProofStepState = "done" | "active" | "waiting" | "blocked"

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
  const [maxParallel, setMaxParallel] = useState(3)
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
  const [actionFeedback, setActionFeedback] = useState<Partial<Record<ActionKey, ActionFeedback>>>({})
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
  const maxParallelLimit = Math.min(Math.max(shotCount, 1), 8)

  useEffect(() => {
    setDuration((current) => clampNumber(current, durationMin, durationMax))
  }, [durationMin, durationMax])

  useEffect(() => {
    setRatio((current) => ratioOptions.includes(current) ? current : ratioOptions[0] ?? "9:16")
  }, [ratioOptions])

  useEffect(() => {
    setResolution((current) => resolutionOptions.includes(current) ? current : resolutionOptions[0] ?? "720p")
  }, [resolutionOptions])

  useEffect(() => {
    setMaxParallel((current) => clampNumber(current, 1, maxParallelLimit))
  }, [maxParallelLimit])

  useEffect(() => {
    setActionFeedback({})
  }, [story, genre, style, shotCount, duration, maxParallel, ratio, resolution, videoModel, selectedCharacterIDs])

  function markAction(action: ActionKey, feedback: ActionFeedback) {
    setActionFeedback((current) => ({ ...current, [action]: feedback }))
  }

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
    setActionFeedback((current) => ({ ...current, shots: undefined }))
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
      markAction("shots", "success")
    } catch (e) {
      markAction("shots", "error")
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
    setActionFeedback((current) => ({ ...current, workflow: undefined }))
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
          max_parallel: maxParallel,
          characters: directorCharacters(),
        },
      })
      setWorkflowID(res.workflow.id)
      setWorkflowRun(null)
      markAction("workflow", "success")
    } catch (e) {
      markAction("workflow", "error")
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
    setActionFeedback((current) => ({ ...current, images: undefined }))
    setError(null)
    try {
      const res = await generateDirectorShotImages({ shots: storyboard.shots, style, resolution: "1024x1024" })
      setStoryboard({ ...storyboard, shots: res.shots })
      markAction("images", "success")
    } catch (e) {
      markAction("images", "error")
      setError(e instanceof Error ? e.message : labels.imageFailed)
    } finally {
      setLoading(false)
      setBusyStage(null)
    }
  }

  async function generateDirectorWorkflow() {
    setLoading(true)
    setBusyStage("director")
    setActionFeedback((current) => ({ ...current, director: undefined }))
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
          max_parallel: maxParallel,
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
      markAction("director", "success")
    } catch (e) {
      markAction("director", "error")
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
  const storyMissing = story.trim() === ""
  const directorDisabled = loading || blocked || storyMissing
  const shotsDisabled = loading || blocked || storyMissing
  const imagesDisabled = loading || imageBlocked || !storyboard
  const workflowDisabled = loading || blocked || !storyboard
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
  const directorActionState = actionButtonState(directorDisabled, busyStage === "director", actionFeedback.director)
  const shotsActionState = actionButtonState(shotsDisabled, busyStage === "shots", actionFeedback.shots)
  const imagesActionState = actionButtonState(imagesDisabled, busyStage === "images", actionFeedback.images)
  const workflowActionState = actionButtonState(workflowDisabled, busyStage === "workflow", actionFeedback.workflow)
  const selectedCharacterSet = new Set(selectedCharacterIDs)
  const selectedCharacters = characters.filter((character) => selectedCharacterSet.has(character.id))

  return (
    <DashboardShell activeHref="/director">
      <div className="space-y-3 p-3 sm:p-4">
        <section className="rounded-xl border border-border bg-card/82 p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-[240px] flex-1 items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-signal/20 bg-signal/10 text-signal">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">{labels.title}</h1>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-signal">
                  <Sparkles className="size-3" />
                  {labels.eyebrow}
                </span>
                </div>
                <p className="mt-0.5 max-w-4xl truncate text-[12px] text-muted-foreground">
                  {labels.primaryPromise}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden flex-wrap items-center gap-2 md:flex">
                <CompactMetric label={labels.estimatedShots} value={`${shotCount}`} compact />
                <CompactMetric label={labels.totalRuntime} value={`${totalDuration}s`} compact />
                <CompactMetric label={labels.estimatedBudget} value={estimatedBudget} compact />
              </div>
              <button
                type="button"
                onClick={() => setHeroExpanded((value) => !value)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Route className="size-3.5" />
                {labels.consoleRoute}
                <ChevronDown className={cn("size-3.5 transition", heroExpanded && "rotate-180")} />
              </button>
            </div>
          </div>
          {heroExpanded && (
            <div className="mt-2 grid gap-3 rounded-lg border border-border bg-background/70 p-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(280px,1fr)]">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">{labels.primaryPromise}</h2>
                <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground">{labels.storyHint}</p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                    {labels.consoleRoute}
                  </span>
                  {activeBusyLabel ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-signal/30 bg-signal/10 px-2 py-1 text-[11px] text-signal">
                      <Loader2 className="size-3 animate-spin" />
                      {activeBusyLabel}
                    </span>
                  ) : null}
                </div>
                <PipelineStepper steps={pipelineSteps} activeId={activePipelineStep} loading={loading} compact />
              </div>
            </div>
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.55fr)_320px]">
          <section className="space-y-4 rounded-xl border border-border bg-card/82 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">{labels.stepStory}</p>
                <h2 className="mt-1 text-lg font-medium tracking-tight">{labels.briefTitle}</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{labels.briefSubtitle}</p>
              </div>
              <Clapperboard className="size-5 text-signal" />
            </div>

            <details className="group rounded-lg border border-border bg-background/70 p-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">
                <span>{labels.quickPresets}</span>
                <ChevronDown className="size-3.5 transition group-open:rotate-180" />
              </summary>
              <div className="mt-2 grid gap-2">
                <PresetButton label={labels.presetShortDrama} onClick={() => usePreset(labels.presetShortDramaStory, "short drama", "cinematic realistic")} />
                <PresetButton label={labels.presetEcommerce} onClick={() => usePreset(labels.presetEcommerceStory, "ecommerce", "premium commercial")} />
                <PresetButton label={labels.presetTalkingCreator} onClick={() => usePreset(labels.presetTalkingCreatorStory, "talking creator", "clean studio")} />
              </div>
            </details>

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
            <MemoryBindingPanel labels={labels} selectedCharacters={selectedCharacters} />

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              {labels.story}
              <textarea
                className="min-h-36 rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/55 focus:border-signal/45 focus:outline-none"
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder={labels.storyPlaceholder}
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label={labels.genre} value={genre} onChange={setGenre} />
              <Field label={labels.style} value={style} onChange={setStyle} />
              <ShotCountStepper label={labels.shots} decreaseLabel={labels.decreaseShots} increaseLabel={labels.increaseShots} value={shotCount} min={1} max={12} onChange={setShotCount} />
              <RangeField label={labels.secondsPerShot} value={duration} min={durationMin} max={durationMax} onChange={setDuration} />
              <RangeField label={labels.maxParallel} value={maxParallel} min={1} max={maxParallelLimit} unit="" onChange={setMaxParallel} />
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
              dropdownMode="inline"
              dense
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

            <div className="rounded-lg border border-border bg-background/70 p-2.5">
              <ActionButton
                disabled={directorDisabled}
                state={directorActionState}
                onClick={() => void generateDirectorWorkflow()}
                labels={labels}
                variant="primary"
                className="h-10 w-full"
                icon={<Sparkles className="size-4" />}
              >
                {busyStage === "director" ? labels.working : `${labels.generateDirectorWorkflow} · ${estimatedBudget}`}
              </ActionButton>
              <div className="mt-3 grid gap-2">
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {labels.runAllHint} {labels.estimateHint}: {estimatedBudget} · {shotCount} {labels.shotUnit} · {shotCount * duration}s · {labels.maxParallel} {maxParallel}.
                </p>
                <ActionButton
                  disabled={shotsDisabled}
                  state={shotsActionState}
                  onClick={() => void generate()}
                  labels={labels}
                  compact
                  className="h-8 w-full"
                  icon={<Film className="size-3.5" />}
                >
                  {labels.generateShots}
                </ActionButton>
              </div>
              <ActionStatusRail
                labels={labels}
                items={[
                  { label: labels.actionDirector, state: directorActionState },
                  { label: labels.actionShots, state: shotsActionState },
                  { label: labels.actionImages, state: imagesActionState },
                  { label: labels.actionWorkflow, state: workflowActionState },
                ]}
              />
            </div>
          </section>

          <section className="min-h-[560px] overflow-hidden rounded-xl border border-border bg-card/82 shadow-sm">
            <div className="border-b border-border bg-muted/20 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">{labels.editShots}</p>
                  <h2 className="mt-1 text-lg font-medium tracking-tight">{labels.shotTimeline}</h2>
                  <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
                    {storyboard?.summary ?? labels.shotTimelineSubtitle}
                  </p>
                </div>
                {storyboard && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      disabled={imagesDisabled}
                      state={imagesActionState}
                      onClick={() => void generateImages()}
                      labels={labels}
                      compact
                      className="h-9"
                      icon={<ImageIcon className="size-3.5" />}
                    >
                      {labels.generateImages}
                    </ActionButton>
                    <ActionButton
                      disabled={workflowDisabled}
                      state={workflowActionState}
                      onClick={() => void createWorkflow()}
                      labels={labels}
                      variant="signal"
                      compact
                      className="h-9"
                      icon={<Workflow className="size-3.5" />}
                    >
                      {labels.createWorkflow}
                    </ActionButton>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 p-4">
              {workflowID && <WorkflowReadyCard workflowID={workflowID} run={workflowRun} labels={labels} />}
              <EngineEvidenceBanner storyboard={storyboard} status={status} labels={labels} />
              <ClosedLoopRail
                story={story}
                selectedCharacters={selectedCharacters}
                storyboard={storyboard}
                workflowID={workflowID}
                run={workflowRun}
                status={status}
                busyStage={busyStage}
                labels={labels}
              />
              {storyboard ? (
                <>
                  <ShotTimelineMap shots={storyboard.shots} labels={labels} />
                  {storyboard.shots.map((shot, index) => (
                    <ShotCard key={`${shot.shotIndex}-${index}`} shot={shot} index={index} labels={labels} onChange={(patch) => updateShot(index, patch)} />
                  ))}
                </>
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

function ActionButton({
  state,
  labels,
  icon,
  children,
  className,
  compact = false,
  variant = "secondary",
  disabled,
  onClick,
}: {
  state: ActionButtonState
  labels: ReturnType<typeof useTranslations>["directorPage"]
  icon: ReactNode
  children: ReactNode
  className?: string
  compact?: boolean
  variant?: "primary" | "secondary" | "signal"
  disabled?: boolean
  onClick: () => void
}) {
  const meta = actionStateMeta(state, labels)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition disabled:cursor-not-allowed",
        compact ? "px-3 text-[12px]" : "px-4",
        variant === "primary" && "border-foreground bg-foreground text-background hover:opacity-90 disabled:opacity-65",
        variant === "secondary" && "border-border bg-card text-foreground hover:bg-accent disabled:opacity-55",
        variant === "signal" && "border-signal/30 bg-signal/10 text-signal hover:bg-signal/15 disabled:opacity-55",
        state === "success" && "border-status-success/35 bg-status-success/10 text-status-success",
        state === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        state === "disabled" && "border-border bg-muted/35 text-muted-foreground hover:bg-muted/35 disabled:opacity-100",
        className,
      )}
    >
      {meta.icon ?? icon}
      <span className="min-w-0 truncate">{children}</span>
      <span
        className={cn(
          "ml-auto inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]",
          meta.badgeClassName,
        )}
      >
        {meta.label}
      </span>
    </button>
  )
}

function ActionStatusRail({
  labels,
  items,
}: {
  labels: ReturnType<typeof useTranslations>["directorPage"]
  items: Array<{ label: string; state: ActionButtonState }>
}) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-background/70 p-2">
      <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{labels.actionStatesTitle}</div>
      <div className="grid gap-1.5">
        {items.map((item) => {
          const meta = actionStateMeta(item.state, labels)
          return (
            <div key={item.label} className={cn("flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px]", meta.badgeClassName)}>
              <span className="truncate">{item.label}</span>
              <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.1em]">
                {meta.icon}
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EngineEvidenceBanner({ storyboard, status, labels }: { storyboard: DirectorStoryboard | null; status: DirectorStatus | null; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  const runtimeStatus = getRuntimeStatus(storyboard, status)
  const engineUsed = storyboard?.engine_used ?? runtimeStatus?.engine_used ?? status?.engine_used

  if (!engineUsed && !runtimeStatus) {
    return (
      <section className="rounded-lg border border-border bg-card/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{labels.engineEvidenceTitle}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{labels.engineEvidenceWaiting}</p>
          </div>
          <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
            engine_used: --
          </span>
        </div>
      </section>
    )
  }

  const fallbackUsed = runtimeStatus?.fallback_used ?? status?.fallback_used ?? engineUsed === "advanced_fallback"
  const title = fallbackUsed ? labels.engineEvidenceFallback : labels.engineEvidenceAdvanced
  const body = fallbackUsed ? labels.engineEvidenceFallbackBody : labels.engineEvidenceAdvancedBody

  return (
    <section
      className={cn(
        "rounded-lg border p-3",
        fallbackUsed
          ? "border-amber-500/35 bg-amber-500/10"
          : "border-status-success/35 bg-status-success/10",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border",
              fallbackUsed ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200" : "border-status-success/30 bg-status-success/10 text-status-success",
            )}
          >
            {fallbackUsed ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
          </span>
          <div className="min-w-0">
            <p className={cn("font-mono text-[10px] uppercase tracking-[0.16em]", fallbackUsed ? "text-amber-700 dark:text-amber-200" : "text-status-success")}>{labels.engineEvidenceTitle}</p>
            <h3 className="mt-1 text-sm font-medium text-foreground">{title}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>
        <div className="grid gap-1.5 text-[11px]">
          <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-muted-foreground">
            engine_used: {engineUsed ?? "--"}
          </span>
          {runtimeStatus?.reason ? (
            <span className="max-w-72 truncate rounded-md border border-border bg-background px-2 py-1 text-muted-foreground">
              {labels.fallbackReason}: {runtimeStatus.reason}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ClosedLoopRail({
  story,
  selectedCharacters,
  storyboard,
  workflowID,
  run,
  status,
  busyStage,
  labels,
}: {
  story: string
  selectedCharacters: CharacterRecord[]
  storyboard: DirectorStoryboard | null
  workflowID: string | null
  run: WorkflowRunResult | null
  status: DirectorStatus | null
  busyStage: BusyStage | null
  labels: ReturnType<typeof useTranslations>["directorPage"]
}) {
  const jobCount = run?.job_ids?.length ?? (run?.task_id ? 1 : 0)
  const hasTasks = Boolean(run?.batch_run_id || jobCount > 0)
  const mergeEnabled = status?.merge_enabled === true
  const mergeStarted = Boolean(run?.merge_job_id)
  const finalAssetProven = Boolean(runStringField(run, "final_asset_id") || runStringField(run, "final_asset_url") || runStringField(run, "asset_url"))
  const libraryProven = Boolean(runStringField(run, "library_asset_id") || runStringField(run, "asset_id"))
  const steps: Array<{ key: string; label: string; state: ProofStepState; evidence: string }> = [
    {
      key: "story",
      label: labels.loopStory,
      state: story.trim() ? "done" : "waiting",
      evidence: story.trim() ? labels.loopStoryReady : labels.loopStoryWaiting,
    },
    {
      key: "memory",
      label: labels.loopMemory,
      state: selectedCharacters.length > 0 ? "done" : "waiting",
      evidence: selectedCharacters.length > 0 ? labels.loopMemoryReady.replace("{count}", String(selectedCharacters.length)) : labels.loopMemoryWaiting,
    },
    {
      key: "storyboard",
      label: labels.loopStoryboard,
      state: storyboard ? "done" : busyStage === "shots" || busyStage === "director" ? "active" : "waiting",
      evidence: storyboard ? labels.loopStoryboardReady.replace("{count}", String(storyboard.shots.length)) : labels.loopStoryboardWaiting,
    },
    {
      key: "workflow",
      label: labels.loopWorkflow,
      state: workflowID ? "done" : busyStage === "workflow" || busyStage === "director" ? "active" : "waiting",
      evidence: workflowID ? labels.loopWorkflowReady : labels.loopWorkflowWaiting,
    },
    {
      key: "canvas",
      label: labels.loopCanvas,
      state: workflowID ? "done" : "waiting",
      evidence: workflowID ? labels.loopCanvasReady : labels.loopCanvasWaiting,
    },
    {
      key: "tasks",
      label: labels.loopTasks,
      state: hasTasks ? "done" : run ? "active" : "waiting",
      evidence: hasTasks ? labels.loopTasksReady.replace("{count}", String(jobCount)) : labels.loopTasksWaiting,
    },
    {
      key: "merge",
      label: labels.loopMerge,
      state: mergeStarted ? "done" : mergeEnabled ? (hasTasks ? "active" : "waiting") : "blocked",
      evidence: mergeStarted ? labels.loopMergeReady : mergeEnabled ? labels.loopMergeWaiting : labels.loopMergeBlocked,
    },
    {
      key: "final_asset",
      label: labels.loopFinalAsset,
      state: finalAssetProven ? "done" : run ? "active" : "waiting",
      evidence: finalAssetProven ? labels.loopFinalAssetReady : labels.loopFinalAssetWaiting,
    },
    {
      key: "asset_library",
      label: labels.loopAssetLibrary,
      state: libraryProven ? "done" : run ? "active" : "waiting",
      evidence: libraryProven ? labels.loopAssetLibraryReady : labels.loopAssetLibraryWaiting,
    },
  ]

  return (
    <section className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">{labels.loopProofTitle}</p>
          <h3 className="mt-1 text-sm font-medium text-foreground">{labels.loopProofSubtitle}</h3>
        </div>
        <span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
          {labels.loopNoSilentFallback}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {steps.map((step) => (
          <ProofStep key={step.key} label={step.label} evidence={step.evidence} state={step.state} />
        ))}
      </div>
    </section>
  )
}

function ProofStep({ label, evidence, state }: { label: string; evidence: string; state: ProofStepState }) {
  const meta = proofStepMeta(state)
  return (
    <div className={cn("min-h-24 rounded-lg border px-3 py-2", meta.className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-foreground">{label}</span>
        <span className="shrink-0">{meta.icon}</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{evidence}</p>
    </div>
  )
}

function MemoryBindingPanel({ labels, selectedCharacters }: { labels: ReturnType<typeof useTranslations>["directorPage"]; selectedCharacters: CharacterRecord[] }) {
  return (
    <section className="rounded-lg border border-border bg-background/70 p-2.5">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-600 dark:text-cyan-300">
          <Workflow className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">{labels.memoryBindingsTitle}</h3>
            <span className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {selectedCharacters.length} {labels.memoryBindingsCount}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {selectedCharacters.length > 0 ? labels.memoryBindingsSubtitle : labels.memoryBindingsEmpty}
          </p>
        </div>
      </div>
      {selectedCharacters.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {selectedCharacters.map((character) => {
            const refs = Array.isArray(character.reference_images) ? character.reference_images : []
            const cover = refs[0]
            return (
              <div key={character.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-2 py-2">
                {cover ? (
                  <img src={cover} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-background text-xs text-muted-foreground">
                    {character.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-foreground">{character.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10.5px] text-muted-foreground">
                    <span className="rounded-md border border-border bg-background px-1.5 py-0.5">{labels.memoryReferenceCount.replace("{count}", String(refs.length))}</span>
                    <span className="max-w-32 truncate rounded-md border border-border bg-background px-1.5 py-0.5 font-mono">{labels.memoryAssetID}: {character.id}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
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
          <li key={step.id} className={cn("flex items-center gap-3", compact && "rounded-md border border-border bg-card/70 px-2 py-1.5")}>
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md border font-mono text-[11px]",
                compact ? "size-6" : "size-7",
                done && "border-status-success/40 bg-status-success/10 text-status-success",
                active && "border-signal/45 bg-signal/12 text-signal",
                !done && !active && "border-border bg-card text-muted-foreground",
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
    <section className="rounded-lg border border-border bg-background/70 p-2.5">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-signal/20 bg-signal/10 text-signal">
          <UsersRound className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{labels.characterMemoryTitle}</h3>
            {selectedIDs.length > 0 ? (
              <span className="rounded-md border border-status-success/30 bg-status-success/10 px-2 py-0.5 font-mono text-[10px] text-status-success">
                {selectedIDs.length} {labels.selectedCharacters}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
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
                  "group flex min-w-32 max-w-40 items-center gap-2 rounded-lg border bg-card/70 px-2 py-2 text-left transition",
                  active ? "border-signal/45 bg-signal/12 text-foreground" : "border-border text-muted-foreground hover:border-signal/30 hover:text-foreground",
                )}
                aria-pressed={active}
              >
                {cover ? (
                  <img src={cover} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-background text-xs text-muted-foreground">
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
    <section className="space-y-3 rounded-xl border border-border bg-card/82 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-background text-signal">
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
      <section className="overflow-hidden rounded-xl border border-status-success/35 bg-status-success/10 shadow-sm">
        <div className="p-4">
          <div className="flex items-center gap-2 text-status-success">
            <CheckCircle2 className="size-4" />
            <h2 className="text-sm font-medium text-foreground">{run ? labels.workflowQueuedTitle : labels.workflowReadyTitle}</h2>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{run ? labels.workflowQueuedBody : labels.workflowReadyBody}</p>
          {run ? <RunSummary run={run} labels={labels} /> : null}
          <Link href={`/canvas?workflow=${workflowID}`} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90">
            {labels.openCanvas}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-card/82 p-4 shadow-sm">
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-success/35 bg-status-success/10 px-4 py-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckCircle2 className="size-4 text-status-success" />
          {run ? labels.workflowQueued : labels.workflowCreated}
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{workflowID}</div>
        {run ? <div className="mt-1 text-[11.5px] text-muted-foreground">{run.batch_run_id ? `${labels.batchRun}: ${run.batch_run_id}` : `${labels.runStatus}: ${run.status}`}</div> : null}
      </div>
      <Link href={`/canvas?workflow=${workflowID}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-status-success/35 bg-status-success/10 px-3 text-sm text-status-success">
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
    <div className="mt-3 grid gap-2 rounded-lg border border-border bg-background/70 p-3 text-[11.5px] text-muted-foreground">
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
    <div className="grid min-h-[380px] place-items-center rounded-lg border border-dashed border-border bg-background/55 px-6 py-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-border bg-card text-signal">
          <Sparkles className="size-5" />
        </div>
        <h3 className="mt-4 text-base font-medium">{labels.emptyTitle}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{labels.emptyBody}</p>
        <div className="mt-6 grid gap-2 text-left">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-3 rounded-lg border border-border bg-card/70 px-3 py-2 text-[12.5px] text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-md bg-signal/10 font-mono text-[11px] text-signal">{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ShotTimelineMap({ shots, labels }: { shots: DirectorShot[]; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  let cursor = 0
  const segments = shots.map((shot, index) => {
    const duration = clampNumber(Number(shot.duration || 0), 1, 60)
    const start = cursor
    cursor += duration
    return {
      shot,
      index,
      duration,
      start,
      end: cursor,
    }
  })
  const hasReferences = shots.filter((shot) => Boolean(shot.referenceImageUrl)).length

  return (
    <section className="rounded-lg border border-border bg-background/70 p-3" aria-label={labels.shotTimeline}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">{labels.shotTimeline}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {formatTimelineTime(cursor)} · {shots.length} {labels.shotUnit} · {labels.memoryReferenceCount.replace("{count}", String(hasReferences))} / {shots.length}
          </p>
        </div>
        <span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {labels.totalRuntime}: {formatTimelineTime(cursor)}
        </span>
      </div>
      <ol className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {segments.map((segment) => (
          <li key={`${segment.shot.shotIndex}-${segment.index}`} className="min-w-32 flex-1 rounded-md border border-border bg-card px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md border border-signal/25 bg-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-signal">
                S{segment.shot.shotIndex || segment.index + 1}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatTimelineTime(segment.start)}-{formatTimelineTime(segment.end)}
              </span>
            </div>
            <p className="mt-2 truncate text-[12px] font-medium text-foreground">{segment.shot.title || labels.planOnly}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
              <span className="truncate">{segment.shot.camera || labels.camera}</span>
              <span>{segment.duration}s</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ShotCard({ shot, index, labels, onChange }: { shot: DirectorShot; index: number; labels: ReturnType<typeof useTranslations>["directorPage"]; onChange: (patch: Partial<DirectorShot>) => void }) {
  const shotNumber = shot.shotIndex || index + 1
  return (
    <article className="group rounded-lg border border-border bg-background/70 p-3.5 transition-colors hover:border-signal/25 hover:bg-background">
      <div className="grid gap-3 lg:grid-cols-[150px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {shot.referenceImageUrl ? (
            <img src={shot.referenceImageUrl} alt={shot.title} className="aspect-[4/5] w-full object-cover" />
          ) : (
            <div className="grid aspect-[4/5] place-items-center bg-muted/35">
              <div className="text-center">
                <ImageIcon className="mx-auto size-7 text-signal" />
                <p className="mt-2 px-4 text-[11px] text-muted-foreground">{labels.noReference}</p>
              </div>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-signal/30 bg-signal/10 px-2 py-1 font-mono text-[11px] text-signal">
              SHOT {shotNumber}
            </span>
            <span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
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
                className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-signal/45 focus:outline-none"
                value={shot.videoPrompt}
                onChange={(e) => onChange({ videoPrompt: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {labels.imagePrompt}
              <textarea
                className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-signal/45 focus:outline-none"
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
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
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
          "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
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
    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function ProviderStatus({ label, ready, labels, enabledCopy = false }: { label: string; ready?: boolean; labels: ReturnType<typeof useTranslations>["directorPage"]; enabledCopy?: boolean }) {
  const value = ready ? (enabledCopy ? labels.enabled : labels.configured) : (enabledCopy ? labels.disabled : labels.missing)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/70 px-3 py-2 text-[12px]">
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
    <div className="rounded-lg border border-border bg-background/70 px-3 py-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">{labels.engineRuntime}</span>
        {fallbackUsed && <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-200">{labels.fallbackActive}</span>}
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
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/70 px-2 py-1.5">
      <span>{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
      <span>{label}</span>
      <ArrowRight className="size-3.5" />
    </button>
  )
}

function CompactMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("min-w-20 rounded-lg border border-border bg-background", compact ? "px-2.5 py-1.5" : "px-3 py-2")}>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-semibold tracking-tight", compact ? "text-sm" : "text-base")}>{value}</div>
    </div>
  )
}

function busyStageLabel(stage: BusyStage, labels: ReturnType<typeof useTranslations>["directorPage"]) {
  if (stage === "shots") return labels.busyShots
  if (stage === "images") return labels.busyImages
  if (stage === "workflow") return labels.busyWorkflow
  return labels.busyDirector
}

function actionButtonState(disabled: boolean, loading: boolean, feedback?: ActionFeedback): ActionButtonState {
  if (loading) return "loading"
  if (disabled) return "disabled"
  return feedback ?? "available"
}

function actionStateMeta(state: ActionButtonState, labels: ReturnType<typeof useTranslations>["directorPage"]) {
  if (state === "loading") {
    return {
      label: labels.buttonLoading,
      icon: <Loader2 className="size-3.5 animate-spin" />,
      badgeClassName: "border-signal/25 bg-signal/10 text-signal",
    }
  }
  if (state === "success") {
    return {
      label: labels.buttonSuccess,
      icon: <CheckCircle2 className="size-3.5" />,
      badgeClassName: "border-status-success/30 bg-status-success/10 text-status-success",
    }
  }
  if (state === "error") {
    return {
      label: labels.buttonFailure,
      icon: <AlertTriangle className="size-3.5" />,
      badgeClassName: "border-destructive/35 bg-destructive/10 text-destructive",
    }
  }
  if (state === "disabled") {
    return {
      label: labels.buttonDisabled,
      icon: null,
      badgeClassName: "border-border bg-muted/35 text-muted-foreground",
    }
  }
  return {
    label: labels.buttonAvailable,
    icon: null,
    badgeClassName: "border-signal/20 bg-signal/10 text-signal",
  }
}

function proofStepMeta(state: ProofStepState) {
  if (state === "done") {
    return {
      className: "border-status-success/30 bg-status-success/10",
      icon: <CheckCircle2 className="size-3.5 text-status-success" />,
    }
  }
  if (state === "active") {
    return {
      className: "border-signal/30 bg-signal/10",
      icon: <Loader2 className="size-3.5 animate-spin text-signal" />,
    }
  }
  if (state === "blocked") {
    return {
      className: "border-destructive/35 bg-destructive/10",
      icon: <AlertTriangle className="size-3.5 text-destructive" />,
    }
  }
  return {
    className: "border-border bg-card/70",
    icon: <Route className="size-3.5 text-muted-foreground" />,
  }
}

function runStringField(run: WorkflowRunResult | null, key: string) {
  if (!run) return ""
  const value = (run as unknown as Record<string, unknown>)[key]
  return typeof value === "string" ? value : ""
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}<input className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-signal/45 focus:outline-none" value={value} onChange={(e) => onChange(e.target.value)} /></label>
}

function OptionSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-signal/45 focus:outline-none"
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
    <div className="col-span-2 rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safeValue <= min}
            onClick={() => onChange(clampNumber(safeValue - 1, min, max))}
            className="grid size-7 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label={decreaseLabel}
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-8 text-center font-mono text-sm text-foreground">{safeValue}</span>
          <button
            type="button"
            disabled={safeValue >= max}
            onClick={() => onChange(clampNumber(safeValue + 1, min, max))}
            className="grid size-7 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
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
                "relative h-7 flex-1 rounded-md border text-[10px] transition",
                active && "border-signal/50 bg-signal/20 font-semibold text-signal",
                !active && filled && "border-signal/25 bg-signal/10 text-signal/80",
                !active && !filled && "border-border bg-card text-muted-foreground/70 hover:border-signal/30 hover:text-foreground",
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

function RangeField({ label, value, min, max, unit = "s", onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (value: number) => void }) {
  const safeValue = clampNumber(value, min, max)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <span className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="rounded-md border border-signal/25 bg-signal/10 px-2 py-0.5 font-mono text-sm text-signal">{safeValue}{unit}</span>
      </span>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={[safeValue]}
        onValueChange={(next) => onChange(clampNumber(next[0] ?? safeValue, min, max))}
        className="[&_[data-slot=slider-range]]:bg-signal [&_[data-slot=slider-thumb]]:border-signal [&_[data-slot=slider-thumb]]:bg-background [&_[data-slot=slider-track]]:bg-muted/70"
      />
      <span className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{min}{unit}</span>
        <span>{Math.round((min + max) / 2)}{unit}</span>
        <span>{max}{unit}</span>
      </span>
    </div>
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

function formatTimelineTime(seconds: number) {
  return `${Math.max(0, Math.round(seconds))}s`
}

function withCurrent(values: string[], current: string) {
  if (!current || values.includes(current)) return values
  return [current, ...values]
}
