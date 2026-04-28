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
type DirectorWorkspaceFocus = "brief" | "storyboard" | "workflow"

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
  const [workspaceFocus, setWorkspaceFocus] = useState<DirectorWorkspaceFocus>("brief")
  const [selectedShotIndex, setSelectedShotIndex] = useState(0)
  const [actionFeedback, setActionFeedback] = useState<Partial<Record<ActionKey, ActionFeedback>>>({})
  const [error, setError] = useState<string | null>(null)
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
    if (!storyboard?.shots.length) {
      setSelectedShotIndex(0)
      return
    }
    setSelectedShotIndex((current) => clampNumber(current, 0, storyboard.shots.length - 1))
  }, [storyboard?.shots.length])

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
      setWorkspaceFocus("storyboard")
      setSelectedShotIndex(0)
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
      setWorkspaceFocus("workflow")
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
      setWorkspaceFocus("storyboard")
      setSelectedShotIndex((current) => clampNumber(current, 0, Math.max(res.shots.length - 1, 0)))
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
      setWorkspaceFocus("workflow")
      setSelectedShotIndex(0)
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
    setWorkspaceFocus("brief")
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
      <div className="p-3 sm:p-4">
        <section className="overflow-hidden rounded-xl border border-border bg-card/82 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
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
                <p className="mt-0.5 max-w-4xl truncate text-[12px] text-muted-foreground">{labels.primaryPromise}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CompactMetric label={labels.estimatedShots} value={`${shotCount}`} compact />
              <CompactMetric label={labels.totalRuntime} value={`${totalDuration}s`} compact />
              <CompactMetric label={labels.estimatedBudget} value={estimatedBudget} compact />
            </div>
          </div>

          <div className="grid min-h-[calc(100vh-9rem)] gap-3 bg-background/70 p-3 lg:grid-cols-[64px_minmax(0,1fr)] xl:grid-cols-[64px_minmax(0,1fr)_340px]">
            <DirectorToolRail
              labels={labels}
              activeId={activePipelineStep}
              focus={workspaceFocus}
              workflowID={workflowID}
              storyboard={storyboard}
              onFocusChange={setWorkspaceFocus}
            />

            <section className="relative min-h-[760px] overflow-hidden rounded-xl border border-border bg-card/86 bg-dots shadow-sm">
              <div className="absolute inset-0 bg-background/45" />
              <div className="relative z-10 flex min-h-[760px] flex-col">
                <div className="border-b border-border bg-card/76 px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      <Route className="size-3.5 text-signal" />
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

                <DirectorCanvasBoard
                  story={story}
                  genre={genre}
                  style={style}
                  shotCount={shotCount}
                  duration={duration}
                  storyboard={storyboard}
                  workflowID={workflowID}
                  workflowRun={workflowRun}
                  focus={workspaceFocus}
                  selectedShotIndex={selectedShotIndex}
                  labels={labels}
                  imagesDisabled={imagesDisabled}
                  imagesActionState={imagesActionState}
                  workflowDisabled={workflowDisabled}
                  workflowActionState={workflowActionState}
                  onFocusChange={setWorkspaceFocus}
                  onSelectShot={setSelectedShotIndex}
                  onGenerateImages={() => void generateImages()}
                  onCreateWorkflow={() => void createWorkflow()}
                  onUpdateShot={updateShot}
                />

                <DirectorComposer
                  labels={labels}
                  focus={workspaceFocus}
                  story={story}
                  setStory={setStory}
                  storyboard={storyboard}
                  workflowID={workflowID}
                  workflowRun={workflowRun}
                  selectedShotIndex={selectedShotIndex}
                  videoModel={videoModel}
                  setVideoModel={setVideoModel}
                  videoCatalog={videoCatalog}
                  modelCatalogBlocked={modelCatalogBlocked}
                  directorDisabled={directorDisabled}
                  shotsDisabled={shotsDisabled}
                  imagesDisabled={imagesDisabled}
                  workflowDisabled={workflowDisabled}
                  directorActionState={directorActionState}
                  shotsActionState={shotsActionState}
                  imagesActionState={imagesActionState}
                  workflowActionState={workflowActionState}
                  busyStage={busyStage}
                  estimatedBudget={estimatedBudget}
                  onGenerateDirector={() => void generateDirectorWorkflow()}
                  onGenerateShots={() => void generate()}
                  onGenerateImages={() => void generateImages()}
                  onCreateWorkflow={() => void createWorkflow()}
                  onSelectShot={setSelectedShotIndex}
                  onUpdateShot={updateShot}
                  onUsePreset={usePreset}
                />
              </div>
            </section>

            <aside className="space-y-3 overflow-y-auto xl:max-h-[calc(100vh-9rem)]">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <DirectorSettingsPanel
                labels={labels}
                genre={genre}
                setGenre={setGenre}
                style={style}
                setStyle={setStyle}
                shotCount={shotCount}
                setShotCount={setShotCount}
                duration={duration}
                setDuration={setDuration}
                durationMin={durationMin}
                durationMax={durationMax}
                maxParallel={maxParallel}
                setMaxParallel={setMaxParallel}
                maxParallelLimit={maxParallelLimit}
                ratio={ratio}
                setRatio={setRatio}
                ratioOptions={ratioOptions}
                resolution={resolution}
                setResolution={setResolution}
                resolutionOptions={resolutionOptions}
              />
              <ActionStatusRail
                labels={labels}
                items={[
                  { label: labels.actionDirector, state: directorActionState },
                  { label: labels.actionShots, state: shotsActionState },
                  { label: labels.actionImages, state: imagesActionState },
                  { label: labels.actionWorkflow, state: workflowActionState },
                ]}
              />
              <RuntimePanel status={status} storyboard={storyboard} labels={labels} />
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
              <HandoffPanel workflowID={workflowID} run={workflowRun} labels={labels} />
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
            </aside>
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}

