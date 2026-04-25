"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  Download,
  ExternalLink,
  Film,
  ImageIcon,
  Loader2,
  Music,
  Paperclip,
  RefreshCcw,
  Send,
  Sparkles,
  Type,
  X,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"
import { apiFetch, apiUpload, ApiError } from "@/lib/api"
import { jobApiErrorMessage } from "@/lib/api-error-i18n"
import { toast } from "sonner"

type Mode = "text" | "image"
type CurrentVideo = {
  id: string
  model: string
  status: string
  output?: { url?: string; video_url?: string }
  error_code?: string
  error_message?: string
  upstream_tokens?: number
  actual_cost_cents?: number
  estimated_cost_cents?: number
  created_at?: string
  finished_at?: string
}
type TempMedia = {
  key: string
  url: string
  kind: "image" | "video" | "audio"
  name: string
  size?: number
  expires_at?: string
}

const FALLBACK_MODELS = ["seedance-v2-pro", "seedance-v2"]
const ACTIVE_STATUSES = new Set(["queued", "submitting", "running", "retrying"])
const RATIOS = ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
const RESOLUTIONS = ["480p", "720p", "1080p"]

function parseMediaURLs(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter((v) => v.startsWith("https://"))
}

// Mirrors backend/internal/provider/seedance/pricing.go
function resolutionScale(r: string): number {
  if (r === "720p") return 0.55
  if (r === "480p") return 0.3
  return 1.0
}

function pricePer1K(hasImage: boolean): number {
  return hasImage ? 0.0043 : 0.007
}

// Returns display credits (1.00 = one standard 6s 1080p text generation)
function estimateCostCredits(duration: number, resolution: string, hasImage: boolean): number {
  const base = (55000 * 6 * 1.0) / 1000 * 0.007
  const current = (55000 * duration * resolutionScale(resolution)) / 1000 * pricePer1K(hasImage)
  return Math.ceil((current / base) * 100) / 100
}

function toJobStatus(status: string): JobStatus {
  if (status === "retrying") return "running"
  if (["queued", "submitting", "running", "succeeded", "failed"].includes(status)) {
    return status as JobStatus
  }
  return "queued"
}

