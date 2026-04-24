"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Download,
  Loader2,
  Play,
  Upload,
  Zap,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch, ApiError } from "@/lib/api"
import {
  applyContinuityInheritance,
  buildVideoCreateBody,
  parseShotManifestCsv,
  validateAndPrepareRows,
  type PreparedShot,
} from "@/lib/batch-manifest"
import { toast } from "sonner"

const FALLBACK_MODELS = [
  "seedance-2.0-pro",
  "seedance-2.0-fast",
]
const POLL_MS = 4000
const MAX_POLL_MS = 15 * 60 * 1000

type RowOutcome = {
  shot_id: string
  phase: "idle" | "submitting" | "polling" | "succeeded" | "failed"
  jobId?: string
  error?: string
  videoUrl?: string
}

type VideoPollResult = {
  status: string
  videoUrl?: string
  error?: string
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export default function BatchStudioPage() {
  const t = useTranslations()
  const tb = t.batchStudio

  const [models, setModels] = useState<string[]>(FALLBACK_MODELS)
  const [model, setModel] = useState(FALLBACK_MODELS[0])
  const [resolution, setResolution] = useState("1080p")
  const [parallel, setParallel] = useState(5)
  const [csvName, setCsvName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<Record<string, string>[] | null>(null)
  const [validateResult, setValidateResult] = useState<ReturnType<
    typeof validateAndPrepareRows
  > | null>(null)
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null)
  const [running, setRunning] = useState(false)
  const [runLabel, setRunLabel] = useState<string | null>(null)

  useEffect(() => {
    apiFetch("/v1/models")
      .then((res) => {
        const items: { id: string }[] = res?.data ?? res ?? []
        const ids = items.map((m) => m.id).filter(Boolean)
        if (ids.length) {
          setModels(ids)
          setModel((m) => (ids.includes(m) ? m : ids[0]))
        }
      })
      .catch(() => {})
  }, [])

  const resetOutcomes = useCallback((prepared: PreparedShot[]) => {
    setOutcomes(
      prepared.map((p) => ({
        shot_id: p.shot_id,
        phase: "idle",
      })),
    )
  }, [])

  const onFile = async (file: File | null) => {
    if (!file) return
    setCsvName(file.name)
    try {
      const text = await file.text()
      const { rows } = parseShotManifestCsv(text)
      const inherited = applyContinuityInheritance(rows)
      setRawRows(inherited)
      const vr = validateAndPrepareRows(inherited)
      setValidateResult(vr)
      resetOutcomes(vr.prepared)
      if (vr.errors.length) {
        toast.error(tb.validateFailed)
      } else {
        toast.success(tb.validateOk)
      }
    } catch (e) {
      setRawRows(null)
      setValidateResult(null)
      setOutcomes(null)
      toast.error(e instanceof Error ? e.message : tb.parseError)
    }
  }

  const updateOutcome = (shotId: string, patch: Partial<RowOutcome>) => {
    setOutcomes((prev) =>
      prev?.map((o) => (o.shot_id === shotId ? { ...o, ...patch } : o)) ?? null,
    )
  }

  const pollJob = async (jobId: string): Promise<VideoPollResult> => {
    const deadline = Date.now() + MAX_POLL_MS
    while (Date.now() < deadline) {
      const v = (await apiFetch(`/v1/videos/${jobId}`)) as {
        status: string
        output?: { video_url?: string; url?: string }
        error_message?: string
      }
      const terminal = new Set(["succeeded", "failed"])
      if (terminal.has(v.status)) {
        const videoUrl = v.output?.video_url || v.output?.url
        return {
          status: v.status,
          videoUrl: videoUrl || undefined,
          error: v.error_message,
        }
      }
      await sleep(POLL_MS)
    }
    return { status: "failed", error: tb.pollTimeout }
  }

  const runPrepared = async (prepared: PreparedShot[], label: string) => {
    if (!prepared.length || running) return
    setRunning(true)
    setRunLabel(label)
    const batchNonce = crypto.randomUUID()
    resetOutcomes(prepared)

    let cursor = 0
    const worker = async () => {
      for (;;) {
        const i = cursor++
        if (i >= prepared.length) return
        const shot = prepared[i]
        updateOutcome(shot.shot_id, { phase: "submitting" })
        try {
          const body = buildVideoCreateBody(shot, model, resolution)
          const res = (await apiFetch("/v1/videos", {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
              "Idempotency-Key": `dash-batch-${batchNonce}-${shot.shot_id}`,
            },
          })) as { id?: string }
          const jobId = res.id
          if (!jobId) {
            updateOutcome(shot.shot_id, { phase: "failed", error: tb.noJobId })
            continue
          }
          updateOutcome(shot.shot_id, { phase: "polling", jobId })
          const fin = await pollJob(jobId)
          if (fin.status === "succeeded") {
            updateOutcome(shot.shot_id, {
              phase: "succeeded",
              jobId,
              videoUrl: fin.videoUrl,
            })
          } else {
            updateOutcome(shot.shot_id, {
              phase: "failed",
              jobId,
              error: fin.error || tb.jobFailed,
            })
          }
        } catch (e) {
          const msg =
            e instanceof ApiError ? e.message : e instanceof Error ? e.message : tb.unknownError
          updateOutcome(shot.shot_id, { phase: "failed", error: msg })
        }
      }
    }

    const n = Math.min(parallel, prepared.length)
    try {
      await Promise.all(Array.from({ length: n }, () => worker()))
      toast.success(tb.runComplete)
    } finally {
      setRunning(false)
      setRunLabel(null)
    }
  }

  const prepared = validateResult?.prepared ?? []
  const hasErrors = (validateResult?.errors.length ?? 0) > 0
  const canRun = prepared.length > 0 && !hasErrors && !running

  return (
    <DashboardShell
      activeHref="/batch"
      title={tb.title}
      description={tb.subtitle}
      actions={
        <Button variant="outline" size="sm" asChild>
          <a href="/sample-shot-manifest.csv" download>
            <Download className="mr-1.5 size-3.5" />
            {tb.downloadSample}
          </a>
        </Button>
      }
    >
      <div className="space-y-8 p-6">
        <section className="rounded-lg border border-border/80 bg-card/40 p-5">
          <div className="flex flex-wrap items-start gap-3">
            <Clapperboard className="mt-0.5 size-5 text-signal" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[13px] leading-relaxed text-muted-foreground">{tb.intro}</p>
              <p className="text-[12px] text-muted-foreground">
                {tb.desktopHint}{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  toolkit/batch_studio
                </code>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">{tb.uploadCsv}</Label>
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-8 transition-colors hover:bg-muted/35">
                <Upload className="mb-2 size-8 text-muted-foreground" />
                <span className="text-[13px] text-foreground">
                  {csvName ?? tb.dropHint}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {validateResult && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-background/50 p-4">
                <div className="flex flex-wrap gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {tb.rowCount}: {prepared.length}
                  </span>
                  {validateResult.errors.length > 0 && (
                    <span className="font-mono text-[11px] text-destructive">
                      {tb.errorCount}: {validateResult.errors.length}
                    </span>
                  )}
                </div>
                {validateResult.warnings.map((w) => (
                  <div
                    key={w}
                    className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
                {validateResult.errors.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto scroll-thin text-[12px] text-destructive">
                    {validateResult.errors.slice(0, 50).map((e) => (
                      <li key={`${e.index}-${e.shot_id}`}>
                        Row {e.index + 1} ({e.shot_id || "—"}): {e.message}
                      </li>
                    ))}
                    {validateResult.errors.length > 50 && (
                      <li>… {tb.moreErrors}</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4">
            <div>
              <Label className="text-[12px]">{tb.model}</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">{tb.resolution}</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1080p", "720p", "480p"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">{tb.parallel}</Label>
              <Select
                value={String(parallel)}
                onValueChange={(v) => setParallel(Number(v))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 8, 10, 15, 20].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                disabled={!prepared.length || running}
                variant="secondary"
                onClick={() => {
                  if (!rawRows) return
                  const inherited = applyContinuityInheritance(rawRows)
                  const vr = validateAndPrepareRows(inherited)
                  setValidateResult(vr)
                  resetOutcomes(vr.prepared)
                  if (vr.errors.length) toast.error(tb.validateFailed)
                  else toast.success(tb.validateOk)
                }}
              >
                {tb.revalidate}
              </Button>
              <Button
                disabled={!canRun}
                variant="outline"
                onClick={() => runPrepared(prepared.slice(0, 3), tb.quickTest)}
              >
                <Zap className="mr-1.5 size-3.5" />
                {tb.quickTest}
              </Button>
              <Button disabled={!canRun} onClick={() => runPrepared(prepared, tb.fullBatch)}>
                {running ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    {runLabel ?? tb.running}
                  </>
                ) : (
                  <>
                    <Play className="mr-1.5 size-3.5" />
                    {tb.fullBatch}
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/jobs">{tb.viewJobs}</Link>
              </Button>
            </div>
          </div>
        </section>

        {outcomes && outcomes.length > 0 && (
          <section>
            <h2 className="mb-3 text-[13px] font-medium tracking-tight">{tb.results}</h2>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[640px] text-left text-[12px]">
                <thead className="border-b border-border/60 bg-muted/30 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{tb.col.shot}</th>
                    <th className="px-3 py-2">{tb.col.status}</th>
                    <th className="px-3 py-2">{tb.col.job}</th>
                    <th className="px-3 py-2">{tb.col.output}</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o) => (
                    <tr key={o.shot_id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 font-mono text-[11px]">{o.shot_id}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                          {o.phase === "succeeded" && (
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                          )}
                          {(o.phase === "failed" || o.phase === "idle") && o.error && (
                            <AlertTriangle className="size-3.5 text-destructive" />
                          )}
                          {(o.phase === "submitting" || o.phase === "polling") && (
                            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                          )}
                          {tb.phase[o.phase as keyof typeof tb.phase] ?? o.phase}
                        </span>
                        {o.error && (
                          <div className="mt-1 max-w-md text-[11px] text-destructive">{o.error}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {o.jobId ? (
                          <Link href={`/jobs/${o.jobId}`} className="text-signal hover:underline">
                            {o.jobId.slice(0, 12)}…
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {o.videoUrl ? (
                          <a
                            href={o.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-signal hover:underline"
                          >
                            {tb.openVideo}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  )
}