function DirectorToolRail({
  labels,
  activeId,
  focus,
  workflowID,
  storyboard,
  onFocusChange,
}: {
  labels: ReturnType<typeof useTranslations>["directorPage"]
  activeId: PipelineStep["id"]
  focus: DirectorWorkspaceFocus
  workflowID: string | null
  storyboard: DirectorStoryboard | null
  onFocusChange: (focus: DirectorWorkspaceFocus) => void
}) {
  const items: Array<{ id: DirectorWorkspaceFocus | "memory" | "canvas"; label: string; icon: ReactNode; ready: boolean; focusTarget: DirectorWorkspaceFocus }> = [
    { id: "brief", label: labels.pipelineBrief, icon: <Clapperboard className="size-4" />, ready: activeId !== "brief", focusTarget: "brief" },
    { id: "memory", label: labels.characterMemoryTitle, icon: <UsersRound className="size-4" />, ready: false, focusTarget: "brief" },
    { id: "storyboard", label: labels.pipelineStoryboard, icon: <Film className="size-4" />, ready: Boolean(storyboard), focusTarget: "storyboard" },
    { id: "workflow", label: labels.pipelineWorkflow, icon: <Workflow className="size-4" />, ready: Boolean(workflowID), focusTarget: "workflow" },
    { id: "canvas", label: labels.pipelineCanvas, icon: <Route className="size-4" />, ready: Boolean(workflowID), focusTarget: "workflow" },
  ]

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card/80 p-2 lg:flex-col lg:items-center lg:overflow-visible" aria-label={labels.consoleRoute}>
      {items.map((item) => {
        const active = item.id === focus || (item.id === "canvas" && focus === "workflow" && activeId === "canvas")
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onFocusChange(item.focusTarget)}
            className={cn(
              "group flex min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-[10.5px] transition lg:min-h-16 lg:w-full lg:flex-none",
              active ? "border-signal/45 bg-signal/12 text-signal" : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
            )}
            aria-pressed={active}
          >
            <span className={cn("grid size-8 place-items-center rounded-lg border", active ? "border-signal/30 bg-signal/10" : "border-border bg-background")}>{item.icon}</span>
            <span className="max-w-full truncate">{item.label}</span>
            {item.ready ? <span className="h-1 w-1 rounded-full bg-status-success" /> : <span className="h-1 w-1 rounded-full bg-border" />}
          </button>
        )
      })}
    </nav>
  )
}

