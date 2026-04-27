"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ModelSelect } from "@/components/ai/model-select"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { useTranslations } from "@/lib/i18n/context"
import { createDirectorWorkflow, generateDirectorShotImages, generateDirectorShots, getDirectorStatus, runBackendDirectorPipeline, type DirectorShot, type DirectorStatus, type DirectorStoryboard } from "@/lib/workflows"

export default function DirectorPage() {
  const t = useTranslations()
  const labels = t.directorPage
  const [story, setStory] = useState("")
  const [genre, setGenre] = useState("short drama")
  const [style, setStyle] = useState("cinematic realistic")
  const [shotCount, setShotCount] = useState(3)
  const [duration, setDuration] = useState(5)
  const [videoModel, setVideoModel] = useState("seedance-2.0-pro")
  const [storyboard, setStoryboard] = useState<DirectorStoryboard | null>(null)
  const [status, setStatus] = useState<DirectorStatus | null>(null)
  const [workflowID, setWorkflowID] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDirectorStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  async function generate() {
    setLoading(true)
    setError(null)
    setWorkflowID(null)
    try {
      const next = await generateDirectorShots({
        engine: "advanced",
        story,
        genre,
        style,
        shot_count: shotCount,
        duration_per_shot: duration,
      })
      setStoryboard(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.generateFailed)
    } finally {
      setLoading(false)
    }
  }

  async function createWorkflow() {
    if (!storyboard) return
    setLoading(true)
    setError(null)
    try {
      const res = await createDirectorWorkflow({
        storyboard,
        options: {
          name: storyboard.title,
          ratio: "9:16",
          resolution: "1080p",
          generate_audio: false,
          model: videoModel,
        },
      })
      setWorkflowID(res.workflow.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.workflowFailed)
    } finally {
      setLoading(false)
    }
  }

  async function generateImages() {
    if (!storyboard) return
    setLoading(true)
    setError(null)
    try {
      const res = await generateDirectorShotImages({ shots: storyboard.shots, style, resolution: "1024x1024" })
      setStoryboard({ ...storyboard, shots: res.shots })
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.imageFailed)
    } finally {
      setLoading(false)
    }
  }

  async function generateDirectorWorkflow() {
    setLoading(true)
    setError(null)
    setWorkflowID(null)
    try {
      const res = await runBackendDirectorPipeline({
        engine: "advanced",
        story,
        genre,
        style,
        shot_count: shotCount,
        duration_per_shot: duration,
        generate_images: status?.image_provider_configured ?? false,
        options: {
          name: labels.directorWorkflowName,
          ratio: "9:16",
          resolution: "1080p",
          generate_audio: false,
          model: videoModel,
          enable_merge: true,
        },
      })
      setWorkflowID(res.record?.id ?? null)
      setStoryboard({
        title: res.plan.title,
        summary: res.plan.summary,
        shots: res.plan.shots.map((shot) => ({
          shotIndex: shot.shotIndex,
          title: shot.title,
          duration: shot.duration,
          scene: "",
          camera: shot.camera,
          emotion: shot.emotion,
          action: shot.action,
          videoPrompt: shot.videoPrompt,
          imagePrompt: shot.imagePrompt ?? "",
          negativePrompt: "",
          referenceAssets: shot.referenceAssetIds ?? [],
          referenceImageUrl: shot.referenceImageUrl,
          referenceImageAssetId: shot.referenceImageAssetId,
        })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.workflowFailed)
    } finally {
      setLoading(false)
    }
  }

  function updateShot(index: number, patch: Partial<DirectorShot>) {
    setStoryboard((current) => current ? {
      ...current,
      shots: current.shots.map((shot, i) => i === index ? { ...shot, ...patch } : shot),
    } : current)
  }

  const blocked = status != null && !status.available
  const imageBlocked = status != null && !status.image_provider_configured

  return (
    <DashboardShell activeHref="/director" title={labels.title} description={labels.description}>
      <div className="grid gap-6 p-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <section className="space-y-4 rounded-xl border border-border/80 bg-card/40 p-5">
          <div>
            <h2 className="text-sm font-medium">{labels.stepStory}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{labels.storyHint}</p>
          </div>
          <StatusBanner status={status} labels={labels} />
          {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">{labels.story}<textarea className="min-h-48 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" value={story} onChange={(e) => setStory(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.genre} value={genre} onChange={setGenre} />
            <Field label={labels.style} value={style} onChange={setStyle} />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{labels.shots}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" type="number" min={1} max={12} value={shotCount} onChange={(e) => setShotCount(Number(e.target.value))} /></label>
            <RangeField label={labels.secondsPerShot} value={duration} min={4} max={15} onChange={setDuration} />
          </div>
          <ModelSelect label={labels.modelCatalog} value={videoModel} onChange={setVideoModel} category="video" helper={labels.modelCatalogHint} />
          <div className="flex flex-wrap gap-2">
            <button disabled={loading || blocked || story.trim() === ""} onClick={() => void generate()} className="h-10 rounded-md border border-border px-4 text-sm disabled:opacity-50">{loading ? labels.working : labels.generateShots}</button>
            <button disabled={loading || blocked || story.trim() === ""} onClick={() => void generateDirectorWorkflow()} className="h-10 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-50">{loading ? labels.working : labels.generateDirectorWorkflow}</button>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/80 bg-card/40 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">{labels.editShots}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{storyboard?.summary ?? labels.generatedPlaceholder}</p>
            </div>
            {storyboard && <div className="flex gap-2"><button disabled={loading || imageBlocked} onClick={() => void generateImages()} className="h-9 rounded-md border border-border px-3 text-sm disabled:opacity-50">{labels.generateImages}</button><button disabled={loading || blocked} onClick={() => void createWorkflow()} className="h-9 rounded-md border border-border px-3 text-sm disabled:opacity-50">{labels.createWorkflow}</button></div>}
          </div>
          {workflowID && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{labels.workflowCreated} <Link className="underline" href={`/canvas?workflow=${workflowID}`}>{labels.openCanvas}</Link></div>}
          <div className="space-y-3">
            {storyboard?.shots.map((shot, index) => (
              <div key={`${shot.shotIndex}-${index}`} className="rounded-lg border border-border/70 p-4">
                <div className="mb-3 flex items-center justify-between"><input className="bg-transparent text-sm font-medium outline-none" value={shot.title} onChange={(e) => updateShot(index, { title: e.target.value })} /><span className="text-xs text-muted-foreground">{shot.duration}s</span></div>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">{labels.videoPrompt}<textarea className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" value={shot.videoPrompt} onChange={(e) => updateShot(index, { videoPrompt: e.target.value })} /></label>
                <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">{labels.imagePrompt}<textarea className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" value={shot.imagePrompt} onChange={(e) => updateShot(index, { imagePrompt: e.target.value })} /></label>
                {shot.referenceImageUrl && <img src={shot.referenceImageUrl} alt={shot.title} className="mt-3 aspect-video w-full rounded-md border border-border object-cover" />}
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}

function StatusBanner({ status, labels }: { status: DirectorStatus | null; labels: ReturnType<typeof useTranslations>["directorPage"] }) {
  if (!status) {
    return <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">{labels.statusLoading}</div>
  }
  if (status.available) {
    return <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{labels.usageNotice}</div>
  }
  const text = status.blocking_reason === "vip_required" ? labels.vipRequired : labels.providerMissing
  return <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{text}</div>
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" value={value} onChange={(e) => onChange(e.target.value)} /></label>
}

function RangeField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const safeValue = Math.min(max, Math.max(min, value))
  return (
    <label className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
      <span className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-sm text-foreground">{safeValue}s</span>
      </span>
      <input type="range" min={min} max={max} value={safeValue} onChange={(e) => onChange(Number(e.target.value))} className="accent-signal" />
      <span className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{min}s</span>
        <span>{max}s</span>
      </span>
    </label>
  )
}
