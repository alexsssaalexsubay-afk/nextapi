"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ImageIcon, Play, Type, Upload, X } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { CodeBlock } from "@/components/nextapi/code-block"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api"
import { jobApiErrorMessage } from "@/lib/api-error-i18n"
import { toast } from "sonner"

type Mode = "text" | "image"

const FALLBACK_MODELS = ["seedance-v2-pro", "seedance-v2"]

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

export default function NewJobPage() {
  const t = useTranslations()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("text")
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS)
  const [model, setModel] = useState(FALLBACK_MODELS[0])
  const [duration, setDuration] = useState("6")
  const [resolution, setResolution] = useState("1080p")
  const [prompt, setPrompt] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [imageUploading, setImageUploading] = useState(false)
  const [estimatedCost, setEstimatedCost] = useState(1.0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setEstimatedCost(
        estimateCostCredits(Number(duration), resolution, mode === "image" && !!imageUrl.trim()),
      )
    }, 300)
  }, [duration, resolution, mode, imageUrl])

  useEffect(() => {
    updateCost()
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [updateCost])

  // Fresh form: clear Sonner toasts and inline error from a previous page / route.
  useEffect(() => {
    setSubmitError(null)
    toast.dismiss()
  }, [])

  const onImagePicked = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t.jobs.new.form.imageUploadFailed)
      return
    }
    setImageUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = (await apiFetch("/v1/me/uploads/image", {
        method: "POST",
        body,
      })) as { url?: string }
      if (typeof res?.url === "string" && res.url) {
        setImageUrl(res.url)
        return
      }
      toast.error(t.jobs.new.form.imageUploadFailed)
    } catch (e) {
      if (e instanceof ApiError && e.code === "uploads_unavailable") {
        toast.error(t.jobs.new.form.uploadsUnavailable)
      } else {
        toast.error(t.jobs.new.form.imageUploadFailed)
      }
    } finally {
      setImageUploading(false)
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
    }
    if (mode === "image" && imageUrl.trim()) {
      input.image_url = imageUrl.trim()
    }
    const body = { model, input }
    try {
      const res = await apiFetch("/v1/videos", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": idempotencyKey },
      })
      toast.success(t.jobs.new.tracker.succeededTitle)
      const jobId: string = res?.id ?? res?.job_id ?? ""
      if (jobId) {
        router.push(`/jobs/${jobId}`)
      } else {
        router.push("/jobs")
      }
    } catch (err) {
      const msg = jobApiErrorMessage(t, err)
      setSubmitError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const curlBody =
    mode === "image"
      ? `{
  "model": "${model}",
  "input": {
    "prompt": "${prompt}",
    "image_url": "https://cdn.example.com/source.jpg",
    "duration_seconds": ${duration},
    "resolution": "${resolution}"
  }
}`
      : `{
  "model": "${model}",
  "input": {
    "prompt": "${prompt}",
    "duration_seconds": ${duration},
    "resolution": "${resolution}"
  }
}`

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
      <div className="grid min-w-0 grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex min-w-0 flex-col gap-5">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">{t.jobs.new.title}</h1>
            <p className="mt-1 max-w-[560px] text-[13px] text-muted-foreground">
              {t.jobs.new.intro}
            </p>
          </div>

          {submitError && (
            <div className="break-words rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
              {submitError}
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-5 rounded-xl border border-border/80 bg-card/40 p-6">
            <Field label={t.jobs.new.form.mode} hint={t.jobs.new.form.modeHint}>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border/80 bg-background p-1">
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
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t.jobs.new.form.model}>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[13px] text-foreground focus:border-signal/50 focus:outline-none"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.jobs.new.form.resolution}>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[13px] text-foreground focus:border-signal/50 focus:outline-none"
                >
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
              </Field>
            </div>

            {mode === "image" && (
              <Field
                label={t.jobs.new.form.sourceImage}
                hint={t.jobs.new.form.sourceImageHint}
              >
                <div className="space-y-3">
                  <div
                    className="relative min-h-[120px] overflow-hidden rounded-md border border-dashed border-border/80 bg-background transition-colors hover:border-signal/50"
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const f = e.dataTransfer.files?.[0]
                      if (f) void onImagePicked(f)
                    }}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      disabled={imageUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ""
                        if (f) void onImagePicked(f)
                      }}
                    />
                    <div className="pointer-events-none flex min-h-[120px] flex-col items-center justify-center gap-1.5 py-5 text-center text-muted-foreground">
                      {imageUploading ? (
                        <span className="text-[12.5px] text-foreground/80">
                          {t.jobs.new.form.imageUploading}
                        </span>
                      ) : (
                        <>
                          <Upload className="size-5" />
                          <span className="text-[12.5px]">{t.jobs.new.form.sourceImageDrop}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1 block text-[10.5px] text-muted-foreground">
                      {t.jobs.new.form.sourceImageOrPaste}
                    </span>
                    <input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder={t.jobs.new.form.sourceImageUrlPlaceholder}
                      className="h-9 w-full min-w-0 max-w-full rounded-md border border-border/80 bg-background px-2 font-mono text-[12px] text-foreground focus:border-signal/50 focus:outline-none"
                    />
                  </div>
                  {imageUrl.trim() && (
                    <div className="flex items-center gap-3 rounded-md border border-border/80 bg-background p-2 pr-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied or presigned URL */}
                      <img
                        src={imageUrl.trim()}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded object-cover"
                      />
                      <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                        {imageUrl.trim()}
                      </p>
                      <button
                        type="button"
                        onClick={() => setImageUrl("")}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/80 text-muted-foreground hover:text-foreground"
                        aria-label={t.jobs.new.form.sourceImageReplace}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                    {t.jobs.new.form.apiCapabilitiesNote}
                  </p>
                </div>
              </Field>
            )}

            <Field label={t.jobs.new.form.prompt}>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full rounded-md border border-border/80 bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <Field label={t.jobs.new.form.duration}>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[13px] text-foreground focus:border-signal/50 focus:outline-none"
              >
                <option value="5">5s</option>
                <option value="6">6s</option>
                <option value="10">10s</option>
                <option value="30">30s</option>
              </select>
            </Field>

            <div className="flex items-center justify-between border-t border-border/60 pt-5">
              <div className="flex flex-col gap-0.5 font-mono text-[11.5px] text-muted-foreground">
                <div>
                  {t.jobs.new.willReserve}{" "}
                  <span className="text-foreground">
                    {estimatedCost.toFixed(2)} {t.common.credits}
                  </span>
                </div>
              </div>
              <button
                onClick={submitJob}
                disabled={submitting || (mode === "image" && !imageUrl.trim())}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-all",
                  (submitting || (mode === "image" && !imageUrl.trim())) && "opacity-60",
                )}
              >
                {submitting ? (
                  <>
                    <span className="size-3 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    {t.jobs.states.submitting}
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" />
                    {t.jobs.new.form.submit}
                  </>
                )}
              </button>
            </div>
          </div>

          <CodeBlock
            tabs={[
              {
                label: t.jobs.new.liveCurl,
                language: "bash",
                code: `curl https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '${curlBody}'`,
              },
            ]}
          />
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
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
                {mode === "image" ? "image-to-video" : "text-to-video"}
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

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-[11px] text-muted-foreground">{hint}</span>
      )}
    </label>
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