function DirectorCanvasBoard({
  story,
  genre,
  style,
  shotCount,
  duration,
  storyboard,
  workflowID,
  workflowRun,
  focus,
  selectedShotIndex,
  labels,
  imagesDisabled,
  imagesActionState,
  workflowDisabled,
  workflowActionState,
  onFocusChange,
  onSelectShot,
  onGenerateImages,
  onCreateWorkflow,
  onUpdateShot,
}: {
  story: string
  genre: string
  style: string
  shotCount: number
  duration: number
  storyboard: DirectorStoryboard | null
  workflowID: string | null
  workflowRun: WorkflowRunResult | null
  focus: DirectorWorkspaceFocus
  selectedShotIndex: number
  labels: ReturnType<typeof useTranslations>["directorPage"]
  imagesDisabled: boolean
  imagesActionState: ActionButtonState
  workflowDisabled: boolean
  workflowActionState: ActionButtonState
  onFocusChange: (focus: DirectorWorkspaceFocus) => void
  onSelectShot: (index: number) => void
  onGenerateImages: () => void
  onCreateWorkflow: () => void
  onUpdateShot: (index: number, patch: Partial<DirectorShot>) => void
}) {
  const storyReady = story.trim().length > 0
  const selectedShot = storyboard?.shots[selectedShotIndex] ?? storyboard?.shots[0]

  return (
    <div className="relative flex-1 p-4 pb-4 lg:p-5 lg:pb-[335px]">
      <div className="relative min-h-[560px]">
        <div className="pointer-events-none absolute left-[31%] right-[39%] top-[29%] hidden h-px bg-border lg:block" />
        <div className="pointer-events-none absolute left-[31%] top-[29%] hidden size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card lg:block" />
        <div className="pointer-events-none absolute right-[39%] top-[29%] hidden size-4 translate-x-1/2 -translate-y-1/2 rounded-full border border-signal/40 bg-card lg:block" />

        <div className="grid gap-4 lg:block">
          <CanvasNode
            className="lg:absolute lg:left-0 lg:top-3 lg:w-[33%]"
            active={storyReady}
            selected={focus === "brief"}
            onSelect={() => onFocusChange("brief")}
            icon={<Clapperboard className="size-4" />}
            eyebrow={labels.pipelineBrief}
            title={labels.briefTitle}
          >
            <p className={cn("line-clamp-4 text-[12.5px] leading-relaxed", storyReady ? "text-foreground" : "text-muted-foreground")}>
              {storyReady ? story : labels.storyPlaceholder}
            </p>
            <div className="mt-3 grid gap-2 text-[11.5px] text-muted-foreground">
              <Meta label={labels.genre} value={genre} />
              <Meta label={labels.style} value={style} />
              <Meta label={labels.totalRuntime} value={`${shotCount * duration}s`} />
            </div>
          </CanvasNode>

          <CanvasNode
            className="lg:absolute lg:right-0 lg:top-20 lg:w-[40%]"
            active={Boolean(storyboard)}
            selected={focus === "storyboard"}
            onSelect={() => onFocusChange("storyboard")}
            icon={<Film className="size-4" />}
            eyebrow={labels.editShots}
            title={labels.shotTimeline}
          >
            <p className="text-[12px] leading-relaxed text-muted-foreground">{storyboard?.summary ?? labels.shotTimelineSubtitle}</p>
            {storyboard ? (
              <div className="mt-3 space-y-3">
                <ShotTimelineMap shots={storyboard.shots} labels={labels} activeIndex={selectedShotIndex} onSelectShot={onSelectShot} />
                {selectedShot ? (
                  <SelectedShotPreview shot={selectedShot} index={selectedShotIndex} labels={labels} onChange={(patch) => onUpdateShot(selectedShotIndex, patch)} />
                ) : null}
              </div>
            ) : (
              <CanvasEmptyState labels={labels} />
            )}
          </CanvasNode>

          <CanvasNode
            className="lg:absolute lg:bottom-2 lg:left-[28%] lg:w-[36%]"
            active={Boolean(workflowID)}
            selected={focus === "workflow"}
            onSelect={() => onFocusChange("workflow")}
            icon={<Workflow className="size-4" />}
            eyebrow={labels.pipelineWorkflow}
            title={workflowID ? labels.workflowReadyTitle : labels.nextStepTitle}
          >
            {workflowID ? (
              <WorkflowReadyCard workflowID={workflowID} run={workflowRun} labels={labels} />
            ) : (
              <div>
                <p className="text-[12px] leading-relaxed text-muted-foreground">{labels.nextStepBody}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ActionButton
                    disabled={imagesDisabled}
                    state={imagesActionState}
                    onClick={onGenerateImages}
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
                    onClick={onCreateWorkflow}
                    labels={labels}
                    variant="signal"
                    compact
                    className="h-9"
                    icon={<Workflow className="size-3.5" />}
                  >
                    {labels.createWorkflow}
                  </ActionButton>
                </div>
              </div>
            )}
          </CanvasNode>
        </div>
      </div>
    </div>
  )
}