export default function NewJobPage() {
  const t = useTranslations()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [currentVideo, setCurrentVideo] = useState<CurrentVideo | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [mode, setMode] = useState<Mode>("text")
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS)
  const [model, setModel] = useState(FALLBACK_MODELS[0])
  const [duration, setDuration] = useState("5")
  const [resolution, setResolution] = useState("720p")
  const [aspectRatio, setAspectRatio] = useState("adaptive")
  const [generateAudio, setGenerateAudio] = useState(true)
  const [draft, setDraft] = useState(false)
  const [seed, setSeed] = useState("")
  const [webhookURL, setWebhookURL] = useState("")
  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [lastFrameUrl, setLastFrameUrl] = useState("")
  const [referenceImageURLs, setReferenceImageURLs] = useState("")
  const [referenceVideoURLs, setReferenceVideoURLs] = useState("")
  const [referenceAudioURLs, setReferenceAudioURLs] = useState("")
  const [imageUploading, setImageUploading] = useState(false)
  const [mediaUploading, setMediaUploading] = useState<TempMedia["kind"] | null>(null)
  const [tempMedia, setTempMedia] = useState<TempMedia[]>([])
  const [eventLog, setEventLog] = useState<string[]>([])
  const [estimatedCost, setEstimatedCost] = useState(1.0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load models from backend
  useEffect(() => {
    apiFetch("/v1/models")
      .then((res) => {
        const items: { id: string }[] = res?.data ?? res ?? []
        const ids = items.map((m) => m.id).filter(Boolean)
        if (ids.length > 0) {
          setModels(ids)
          setModel(ids[0])
        }
      })
      .catch(() => {
        // silently fall back to hardcoded models
      })
  }, [])

  // Debounced cost estimate
  const updateCost = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const hasVisualReference = Boolean(
        imageUrl.trim() ||
          lastFrameUrl.trim() ||
          parseMediaURLs(referenceImageURLs).length > 0 ||
          parseMediaURLs(referenceVideoURLs).length > 0,
      )
      setEstimatedCost(
        estimateCostCredits(Number(duration), resolution, hasVisualReference),
      )
    }, 300)
  }, [duration, resolution, imageUrl, lastFrameUrl, referenceImageURLs, referenceVideoURLs])

  useEffect(() => {
    updateCost()
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [updateCost])

  // On mount, clear toasts and inline error so a failed action on another page does not carry over.
  useEffect(() => {
    setSubmitError(null)
    toast.dismiss()
    const last = window.localStorage.getItem("nextapi.last_video_prompt")
    if (last) setPrompt(last)
  }, [])

  const refreshCurrentVideo = useCallback(async (id: string) => {
    const video = await apiFetch(`/v1/videos/${id}`) as CurrentVideo
    setCurrentVideo(video)
    setEventLog((logs) => [
      new Date().toISOString() + " STATUS " + video.status,
      JSON.stringify({
        task_id: video.id,
        status: video.status,
        tokens: video.upstream_tokens,
        error: video.error_message,
      }, null, 2),
      ...logs.slice(0, 30),
    ])
    return video
  }, [])

  useEffect(() => {
    if (!currentVideo?.id || !ACTIVE_STATUSES.has(currentVideo.status)) return
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = setTimeout(() => {
      void refreshCurrentVideo(currentVideo.id).catch(() => undefined)
    }, 4000)
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [currentVideo?.id, currentVideo?.status, refreshCurrentVideo])

  const onImagePicked = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t.jobs.new.form.imageUploadFailed)
      return
    }
    setImageUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = (await apiUpload("/v1/me/uploads/media", body)) as TempMedia
      if (typeof res?.url === "string" && res.url) {
        setImageUrl(res.url)
        if (res.key) {
          setTempMedia((items) => [
            ...items,
            {
              key: res.key,
              url: res.url,
              kind: "image",
              name: file.name,
              size: res.size,
              expires_at: res.expires_at,
            },
          ])
        }
        return
      }
      toast.error(t.jobs.new.form.imageUploadFailed)
    } catch (e) {
      if (e instanceof ApiError && e.code === "uploads_unavailable") {
        toast.error(t.jobs.new.form.uploadsUnavailable)
      } else if (e instanceof ApiError) {
        toast.error(e.message)
      } else {
        toast.error(t.jobs.new.form.imageUploadFailed)
      }
    } finally {
      setImageUploading(false)
    }
  }

  const uploadTempMedia = async (file: File, expectedKind: TempMedia["kind"]) => {
    const matchesKind = file.type.startsWith(`${expectedKind}/`)
    if (!matchesKind) {
      toast.error(t.jobs.new.form.wrongFileType)
      return
    }
    setMediaUploading(expectedKind)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = (await apiUpload("/v1/me/uploads/media", body)) as TempMedia
      if (res?.url && res?.key) {
        const item = {
          key: res.key,
          url: res.url,
          kind: res.kind || expectedKind,
          name: file.name,
          size: res.size,
          expires_at: res.expires_at,
        } as TempMedia
        setTempMedia((items) => [...items, item])
        if (item.kind === "image") {
          setReferenceImageURLs((value) => [value, item.url].filter(Boolean).join("\n"))
        } else if (item.kind === "video") {
          setReferenceVideoURLs((value) => [value, item.url].filter(Boolean).join("\n"))
        } else if (item.kind === "audio") {
          setReferenceAudioURLs((value) => [value, item.url].filter(Boolean).join("\n"))
        }
        toast.success(t.jobs.new.form.tempUploadSuccess)
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "uploads_unavailable") {
        toast.error(t.jobs.new.form.tempUploadsUnavailable)
      } else if (e instanceof ApiError) {
        toast.error(e.message)
      } else {
        toast.error(t.jobs.new.form.tempUploadFailed)
      }
    } finally {
      setMediaUploading(null)
    }
  }

  const submitJob = async () => {
    setSubmitting(true)
    setSubmitError(null)
    const idempotencyKey = crypto.randomUUID()
    const input: Record<string, unknown> = {
      prompt,
      duration_seconds: Number(duration),
      resolution,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
      draft,
    }
    const seedNumber = seed.trim() ? Number(seed) : null
    if (seedNumber != null && Number.isFinite(seedNumber)) {
      input.seed = seedNumber
    }
    const imageURLs = parseMediaURLs(referenceImageURLs).slice(0, 9)
    const videoURLs = parseMediaURLs(referenceVideoURLs).slice(0, 3)
    const audioURLs = parseMediaURLs(referenceAudioURLs).slice(0, 3)
    if (mode === "image" && imageUrl.trim()) {
      input.first_frame_url = imageUrl.trim()
    }
    if (mode === "image" && lastFrameUrl.trim()) {
      input.last_frame_url = lastFrameUrl.trim()
    }
    if (imageURLs.length > 0) {
      input.image_urls = imageURLs
    }
    if (videoURLs.length > 0) {
      input.video_urls = videoURLs
    }
    if (audioURLs.length > 0) {
      input.audio_urls = audioURLs
    }
    if (tempMedia.length > 0) {
      input.temp_media_keys = tempMedia.map((item) => item.key)
    }
    const body: Record<string, unknown> = { model, input }
    if (webhookURL.trim()) {
      body.webhook_url = webhookURL.trim()
    }
    try {
      window.localStorage.setItem("nextapi.last_video_prompt", prompt)
      setEventLog((logs) => [
        new Date().toISOString() + " SUBMIT request queued",
        JSON.stringify({
          model,
          duration: Number(duration),
          resolution,
          ratio: aspectRatio,
          generate_audio: generateAudio,
          draft,
          seed: seedNumber,
          num_images: imageURLs.length + (imageUrl.trim() ? 1 : 0),
          num_videos: videoURLs.length,
          num_audios: audioURLs.length,
          temp_media: tempMedia.length,
        }, null, 2),
        ...logs,
      ])
      const res = await apiFetch("/v1/videos", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": idempotencyKey },
      })
      toast.success(t.jobs.new.task.created)
      const jobId: string = res?.id ?? res?.job_id ?? ""
      if (jobId) {
        setCurrentVideo({
          id: jobId,
          model,
          status: res?.status ?? "queued",
          estimated_cost_cents: res?.estimated_cost_cents,
          created_at: res?.created_at,
        })
        setEventLog((logs) => [
          new Date().toISOString() + " TASK created " + jobId,
          JSON.stringify({ task_id: jobId, status: res?.status ?? "queued" }, null, 2),
          ...logs,
        ])
        void refreshCurrentVideo(jobId).catch(() => undefined)
      } else {
        setCurrentVideo(null)
      }
    } catch (err) {
      const msg = jobApiErrorMessage(t, err)
      setSubmitError(msg)
      setEventLog((logs) => [
        new Date().toISOString() + " SUBMIT error",
        JSON.stringify({ error: msg }, null, 2),
        ...logs,
      ])
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const retryCurrentVideo = async () => {
    if (!currentVideo?.id) return
    setRetrying(true)
    try {
      const res = await apiFetch(`/v1/videos/${currentVideo.id}/retry`, { method: "POST" }) as CurrentVideo
      if (res?.id) {
        toast.success(t.jobs.new.task.retryQueued)
        setCurrentVideo(res)
        void refreshCurrentVideo(res.id).catch(() => undefined)
      }
    } catch (err) {
      const msg = jobApiErrorMessage(t, err)
      toast.error(msg)
    } finally {
      setRetrying(false)
    }
  }

  const imageURLs = parseMediaURLs(referenceImageURLs).slice(0, 9)
  const videoURLs = parseMediaURLs(referenceVideoURLs).slice(0, 3)
  const audioURLs = parseMediaURLs(referenceAudioURLs).slice(0, 3)
  const hasAnyMedia =
    Boolean(imageUrl.trim() || lastFrameUrl.trim()) ||
    imageURLs.length > 0 ||
    videoURLs.length > 0 ||
    audioURLs.length > 0
  const hasVisualMedia =
    Boolean(imageUrl.trim() || lastFrameUrl.trim()) ||
    imageURLs.length > 0 ||
    videoURLs.length > 0
  const canSubmit = !submitting && Boolean(prompt.trim()) && (mode === "text" || hasVisualMedia)
  const attachmentCount =
    (imageUrl.trim() ? 1 : 0) +
    (lastFrameUrl.trim() ? 1 : 0) +
    imageURLs.length +
    videoURLs.length +
    audioURLs.length

  const removeTempMedia = (item: TempMedia) => {
    setTempMedia((items) => items.filter((x) => x.key !== item.key))
    if (imageUrl === item.url) setImageUrl("")
    if (item.kind === "image") {
      setReferenceImageURLs((value) => parseMediaURLs(value).filter((url) => url !== item.url).join("\n"))
    } else if (item.kind === "video") {
      setReferenceVideoURLs((value) => parseMediaURLs(value).filter((url) => url !== item.url).join("\n"))
    } else if (item.kind === "audio") {
      setReferenceAudioURLs((value) => parseMediaURLs(value).filter((url) => url !== item.url).join("\n"))
    }
  }

  return (
    <DashboardShell activeHref="/jobs">
      <div className="border-b border-border/60 px-6 py-4">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          {t.jobs.detail.backToJobs}
        </Link>
      </div>
      <div className="mx-auto grid w-full max-w-[1360px] min-w-0 grid-cols-1 gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex min-w-0 flex-col gap-5">
          <div className="rounded-[28px] border border-border/80 bg-gradient-to-br from-card/80 via-card/40 to-background p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t.jobs.new.kicker}
                </div>
                <h1 className="mt-2 text-[28px] font-medium tracking-tight">{t.jobs.new.title}</h1>
                <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-muted-foreground">
                  {t.jobs.new.intro}
                </p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-background/70 px-4 py-3">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  {t.jobs.new.estimatedCost}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono text-[24px] text-foreground">{estimatedCost.toFixed(2)}</span>
                  <span className="text-[12px] text-muted-foreground">{t.common.credits}</span>
                </div>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="break-words rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
              {submitError}
            </div>
          )}

          <div className="overflow-hidden rounded-[28px] border border-border/80 bg-card/40 shadow-sm">
            <div className="border-b border-border/60 bg-background/40 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-signal" />
                  <span className="text-[13px] font-medium">{t.jobs.new.composer.title}</span>
                  <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                    {attachmentCount}/12
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ModeButton
                    active={mode === "text"}
                    onClick={() => setMode("text")}
                    icon={Type}
                    label={t.jobs.new.form.modeTextToVideo}
                    sub="t2v"
                  />
                  <ModeButton
                    active={mode === "image"}
                    onClick={() => setMode("image")}
                    icon={ImageIcon}
                    label={t.jobs.new.form.modeImageToVideo}
                    sub="i2v"
                  />
                </div>
              </div>
            </div>

            <div
              className="space-y-4 p-5"
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const f = e.dataTransfer.files?.[0]
                if (!f) return
                if (f.type.startsWith("image/") && mode === "image" && !imageUrl.trim()) {
                  void onImagePicked(f)
                } else if (f.type.startsWith("image/")) {
                  void uploadTempMedia(f, "image")
                } else if (f.type.startsWith("video/")) {
                  void uploadTempMedia(f, "video")
                } else if (f.type.startsWith("audio/")) {
                  void uploadTempMedia(f, "audio")
                } else {
                  toast.error(t.jobs.new.form.wrongFileType)
                }
              }}
            >
              <div className="rounded-2xl border border-dashed border-border/80 bg-background/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[12.5px] font-medium">{t.jobs.new.composer.attachments}</div>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">{t.jobs.new.composer.attachmentsHint}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AttachmentUploadButton
                      icon={ImageIcon}
                      label={t.jobs.new.form.referenceImages}
                      accept="image/*"
                      uploading={imageUploading || mediaUploading === "image"}
                      onUpload={(file) => mode === "image" && !imageUrl.trim() ? onImagePicked(file) : uploadTempMedia(file, "image")}
                    />
                    <AttachmentUploadButton
                      icon={Film}
                      label={t.jobs.new.form.referenceVideos}
                      accept="video/mp4,video/quicktime,video/*"
                      uploading={mediaUploading === "video"}
                      onUpload={(file) => uploadTempMedia(file, "video")}
                    />
                    <AttachmentUploadButton
                      icon={Music}
                      label={t.jobs.new.form.referenceAudio}
                      accept="audio/mpeg,audio/wav,audio/aac,audio/*"
                      uploading={mediaUploading === "audio"}
                      onUpload={(file) => uploadTempMedia(file, "audio")}
                    />
                  </div>
                </div>

                {!hasAnyMedia && tempMedia.length === 0 ? (
                  <div className="flex min-h-[82px] items-center justify-center rounded-xl bg-card/40 text-center text-[12px] text-muted-foreground">
                    <span className="max-w-[420px]">{t.jobs.new.composer.emptyAttachments}</span>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {imageUrl.trim() && (
                      <AttachmentPreview
                        kind={t.jobs.new.form.firstLastFrame}
                        label={imageUrl.trim()}
                        url={imageUrl.trim()}
                        onRemove={() => setImageUrl("")}
                      />
                    )}
                    {lastFrameUrl.trim() && (
                      <AttachmentPreview
                        kind={t.jobs.new.form.lastFrameUrl}
                        label={lastFrameUrl.trim()}
                        onRemove={() => setLastFrameUrl("")}
                      />
                    )}
                    {tempMedia.map((item) => (
                      <AttachmentPreview
                        key={item.key}
                        kind={item.kind}
                        label={item.name}
                        url={item.kind === "image" ? item.url : undefined}
                        onRemove={() => removeTempMedia(item)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/80 bg-background">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-[12.5px] font-medium">
                    <Paperclip className="size-3.5 text-muted-foreground" />
                    {t.jobs.new.composer.promptBox}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const last = window.localStorage.getItem("nextapi.last_video_prompt")
                        if (last) setPrompt(last)
                      }}
                      className="h-7 rounded-md border border-border/80 px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
                    >
                      {t.jobs.new.form.useLastPrompt}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(prompt)
                        toast.success(t.jobs.new.form.promptCopied)
                      }}
                      className="h-7 rounded-md border border-border/80 px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
                    >
                      {t.jobs.new.form.copyPrompt}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={8}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t.jobs.new.form.promptPlaceholder}
                  className="min-h-[180px] w-full resize-none bg-transparent px-4 py-4 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
                <div className="border-t border-border/60 px-4 py-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="min-w-0">
                        <span className="mb-1 block text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t.jobs.new.form.model}</span>
                        <select
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="h-9 w-full rounded-md border border-border/80 bg-card/60 px-3 font-mono text-[12px] text-foreground focus:border-signal/50 focus:outline-none"
                        >
                          {models.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      <label className="min-w-0">
                        <span className="mb-1 block text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t.jobs.new.form.webhook}</span>
                        <input
                          value={webhookURL}
                          onChange={(e) => setWebhookURL(e.target.value)}
                          placeholder="https://example.com/webhooks/video"
                          className="h-9 w-full rounded-md border border-border/80 bg-card/60 px-3 font-mono text-[12px] text-foreground focus:border-signal/50 focus:outline-none"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end">
                      <PillSelect label={t.jobs.new.form.resolution} value={resolution} onChange={setResolution} values={RESOLUTIONS} />
                      <PillSelect label={t.jobs.new.form.aspectRatio} value={aspectRatio} onChange={setAspectRatio} values={RATIOS} />
                      <label className="rounded-xl border border-border/80 bg-card/60 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t.jobs.new.form.duration}</span>
                        <span className="mt-1 flex items-center gap-2">
                          <input
                            type="range"
                            min={4}
                            max={15}
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            className="w-24"
                          />
                          <span className="w-8 font-mono text-[12px] text-foreground">{duration}s</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <TogglePill label={t.jobs.new.form.generateAudio} checked={generateAudio} onChange={setGenerateAudio} />
                    <TogglePill label={t.jobs.new.form.draft} checked={draft} onChange={setDraft} />
                    <button
                      type="button"
                      onClick={() => setShowAdvanced((value) => !value)}
                      className="inline-flex h-9 items-center rounded-full border border-border/80 bg-card/60 px-3 text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      {showAdvanced ? t.jobs.new.composer.hideAdvanced : t.jobs.new.composer.showAdvanced}
                    </button>
                    <div className="flex h-9 items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3">
                      <span className="text-[11px] text-muted-foreground">{t.jobs.new.form.seed}</span>
                      <input
                        value={seed}
                        onChange={(e) => setSeed(e.target.value.replace(/[^\d-]/g, ""))}
                        placeholder={t.jobs.new.form.seedPlaceholder}
                        className="w-24 bg-transparent font-mono text-[11.5px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setSeed(String(Math.floor(Math.random() * 2 ** 31)))}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {t.jobs.new.form.randomSeed}
                      </button>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      <span className="font-mono text-[11.5px] text-muted-foreground">
                        {t.jobs.new.willReserve} <span className="text-foreground">{estimatedCost.toFixed(2)} {t.common.credits}</span>
                      </span>
                      <button
                        onClick={submitJob}
                        disabled={!canSubmit}
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[13px] font-medium text-background transition-all",
                          !canSubmit && "opacity-60",
                        )}
                      >
                        {submitting ? (
                          <>
                            <span className="size-3 animate-spin rounded-full border-2 border-background border-t-transparent" />
                            {t.jobs.states.submitting}
                          </>
                        ) : (
                          <>
                            <Send className="size-3.5" />
                            {t.jobs.new.form.submit}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {showAdvanced && (
                    <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-3">
                      <CompactURLBox
                        label={t.jobs.new.form.referenceImages}
                        value={referenceImageURLs}
                        onChange={setReferenceImageURLs}
                        placeholder={"https://.../style.png"}
                        count={`${imageURLs.length}/9`}
                      />
                      <CompactURLBox
                        label={t.jobs.new.form.referenceVideos}
                        value={referenceVideoURLs}
                        onChange={setReferenceVideoURLs}
                        placeholder={"https://.../motion.mp4"}
                        count={`${videoURLs.length}/3`}
                      />
                      <CompactURLBox
                        label={t.jobs.new.form.referenceAudio}
                        value={referenceAudioURLs}
                        onChange={setReferenceAudioURLs}
                        placeholder={"https://.../voice.mp3"}
                        count={`${audioURLs.length}/3`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <StatusFlowCard status={currentVideo?.status ?? "idle"} labels={t.jobs.new.flow} />
          <CurrentTaskCard
            video={currentVideo}
            retrying={retrying}
            onRetry={retryCurrentVideo}
            logs={eventLog}
            labels={t.jobs.new.task}
          />
          <div className="rounded-xl border border-border/80 bg-card/40 p-5">
            <h2 className="text-[13px] font-medium tracking-tight">
              {t.jobs.new.estimatedCost}
            </h2>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-mono text-[24px] text-foreground">
                {estimatedCost.toFixed(2)}
              </span>
              <span className="text-[12px] text-muted-foreground">{t.common.credits}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10.5px]">
              <span className="rounded-sm bg-signal/10 px-1.5 py-0.5 text-signal">
                {mode === "image" ? t.jobs.new.form.modeImageToVideo : t.jobs.new.form.modeTextToVideo}
              </span>
              <span className="rounded-sm bg-card px-1.5 py-0.5 text-muted-foreground">
                {model}
              </span>
              <span className="rounded-sm bg-card px-1.5 py-0.5 text-muted-foreground">
                {resolution}
              </span>
              <span className="rounded-sm bg-card px-1.5 py-0.5 text-muted-foreground">
                {duration}s
              </span>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
              {t.jobs.new.estimatedCostNote}
            </p>
          </div>
        </aside>
      </div>
    </DashboardShell>
  )
}

function AttachmentUploadButton({
  icon: Icon,
  label,
  accept,
  uploading,
  onUpload,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  accept: string
  uploading: boolean
  onUpload: (file: File) => void
}) {
  return (
    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground">
      <input
        type="file"
        accept={accept}
        disabled={uploading}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) onUpload(file)
        }}
      />
      {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {label}
    </label>
  )
}

