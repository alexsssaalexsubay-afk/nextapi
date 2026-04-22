"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, ImageIcon, Play, Type, Upload, X } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { CodeBlock } from "@/components/nextapi/code-block"
import { StatusPill, type JobStatus } from "@/components/nextapi/status-pill"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type Mode = "text" | "image"

export default function NewJobPage() {
  const t = useTranslations()
  const [submit, setSubmit] = useState<JobStatus>("idle")
  const [mode, setMode] = useState<Mode>("text")
  const [model, setModel] = useState("seedance-2.0-pro")
  const [duration, setDuration] = useState("6")
  const [resolution, setResolution] = useState("1080p")
  const [seed, setSeed] = useState("42")
  const [webhook, setWebhook] = useState("https://acme.com/hooks/nextapi")
  const [prompt, setPrompt] = useState(t.jobs.new.form.promptPlaceholder)
  const [hasImage, setHasImage] = useState(false)

  const submitJob = () => {
    setSubmit("submitting")
    setTimeout(() => setSubmit("queued"), 900)
    setTimeout(() => setSubmit("running"), 2400)
    setTimeout(() => setSubmit("succeeded"), 6400)
  }

  // cURL body changes depending on mode
  const curlBody =
    mode === "image"
      ? `{
    "model": "${model}",
    "mode": "image-to-video",
    "image_url": "https://cdn.example.com/source.jpg",
    "prompt": "${prompt}",
    "duration": ${duration},
    "resolution": "${resolution}",
    "seed": ${seed},
    "webhook_url": "${webhook}"
  }`
      : `{
    "model": "${model}",
    "mode": "text-to-video",
    "prompt": "${prompt}",
    "duration": ${duration},
    "resolution": "${resolution}",
    "seed": ${seed},
    "webhook_url": "${webhook}"
  }`

  const running =
    submit === "submitting" || submit === "queued" || submit === "running"

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
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_420px]">
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">{t.jobs.new.title}</h1>
            <p className="mt-1 max-w-[560px] text-[13px] text-muted-foreground">
              {t.jobs.new.intro}
            </p>
          </div>

          <div className="flex flex-col gap-5 rounded-xl border border-border/80 bg-card/40 p-6">
            {/* Mode toggle — Seedance 2.0 supports both modes */}
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
                  <option value="seedance-2.0-pro">seedance-2.0-pro</option>
                  <option value="seedance-2.0-lite">seedance-2.0-lite</option>
                </select>
              </Field>
              <Field label={t.jobs.new.form.aspectRatio}>
                <select className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[13px] text-foreground focus:border-signal/50 focus:outline-none">
                  <option>16:9</option>
                  <option>9:16</option>
                  <option>1:1</option>
                  <option>4:3</option>
                </select>
              </Field>
            </div>

            {/* Conditional: source image for image-to-video mode */}
            {mode === "image" && (
              <Field
                label={t.jobs.new.form.sourceImage}
                hint={t.jobs.new.form.sourceImageHint}
              >
                {hasImage ? (
                  <div className="flex items-center gap-3 rounded-md border border-border/80 bg-background p-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-md border border-border/60 bg-[oklch(0.14_0.01_220)]">
                      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.25_0.05_170)] via-[oklch(0.18_0.03_200)] to-[oklch(0.11_0.004_260)]" />
                      <div className="absolute inset-0 bg-dots opacity-40" />
                    </div>
                    <div className="min-w-0 flex-1 font-mono text-[11.5px]">
                      <div className="truncate text-foreground">
                        source_frame_01.jpg
                      </div>
                      <div className="text-muted-foreground">
                        1920 × 1080 · 2.3 MB · uploaded
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHasImage(false)}
                      className="inline-flex size-7 items-center justify-center rounded-md border border-border/80 text-muted-foreground hover:text-foreground"
                      aria-label={t.jobs.new.form.sourceImageReplace}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setHasImage(true)}
                    className="group flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/80 bg-background py-6 text-muted-foreground transition-colors hover:border-signal/50 hover:text-foreground"
                  >
                    <Upload className="size-5" />
                    <span className="text-[12.5px]">{t.jobs.new.form.sourceImageDrop}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      png, jpg · max 8 MB
                    </span>
                  </button>
                )}
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

            <div className="grid grid-cols-3 gap-4">
              <Field label={t.jobs.new.form.duration}>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[13px] text-foreground focus:border-signal/50 focus:outline-none"
                >
                  <option value="6">6s</option>
                  <option value="5">5s</option>
                  <option value="10">10s</option>
                  <option value="30">30s</option>
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
              <Field label={`${t.jobs.new.form.seed} · ${t.jobs.new.form.seedHint}`}>
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[13px] text-foreground focus:border-signal/50 focus:outline-none"
                />
              </Field>
            </div>

            <Field label={t.jobs.new.form.webhook}>
              <input
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[13px] text-foreground focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <div className="flex items-center justify-between border-t border-border/60 pt-5">
              <div className="flex flex-col gap-0.5 font-mono text-[11.5px] text-muted-foreground">
                <div>
                  {t.jobs.new.willReserve}{" "}
                  <span className="text-foreground">1.00 {t.common.credits}</span>
                </div>
                <div>
                  {t.jobs.new.balanceAfter}: <span className="text-foreground">141.80</span>
                </div>
              </div>
              <button
                onClick={submitJob}
                disabled={running || (mode === "image" && !hasImage)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-all",
                  (running || (mode === "image" && !hasImage)) && "opacity-60",
                )}
              >
                {submit === "submitting" ? (
                  <>
                    <span className="size-3 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    {t.jobs.states.submitting}
                  </>
                ) : submit === "queued" ? (
                  <>{`${t.jobs.states.queued}…`}</>
                ) : submit === "running" ? (
                  <>{`${t.jobs.states.running}…`}</>
                ) : submit === "succeeded" ? (
                  <>{t.jobs.new.submitAnother}</>
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
                code: `curl https://api.nextapi.dev/v1/video/seedance \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${curlBody}'`,
              },
            ]}
          />
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-border/80 bg-card/40 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-medium tracking-tight">
                {t.jobs.new.tracker.title}
              </h2>
              {submit !== "idle" && <StatusPill status={submit} />}
            </div>
            {submit === "idle" ? (
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                {t.jobs.new.tracker.idleHint}
              </p>
            ) : (
              <ol className="mt-4 flex flex-col gap-3 text-[12.5px]">
                {[
                  { k: "submitting" as JobStatus, l: t.jobs.new.tracker.submittingTitle },
                  { k: "queued" as JobStatus, l: t.jobs.new.tracker.queuedTitle },
                  { k: "running" as JobStatus, l: t.jobs.new.tracker.runningTitle },
                  { k: "succeeded" as JobStatus, l: t.jobs.new.tracker.succeededTitle },
                ].map((row) => {
                  const order: JobStatus[] = ["submitting", "queued", "running", "succeeded"]
                  const idx = order.indexOf(submit)
                  const rowIdx = order.indexOf(row.k)
                  const state = rowIdx < idx ? "done" : rowIdx === idx ? "active" : "todo"
                  return (
                    <li key={row.k} className="flex items-center gap-3">
                      <div className="relative flex size-2 items-center justify-center">
                        {state === "active" && (
                          <span className="absolute inset-0 rounded-full bg-status-running op-pulse" />
                        )}
                        <span
                          className={cn(
                            "relative size-2 rounded-full",
                            state === "done" && "bg-status-success",
                            state === "active" && "bg-status-running",
                            state === "todo" && "bg-border",
                          )}
                        />
                      </div>
                      <span
                        className={cn(
                          state === "todo" ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {row.l}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <div className="rounded-xl border border-border/80 bg-card/40 p-5">
            <h2 className="text-[13px] font-medium tracking-tight">{t.jobs.new.estimatedCost}</h2>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-mono text-[24px] text-foreground">1.00</span>
              <span className="text-[12px] text-muted-foreground">
                {t.common.credits} · $0.12
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10.5px]">
              <span className="rounded-sm bg-signal/10 px-1.5 py-0.5 text-signal">
                {mode === "image" ? "image-to-video" : "text-to-video"}
              </span>
              <span className="rounded-sm bg-card px-1.5 py-0.5 text-muted-foreground">
                {model.replace("seedance-2.0-", "")}
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