function DirectorComposer({
  labels,
  focus,
  story,
  setStory,
  storyboard,
  workflowID,
  workflowRun,
  selectedShotIndex,
  videoModel,
  setVideoModel,
  videoCatalog,
  modelCatalogBlocked,
  directorDisabled,
  shotsDisabled,
  imagesDisabled,
  workflowDisabled,
  directorActionState,
  shotsActionState,
  imagesActionState,
  workflowActionState,
  busyStage,
  estimatedBudget,
  onGenerateDirector,
  onGenerateShots,
  onGenerateImages,
  onCreateWorkflow,
  onSelectShot,
  onUpdateShot,
  onUsePreset,
}: {
  labels: ReturnType<typeof useTranslations>["directorPage"]
  focus: DirectorWorkspaceFocus
  story: string
  setStory: (value: string) => void
  storyboard: DirectorStoryboard | null
  workflowID: string | null
  workflowRun: WorkflowRunResult | null
  selectedShotIndex: number
  videoModel: string
  setVideoModel: (value: string) => void
  videoCatalog: ReturnType<typeof useVideoModelCatalog>
  modelCatalogBlocked: boolean
  directorDisabled: boolean
  shotsDisabled: boolean
  imagesDisabled: boolean
  workflowDisabled: boolean
  directorActionState: ActionButtonState
  shotsActionState: ActionButtonState
  imagesActionState: ActionButtonState
  workflowActionState: ActionButtonState
  busyStage: BusyStage | null
  estimatedBudget: string
  onGenerateDirector: () => void
  onGenerateShots: () => void
  onGenerateImages: () => void
  onCreateWorkflow: () => void
  onSelectShot: (index: number) => void
  onUpdateShot: (index: number, patch: Partial<DirectorShot>) => void
  onUsePreset: (story: string, genre: string, style: string) => void
}) {
  const modelPicker = (
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
  )
  const contextLabel = focus === "brief" ? labels.pipelineBrief : focus === "storyboard" ? labels.pipelineStoryboard : labels.pipelineWorkflow
  const contextMetric = focus === "brief" ? estimatedBudget : focus === "storyboard" ? `${storyboard?.shots.length ?? 0} ${labels.estimatedShots}` : workflowID ?? labels.pipelineWorkflow
  const selectedShot = storyboard?.shots[selectedShotIndex] ?? storyboard?.shots[0]

  return (
    <div data-director-composer={focus} className="border-t border-border bg-card/94 p-3 lg:absolute lg:inset-x-4 lg:bottom-4 lg:rounded-xl lg:border lg:shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
          <Route className="size-3.5" />
          {contextLabel}
        </span>
        <span className="max-w-80 truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {contextMetric}
        </span>
      </div>

      {focus === "brief" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              {labels.story}
              <textarea
                className="min-h-24 rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/55 focus:border-signal/45 focus:outline-none"
                value={story}
                onChange={(event) => setStory(event.target.value)}
                placeholder={labels.storyPlaceholder}
              />
            </label>
            <details className="group rounded-lg border border-border bg-background/70 p-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">
                <span>{labels.quickPresets}</span>
                <ChevronDown className="size-3.5 transition group-open:rotate-180" />
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <PresetButton label={labels.presetShortDrama} onClick={() => onUsePreset(labels.presetShortDramaStory, "short drama", "cinematic realistic")} />
                <PresetButton label={labels.presetEcommerce} onClick={() => onUsePreset(labels.presetEcommerceStory, "ecommerce", "premium commercial")} />
                <PresetButton label={labels.presetTalkingCreator} onClick={() => onUsePreset(labels.presetTalkingCreatorStory, "talking creator", "clean studio")} />
              </div>
            </details>
          </div>

          <div className="space-y-3">
            {modelPicker}
            <div className="grid gap-2">
              <ActionButton
                disabled={directorDisabled}
                state={directorActionState}
                onClick={onGenerateDirector}
                labels={labels}
                variant="primary"
                className="h-10"
                icon={<Sparkles className="size-4" />}
              >
                {busyStage === "director" ? labels.working : `${labels.generateDirectorWorkflow} · ${estimatedBudget}`}
              </ActionButton>
              <ActionButton
                disabled={shotsDisabled}
                state={shotsActionState}
                onClick={onGenerateShots}
                labels={labels}
                compact
                className="h-10"
                icon={<Film className="size-3.5" />}
              >
                {labels.generateShots}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {focus === "storyboard" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          {storyboard && selectedShot ? (
            <ShotParameterDesk
              shot={selectedShot}
              index={selectedShotIndex}
              shotCount={storyboard.shots.length}
              labels={labels}
              onChange={(patch) => onUpdateShot(selectedShotIndex, patch)}
            />
          ) : (
            <div className="rounded-lg border border-border bg-background/70 p-3">
              <CanvasEmptyState labels={labels} />
            </div>
          )}

          <div className="space-y-3">
            {storyboard ? <ShotTimelineMap shots={storyboard.shots} labels={labels} activeIndex={selectedShotIndex} onSelectShot={onSelectShot} compact /> : null}
            {modelPicker}
            <div className="grid gap-2">
              <ActionButton
                disabled={imagesDisabled}
                state={imagesActionState}
                onClick={onGenerateImages}
                labels={labels}
                compact
                className="h-10"
                icon={<ImageIcon className="size-3.5" />}
              >
                {labels.generateImages}
              </ActionButton>
              <ActionButton
                disabled={workflowDisabled}
                state={workflowActionState}
                onClick={onCreateWorkflow}
                labels={labels}
                variant="signal"
                compact
                className="h-10"
                icon={<Workflow className="size-3.5" />}
              >
                {labels.createWorkflow}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {focus === "workflow" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <div className="mb-3 flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-signal/25 bg-signal/10 text-signal">
                <Workflow className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-foreground">{workflowID ? labels.workflowReadyTitle : labels.nextStepTitle}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{labels.nextStepBody}</p>
              </div>
            </div>
            {workflowID ? <WorkflowReadyCard workflowID={workflowID} run={workflowRun} labels={labels} /> : null}
          </div>

          <div className="space-y-3">
            {modelPicker}
            <div className="grid gap-2">
              <ActionButton
                disabled={directorDisabled}
                state={directorActionState}
                onClick={onGenerateDirector}
                labels={labels}
                variant="primary"
                className="h-10"
                icon={<Sparkles className="size-4" />}
              >
                {busyStage === "director" ? labels.working : `${labels.generateDirectorWorkflow} · ${estimatedBudget}`}
              </ActionButton>
              <ActionButton
                disabled={workflowDisabled}
                state={workflowActionState}
                onClick={onCreateWorkflow}
                labels={labels}
                compact
                className="h-10"
                icon={<Workflow className="size-3.5" />}
              >
                {labels.createWorkflow}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DirectorSettingsPanel({
  labels,
  genre,
  setGenre,
  style,
  setStyle,
  shotCount,
  setShotCount,
  duration,
  setDuration,
  durationMin,
  durationMax,
  maxParallel,
  setMaxParallel,
  maxParallelLimit,
  ratio,
  setRatio,
  ratioOptions,
  resolution,
  setResolution,
  resolutionOptions,
}: {
  labels: ReturnType<typeof useTranslations>["directorPage"]
  genre: string
  setGenre: (value: string) => void
  style: string
  setStyle: (value: string) => void
  shotCount: number
  setShotCount: (value: number) => void
  duration: number
  setDuration: (value: number) => void
  durationMin: number
  durationMax: number
  maxParallel: number
  setMaxParallel: (value: number) => void
  maxParallelLimit: number
  ratio: string
  setRatio: (value: string) => void
  ratioOptions: string[]
  resolution: string
  setResolution: (value: string) => void
  resolutionOptions: string[]
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card/82 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-signal/20 bg-signal/10 text-signal">
          <Clapperboard className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-medium text-foreground">{labels.briefTitle}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{labels.briefSubtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={labels.genre} value={genre} onChange={setGenre} />
        <Field label={labels.style} value={style} onChange={setStyle} />
        <ShotCountStepper label={labels.shots} decreaseLabel={labels.decreaseShots} increaseLabel={labels.increaseShots} value={shotCount} min={1} max={12} onChange={setShotCount} />
        <RangeField label={labels.secondsPerShot} value={duration} min={durationMin} max={durationMax} onChange={setDuration} />
        <RangeField label={labels.maxParallel} value={maxParallel} min={1} max={maxParallelLimit} unit="" onChange={setMaxParallel} />
        <OptionSelect label={labels.outputRatio} value={ratio} values={withCurrent(ratioOptions, ratio)} onChange={setRatio} />
        <OptionSelect label={labels.resolution} value={resolution} values={withCurrent(resolutionOptions, resolution)} onChange={setResolution} />
      </div>
    </section>
  )
}

function CanvasNode({
  eyebrow,
  title,
  icon,
  active,
  selected,
  onSelect,
  children,
  className,
}: {
  eyebrow: string
  title: string
  icon: ReactNode
  active?: boolean
  selected?: boolean
  onSelect?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <article
      data-director-node-selected={selected ? "true" : "false"}
      className={cn(
        "rounded-xl border bg-card/92 p-3.5 shadow-sm transition-colors",
        selected && "ring-2 ring-signal/15",
        selected ? "border-signal/60" : active ? "border-signal/45" : "border-border",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onSelect} className="min-w-0 rounded-md text-left outline-none transition focus-visible:ring-2 focus-visible:ring-signal/35" aria-pressed={selected}>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">{eyebrow}</p>
          <h2 className="mt-1 truncate text-sm font-medium tracking-tight text-foreground">{title}</h2>
        </button>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border", active ? "border-signal/30 bg-signal/10 text-signal" : "border-border bg-background text-muted-foreground")}>
          {icon}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </article>
  )
}

function CanvasEmptyState({ labels }: { labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-border bg-background/60 px-4 py-5 text-center">
      <Sparkles className="mx-auto size-5 text-signal" />
      <h3 className="mt-3 text-sm font-medium text-foreground">{labels.emptyTitle}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{labels.emptyBody}</p>
    </div>
  )
}

function SelectedShotPreview({ shot, index, labels, onChange }: { shot: DirectorShot; index: number; labels: ReturnType<typeof useTranslations>["directorPage"]; onChange: (patch: Partial<DirectorShot>) => void }) {
  const shotNumber = shot.shotIndex || index + 1
  return (
    <article className="rounded-lg border border-border bg-background/70 p-2.5" data-director-selected-shot={index}>
      <div className="flex items-start gap-2">
        {shot.referenceImageUrl ? (
          <img src={shot.referenceImageUrl} alt={shot.title} className="size-14 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-md border border-border bg-card text-signal">
            <ImageIcon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-signal/25 bg-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-signal">S{shotNumber}</span>
            <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{shot.duration}s</span>
          </div>
          <input
            className="mt-2 w-full bg-transparent text-[13px] font-medium text-foreground outline-none"
            value={shot.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
          <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">{shot.videoPrompt || labels.videoPrompt}</p>
        </div>
      </div>
    </article>
  )
}

function ShotParameterDesk({
  shot,
  index,
  shotCount,
  labels,
  onChange,
}: {
  shot: DirectorShot
  index: number
  shotCount: number
  labels: ReturnType<typeof useTranslations>["directorPage"]
  onChange: (patch: Partial<DirectorShot>) => void
}) {
  const shotNumber = shot.shotIndex || index + 1

  return (
    <section className="rounded-lg border border-border bg-background/70 p-3" data-director-shot-parameters={index}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md border border-signal/25 bg-signal/10 px-2 py-1 font-mono text-[10px] text-signal">
              S{shotNumber}/{shotCount}
            </span>
            <span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {shot.duration}s
            </span>
          </div>
          <input
            className="w-full min-w-0 bg-transparent text-sm font-medium text-foreground outline-none"
            value={shot.title}
            aria-label={`${labels.shotTimeline} S${shotNumber}`}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>
        {shot.referenceImageUrl ? (
          <img src={shot.referenceImageUrl} alt={shot.title} className="h-16 w-24 rounded-md object-cover" />
        ) : (
          <span className="grid h-16 w-24 shrink-0 place-items-center rounded-md border border-dashed border-border bg-card text-muted-foreground">
            <ImageIcon className="size-5" />
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {labels.camera}
          <input className="h-9 rounded-md border border-border bg-card px-2 text-[12px] text-foreground outline-none focus:border-signal/45" value={shot.camera ?? ""} onChange={(event) => onChange({ camera: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {labels.emotion}
          <input className="h-9 rounded-md border border-border bg-card px-2 text-[12px] text-foreground outline-none focus:border-signal/45" value={shot.emotion ?? ""} onChange={(event) => onChange({ emotion: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {labels.action}
          <input className="h-9 rounded-md border border-border bg-card px-2 text-[12px] text-foreground outline-none focus:border-signal/45" value={shot.action ?? ""} onChange={(event) => onChange({ action: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {labels.secondsPerShot}
          <input
            type="number"
            min={1}
            max={60}
            className="h-9 rounded-md border border-border bg-card px-2 text-[12px] text-foreground outline-none focus:border-signal/45"
            value={shot.duration}
            onChange={(event) => onChange({ duration: clampNumber(Number(event.target.value || 1), 1, 60) })}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {labels.videoPrompt}
          <textarea
            className="min-h-24 resize-none rounded-md border border-border bg-card px-3 py-2 text-[12px] leading-relaxed text-foreground outline-none focus:border-signal/45"
            value={shot.videoPrompt}
            onChange={(event) => onChange({ videoPrompt: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {labels.imagePrompt}
          <textarea
            className="min-h-24 resize-none rounded-md border border-border bg-card px-3 py-2 text-[12px] leading-relaxed text-foreground outline-none focus:border-signal/45"
            value={shot.imagePrompt ?? ""}
            onChange={(event) => onChange({ imagePrompt: event.target.value })}
          />
        </label>
      </div>
    </section>
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
  const completedCount = steps.filter((step) => step.state === "done").length
  const focusStep =
    steps.find((step) => step.state === "blocked") ??
    steps.find((step) => step.state === "active") ??
    steps.find((step) => step.state === "waiting") ??
    steps[steps.length - 1]

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
      <div className="mt-3 rounded-lg border border-border bg-card/55 px-3 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {completedCount}/{steps.length}
          </span>
          <span className="text-[11px] text-muted-foreground">{focusStep?.label}</span>
        </div>
        <ol className="grid grid-cols-9 gap-1">
          {steps.map((step, index) => (
            <ProofPathNode key={step.key} label={step.label} state={step.state} isLast={index === steps.length - 1} />
          ))}
        </ol>
      </div>
      {focusStep ? <ProofFocus step={focusStep} /> : null}
    </section>
  )
}

function ProofPathNode({ label, state, isLast }: { label: string; state: ProofStepState; isLast: boolean }) {
  const meta = proofPathMeta(state)
  return (
    <li className="relative min-w-0">
      {!isLast ? <span className={cn("absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-3.5 h-px", meta.lineClassName)} /> : null}
      <div className="relative z-10 flex min-w-0 flex-col items-center gap-1.5">
        <span className={cn("grid size-7 place-items-center rounded-md border bg-card", meta.nodeClassName)}>
          {meta.icon}
        </span>
        <span className="max-w-full truncate text-center text-[10px] text-muted-foreground">{label}</span>
      </div>
    </li>
  )
}

function ProofFocus({ step }: { step: { label: string; state: ProofStepState; evidence: string } }) {
  const meta = proofPathMeta(step.state)
  return (
    <div className={cn("mt-3 flex items-start gap-2 rounded-lg border-l-2 bg-card/45 px-3 py-2", meta.focusClassName)}>
      <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border", meta.nodeClassName)}>
        {meta.icon}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-foreground">{step.label}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{step.evidence}</p>
      </div>
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

function ShotTimelineMap({
  shots,
  labels,
  activeIndex = 0,
  onSelectShot,
  compact = false,
}: {
  shots: DirectorShot[]
  labels: ReturnType<typeof useTranslations>["directorPage"]
  activeIndex?: number
  onSelectShot?: (index: number) => void
  compact?: boolean
}) {
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
    <section className={cn("rounded-lg border border-border bg-background/70", compact ? "p-2.5" : "p-3")} aria-label={labels.shotTimeline}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">{labels.shotTimeline}</p>
          <p className={cn("mt-1 text-muted-foreground", compact ? "text-[11px]" : "text-[12px]")}>
            {formatTimelineTime(cursor)} · {shots.length} {labels.shotUnit} · {labels.memoryReferenceCount.replace("{count}", String(hasReferences))} / {shots.length}
          </p>
        </div>
        <span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {labels.totalRuntime}: {formatTimelineTime(cursor)}
        </span>
      </div>
      <ol className={cn("flex gap-1.5 overflow-x-auto pb-1", compact ? "mt-2" : "mt-3")}>
        {segments.map((segment) => (
          <li key={`${segment.shot.shotIndex}-${segment.index}`} className={cn("flex-1", compact ? "min-w-24" : "min-w-32")}>
            <button
              type="button"
              onClick={() => onSelectShot?.(segment.index)}
              aria-pressed={segment.index === activeIndex}
              className={cn(
                "h-full w-full rounded-md border bg-card px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/35",
                segment.index === activeIndex ? "border-signal/55 bg-signal/10" : "border-border hover:border-signal/30 hover:bg-accent/45",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md border border-signal/25 bg-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-signal">
                  S{segment.shot.shotIndex || segment.index + 1}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatTimelineTime(segment.start)}-{formatTimelineTime(segment.end)}
                </span>
              </div>
              <p className={cn("mt-2 truncate font-medium text-foreground", compact ? "text-[11.5px]" : "text-[12px]")}>{segment.shot.title || labels.planOnly}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                <span className="truncate">{segment.shot.camera || labels.camera}</span>
                <span>{segment.duration}s</span>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </section>
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

function proofPathMeta(state: ProofStepState) {
  if (state === "done") {
    return {
      icon: <CheckCircle2 className="size-3.5" />,
      nodeClassName: "border-status-success/30 bg-status-success/10 text-status-success",
      lineClassName: "bg-status-success/35",
      focusClassName: "border-l-status-success",
    }
  }
  if (state === "active") {
    return {
      icon: <Loader2 className="size-3.5 animate-spin" />,
      nodeClassName: "border-signal/25 bg-signal/10 text-signal",
      lineClassName: "bg-signal/30",
      focusClassName: "border-l-signal",
    }
  }
  if (state === "blocked") {
    return {
      icon: <AlertTriangle className="size-3.5" />,
      nodeClassName: "border-destructive/35 bg-destructive/10 text-destructive",
      lineClassName: "bg-border",
      focusClassName: "border-l-destructive",
    }
  }
  return {
    icon: <Route className="size-3.5" />,
    nodeClassName: "border-border bg-background text-muted-foreground",
    lineClassName: "bg-border",
    focusClassName: "border-l-border",
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