function AttachmentPreview({
  kind,
  label,
  url,
  onRemove,
}: {
  kind: string
  label: string
  url?: string
  onRemove: () => void
}) {
  return (
    <div className="group relative flex h-24 w-36 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-card/70">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied or presigned URL
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Paperclip className="size-5" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-background/90 p-2 backdrop-blur">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{kind}</div>
        <div className="truncate text-[11px] text-foreground">{label}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function PillSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string
  value: string
  values: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="rounded-xl border border-border/80 bg-card/60 px-3 py-2">
      <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 bg-transparent font-mono text-[12px] text-foreground focus:outline-none"
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  )
}

function TogglePill({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] transition-colors",
        checked ? "border-foreground bg-foreground text-background" : "border-border/80 bg-card/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", checked ? "bg-background" : "bg-muted-foreground")} />
      {label}
    </button>
  )
}

function CompactURLBox({
  label,
  value,
  onChange,
  placeholder,
  count,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  count: string
}) {
  return (
    <label className="min-w-0 rounded-xl border border-border/70 bg-card/40 p-3">
      <span className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium text-foreground">{label}</span>
        <span className="font-mono text-[10.5px] text-muted-foreground">{count}</span>
      </span>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
    </label>
  )
}

function StatusFlowCard({
  status,
  labels,
}: {
  status: string
  labels: {
    title: string
    idle: string
    submit: string
    queue: string
    run: string
    callback: string
    done: string
  }
}) {
  const steps = [
    { key: "idle", label: labels.idle },
    { key: "submitting", label: labels.submit },
    { key: "queued", label: labels.queue },
    { key: "running", label: labels.run },
    { key: "callback", label: labels.callback },
    { key: "succeeded", label: labels.done },
  ]
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === status))
  const completeIndex = status === "failed" || status === "canceled" || status === "cancelled" ? 3 : activeIndex

  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-5">
      <h2 className="text-[13px] font-medium tracking-tight">{labels.title}</h2>
      <div className="mt-4 space-y-3">
        {steps.map((step, index) => {
          const done = index <= completeIndex && status !== "idle"
          const current = step.key === status || (step.key === "callback" && status === "succeeded")
          return (
            <div key={step.key} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border font-mono text-[10px]",
                  current || done ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className={cn("text-[12px]", current ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  sub,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-[12.5px] transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      <span className="font-medium">{label}</span>
      <span className="font-mono text-[10.5px] text-muted-foreground">{sub}</span>
    </button>
  )
}

function CurrentTaskCard({
  video,
  retrying,
  onRetry,
  logs,
  labels,
}: {
  video: CurrentVideo | null
  retrying: boolean
  onRetry: () => void
  logs: string[]
  labels: {
    title: string
    idleDescription: string
    failedOutput: string
    waitingOutput: string
    model: string
    cost: string
    tokens: string
    finished: string
    details: string
    download: string
    retry: string
    retrying: string
    outputStorageNotice: string
    callbackConsole: string
    copyAll: string
    status: Record<string, string>
  }
}) {
  if (!video) {
    return (
      <div className="rounded-xl border border-border/80 bg-card/40 p-5">
        <h2 className="text-[13px] font-medium tracking-tight">{labels.title}</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          {labels.idleDescription}
        </p>
        {logs.length > 0 && <CallbackLog logs={logs} title={labels.callbackConsole} copyAll={labels.copyAll} />}
      </div>
    )
  }

  const status = toJobStatus(video.status)
  const active = ACTIVE_STATUSES.has(video.status)
  const videoURL = video.output?.url || video.output?.video_url
  const cost = video.actual_cost_cents ?? video.estimated_cost_cents

  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium tracking-tight">{labels.title}</h2>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{video.id}</p>
        </div>
        <StatusPill status={status} label={labels.status[video.status] ?? video.status} />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border/70 bg-background">
        {videoURL ? (
          <video src={videoURL} controls className="aspect-video w-full bg-black object-contain" />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 px-4 text-center text-[12px] text-muted-foreground">
            {active ? <Loader2 className="size-4 animate-spin" /> : null}
            {video.status === "failed" ? labels.failedOutput : labels.waitingOutput}
          </div>
        )}
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className={cn(
            "h-full rounded-full bg-foreground transition-all",
            video.status === "queued" && "w-1/5",
            video.status === "submitting" && "w-2/5",
            (video.status === "running" || video.status === "retrying") && "w-3/4",
            video.status === "succeeded" && "w-full",
            video.status === "failed" && "w-full bg-status-failed",
          )}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
        <Metric label={labels.model} value={video.model || "—"} />
        <Metric label={labels.cost} value={cost != null ? `$${(cost / 100).toFixed(2)}` : "—"} />
        <Metric label={labels.tokens} value={video.upstream_tokens != null ? video.upstream_tokens.toLocaleString() : "—"} />
        <Metric label={labels.finished} value={video.finished_at ? new Date(video.finished_at).toLocaleTimeString() : "—"} />
      </div>

      {(video.error_code || video.error_message) && (
        <div className="mt-3 rounded-lg border border-status-failed/25 bg-status-failed-dim/10 p-3 text-[12.5px] text-status-failed">
          <span className="font-mono">{video.error_code || "failed"}</span>
          {video.error_message ? <span className="ml-2 text-foreground/80">{video.error_message}</span> : null}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/jobs/${video.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-[12.5px] hover:bg-background"
        >
          <ExternalLink className="size-3.5" /> {labels.details}
        </Link>
        {videoURL && (
          <a href={videoURL} download className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-[12.5px] hover:bg-background">
            <Download className="size-3.5" /> {labels.download}
          </a>
        )}
        {video.status === "failed" && (
          <button
            type="button"
            disabled={retrying}
            onClick={onRetry}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-[12.5px] hover:bg-background disabled:opacity-50"
          >
            <RefreshCcw className="size-3.5" /> {retrying ? labels.retrying : labels.retry}
          </button>
        )}
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
        {labels.outputStorageNotice}
      </p>
      <CallbackLog logs={logs} title={labels.callbackConsole} copyAll={labels.copyAll} />
    </div>
  )
}

function CallbackLog({ logs, title, copyAll }: { logs: string[]; title: string; copyAll: string }) {
  if (logs.length === 0) return null
  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-foreground">{title}</span>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(logs.join("\n\n"))}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {copyAll}
        </button>
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {logs.join("\n\n")}
      </pre>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/70">{label}</div>
      <div className="mt-1 truncate font-mono text-[12px] text-foreground/90">{value}</div>
    </div>
  )
}
