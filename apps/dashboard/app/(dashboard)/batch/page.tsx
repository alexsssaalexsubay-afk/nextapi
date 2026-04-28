"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Download,
  FileJson2,
  History,
  Loader2,
  Play,
  RefreshCcw,
  RotateCcw,
  Upload,
  Zap,
} from "lucide-react"
import { ModelSelect } from "@/components/ai/model-select"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ShotEditor } from "@/components/batch/shot-editor"
import { ConcurrencyIndicator } from "@/components/batch/concurrency-indicator"
import { ProgressGrid } from "@/components/batch/progress-grid"
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

const FALLBACK_MODELS = ["seedance-2.0-pro", "seedance-2.0-fast"]
const FALLBACK_RESOLUTIONS = ["1080p", "720p", "480p"]
const RESOLUTION_PRIORITY = ["1080p", "720p", "480p"]
const POLL_MS = 4000
const MAX_BATCH_JOBS = 500

type RowOutcome = {
  shot_id: string
  phase: "idle" | "queued" | "running" | "succeeded" | "failed"
  jobId?: string
  error?: string
  videoUrl?: string
}

type BatchRunSummary = {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
}

type BatchRunRecord = {
  id: string
  name?: string
  status: string
  totalShots: number
  queuedCount: number
  runningCount: number
  succeededCount: number
  failedCount: number
  createdAt?: string
  completedAt?: string | null
}

type BatchRunDetail = {
  id: string
  name?: string
  status: string
  summary: BatchRunSummary
  createdAt?: string
  completedAt?: string | null
}

type BatchJobRecord = {
  id: string
  status: string
  videoUrl?: string
  errorCode?: string
  errorMessage?: string
}

type BatchManifest = {
  rows?: Record<string, string>[]
  options?: Record<string, unknown>
}

type BackendModelCapability = {
  id: string
  status?: string
  supportedResolutions: string[]
}

function relTime(iso?: string | null): string {
  if (!iso) return "—"
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return "—"
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return `${Math.floor(diffSec / 86400)}d`
}

function normalizeBatchRunRecord(raw: Record<string, unknown>): BatchRunRecord {
  return {
    id: String(raw.id ?? raw.ID ?? ""),
    name: typeof raw.name === "string" ? raw.name : typeof raw.Name === "string" ? raw.Name : undefined,
    status:
      typeof raw.status === "string" ? raw.status : typeof raw.Status === "string" ? raw.Status : "running",
    totalShots: Number(raw.total_shots ?? raw.TotalShots ?? 0),
    queuedCount: Number(raw.queued_count ?? raw.QueuedCount ?? 0),
    runningCount: Number(raw.running_count ?? raw.RunningCount ?? 0),
    succeededCount: Number(raw.succeeded_count ?? raw.SucceededCount ?? 0),
    failedCount: Number(raw.failed_count ?? raw.FailedCount ?? 0),
    createdAt:
      typeof raw.created_at === "string"
        ? raw.created_at
        : typeof raw.CreatedAt === "string"
          ? raw.CreatedAt
          : undefined,
    completedAt:
      typeof raw.completed_at === "string"
        ? raw.completed_at
        : typeof raw.CompletedAt === "string"
          ? raw.CompletedAt
          : null,
  }
}

function normalizeBatchRunDetail(raw: Record<string, unknown>): BatchRunDetail {
  const summaryRaw = (raw.summary ?? raw.Summary ?? {}) as Record<string, unknown>
  return {
    id: String(raw.id ?? raw.ID ?? ""),
    name: typeof raw.name === "string" ? raw.name : typeof raw.Name === "string" ? raw.Name : undefined,
    status:
      typeof raw.status === "string" ? raw.status : typeof raw.Status === "string" ? raw.Status : "running",
    createdAt:
      typeof raw.created_at === "string"
        ? raw.created_at
        : typeof raw.CreatedAt === "string"
          ? raw.CreatedAt
          : undefined,
    completedAt:
      typeof raw.completed_at === "string"
        ? raw.completed_at
        : typeof raw.CompletedAt === "string"
          ? raw.CompletedAt
          : null,
    summary: {
      total: Number(summaryRaw.total ?? summaryRaw.Total ?? 0),
      queued: Number(summaryRaw.queued ?? summaryRaw.Queued ?? 0),
      running: Number(summaryRaw.running ?? summaryRaw.Running ?? 0),
      succeeded: Number(summaryRaw.succeeded ?? summaryRaw.Succeeded ?? 0),
      failed: Number(summaryRaw.failed ?? summaryRaw.Failed ?? 0),
    },
  }
}

function normalizeBatchJob(raw: Record<string, unknown>): BatchJobRecord {
  return {
    id: String(raw.id ?? raw.ID ?? ""),
    status:
      typeof raw.status === "string" ? raw.status : typeof raw.Status === "string" ? raw.Status : "queued",
    videoUrl:
      typeof raw.video_url === "string"
        ? raw.video_url
        : typeof raw.VideoURL === "string"
          ? raw.VideoURL
          : undefined,
    errorCode:
      typeof raw.error_code === "string"
        ? raw.error_code
        : typeof raw.ErrorCode === "string"
          ? raw.ErrorCode
          : undefined,
    errorMessage:
      typeof raw.error_message === "string"
        ? raw.error_message
        : typeof raw.ErrorMessage === "string"
          ? raw.ErrorMessage
          : undefined,
  }
}

function toBatchShotRequest(shot: PreparedShot, model: string, resolution: string) {
  const body = buildVideoCreateBody(shot, model, resolution)
  return {
    model: String(body.model ?? model),
    ...(typeof body.input === "object" && body.input ? (body.input as Record<string, unknown>) : {}),
  }
}

function jobStatusToPhase(status: string): RowOutcome["phase"] {
  if (status === "succeeded") return "succeeded"
  if (status === "failed" || status === "timed_out" || status === "canceled") return "failed"
  if (status === "queued" || status === "submitting") return "queued"
  return "running"
}

function buildOutcomesFromRun(jobs: BatchJobRecord[], manifest: BatchManifest | null): RowOutcome[] {
  const rows = Array.isArray(manifest?.rows) ? manifest.rows : []
  return jobs.map((job, index) => ({
    shot_id:
      typeof rows[index]?.shot_id === "string" && rows[index]?.shot_id
        ? rows[index]!.shot_id
        : `shot-${index + 1}`,
    phase: jobStatusToPhase(job.status),
    jobId: job.id,
    videoUrl: job.videoUrl,
    error: job.errorMessage || job.errorCode,
  }))
}

function normalizeModelCapability(raw: Record<string, unknown>): BackendModelCapability | null {
  const id = typeof raw.id === "string" ? raw.id : ""
  if (!id) return null
  return {
    id,
    status: typeof raw.status === "string" ? raw.status : undefined,
    supportedResolutions: Array.isArray(raw.supported_resolutions)
      ? raw.supported_resolutions.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [],
  }
}

function orderedResolutions(values: string[] | undefined): string[] {
  const unique = Array.from(new Set(values?.length ? values : FALLBACK_RESOLUTIONS))
  return unique.sort((a, b) => {
    const left = RESOLUTION_PRIORITY.indexOf(a)
    const right = RESOLUTION_PRIORITY.indexOf(b)
    if (left === -1 && right === -1) return a.localeCompare(b)
    if (left === -1) return 1
    if (right === -1) return -1
    return left - right
  })
}

export default function BatchStudioPage() {
  const t = useTranslations()
  const tb = t.batchStudio

  const [models, setModels] = useState<string[]>(FALLBACK_MODELS)
  const [modelCapabilities, setModelCapabilities] = useState<Record<string, BackendModelCapability>>({})
  const [modelCatalogState, setModelCatalogState] = useState<"loading" | "ready" | "fallback">("loading")
  const [model, setModel] = useState(FALLBACK_MODELS[0])
  const [resolution, setResolution] = useState("1080p")
  const [parallel, setParallel] = useState(5)
  const [csvName, setCsvName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<Record<string, string>[] | null>(null)
  const [validateResult, setValidateResult] = useState<ReturnType<typeof validateAndPrepareRows> | null>(null)
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null)
  const [recentRuns, setRecentRuns] = useState<BatchRunRecord[]>([])
  const [activeRun, setActiveRun] = useState<BatchRunDetail | null>(null)
  const [activeRunManifest, setActiveRunManifest] = useState<BatchManifest | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [loadingActiveRun, setLoadingActiveRun] = useState(false)
  const [running, setRunning] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [runLabel, setRunLabel] = useState<string | null>(null)
  const [batchName, setBatchName] = useState("")
  const [concurrency, setConcurrency] = useState<{
    current_in_flight: number
    org_burst_limit: number
    org_unlimited: boolean
    max_parallel?: number | null
  } | null>(null)

  const prepared = validateResult?.prepared ?? []
  const hasErrors = (validateResult?.errors.length ?? 0) > 0
  const canRun = prepared.length > 0 && !hasErrors && !running && modelCatalogState === "ready" && model.trim() !== ""
  const selectedCapability = modelCapabilities[model]
  const resolutionOptions = useMemo(
    () => orderedResolutions(selectedCapability?.supportedResolutions),
    [selectedCapability],
  )
  const modelHelper =
    modelCatalogState === "loading"
      ? tb.modelCatalogLoading
      : modelCatalogState === "ready"
        ? tb.modelCatalogHint
        : tb.modelCatalogFallback
  const resolutionHelper =
    selectedCapability
      ? tb.resolutionCapabilityHint.replace("{status}", selectedCapability.status ?? tb.unknownStatus)
      : tb.resolutionFallbackHint
  const parallelHintValue =
    typeof activeRunManifest?.options?.parallel === "string" ||
    typeof activeRunManifest?.options?.parallel === "number"
      ? String(activeRunManifest.options.parallel)
      : null

  const activeSummary = useMemo(() => {
    if (!activeRun) return null
    return [
      { key: "total", label: tb.summary.total, value: activeRun.summary.total },
      { key: "queued", label: tb.summary.queued, value: activeRun.summary.queued },
      { key: "running", label: tb.summary.running, value: activeRun.summary.running },
      { key: "succeeded", label: tb.summary.succeeded, value: activeRun.summary.succeeded },
      { key: "failed", label: tb.summary.failed, value: activeRun.summary.failed },
    ]
  }, [activeRun, tb.summary])

  const loadRecentRuns = useCallback(async () => {
    setLoadingRuns(true)
    try {
      const res = (await apiFetch("/v1/batch/runs?limit=8")) as { data?: Record<string, unknown>[] }
      const rows = Array.isArray(res?.data) ? res.data.map(normalizeBatchRunRecord).filter((r) => r.id) : []
      setRecentRuns(rows)
      if (!activeRunId && rows[0]?.id) {
        setActiveRunId(rows[0].id)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : tb.loadRunsFailed
      toast.error(message)
    } finally {
      setLoadingRuns(false)
    }
  }, [activeRunId, tb.loadRunsFailed])

  const loadRun = useCallback(
    async (runId: string) => {
      setLoadingActiveRun(true)
      try {
        const [detailRes, jobsRes, manifestRes] = (await Promise.all([
          apiFetch(`/v1/batch/runs/${runId}`),
          apiFetch(`/v1/batch/runs/${runId}/jobs?limit=${MAX_BATCH_JOBS}`),
          apiFetch(`/v1/batch/runs/${runId}/manifest`).catch(() => null),
        ])) as [
          Record<string, unknown>,
          { data?: Record<string, unknown>[] },
          Record<string, unknown> | null,
        ]

        const detail = normalizeBatchRunDetail(detailRes)
        const jobs = Array.isArray(jobsRes?.data) ? jobsRes.data.map(normalizeBatchJob) : []
        const manifest = manifestRes && typeof manifestRes === "object" ? (manifestRes as BatchManifest) : null
        setActiveRun(detail)
        setActiveRunManifest(manifest)
        setOutcomes(buildOutcomesFromRun(jobs, manifest))

        // Extract concurrency info from the batch run response
        const conc = detailRes.concurrency as Record<string, unknown> | undefined
        if (conc) {
          setConcurrency({
            current_in_flight: Number(conc.current_in_flight ?? 0),
            org_burst_limit: Number(conc.org_burst_limit ?? 200),
            org_unlimited: Boolean(conc.org_unlimited),
            max_parallel: conc.max_parallel != null ? Number(conc.max_parallel) : null,
          })
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : tb.loadRunFailed
        toast.error(message)
      } finally {
        setLoadingActiveRun(false)
      }
    },
    [tb.loadRunFailed],
  )

  useEffect(() => {
    apiFetch("/v1/models")
      .then((res) => {
        const items = (Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []) as Record<string, unknown>[]
        const capabilities = items
          .map(normalizeModelCapability)
          .filter((item): item is BackendModelCapability => item !== null)
        const ids = capabilities.map((item) => item.id)
        if (ids.length) {
          setModelCapabilities(Object.fromEntries(capabilities.map((item) => [item.id, item])))
          setModels(ids)
          setModel((m) => (ids.includes(m) ? m : ids[0]))
          setModelCatalogState("ready")
        } else {
          setModels([])
          setModelCatalogState("fallback")
        }
      })
      .catch(() => {
        setModels([])
        setModelCatalogState("fallback")
      })
  }, [])

  useEffect(() => {
    setResolution((current) => resolutionOptions.includes(current) ? current : resolutionOptions[0] ?? FALLBACK_RESOLUTIONS[0])
  }, [resolutionOptions])

  useEffect(() => {
    void loadRecentRuns()
  }, [loadRecentRuns])

  useEffect(() => {
    if (!activeRunId) return
    void loadRun(activeRunId)
  }, [activeRunId, loadRun])

  useEffect(() => {
    if (!activeRunId || !activeRun || activeRun.status !== "running") return
    const timer = window.setTimeout(() => {
      void loadRun(activeRunId)
      void loadRecentRuns()
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [activeRun, activeRunId, loadRecentRuns, loadRun])

  const resetOutcomes = useCallback((shots: PreparedShot[]) => {
    setOutcomes(
      shots.map((p) => ({
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

  const submitBatchRun = async (shots: PreparedShot[], label: string) => {
    if (!shots.length || running) return
    setRunning(true)
    setRunLabel(label)
    try {
      const displayName = batchName.trim() || `${label} · ${new Date().toISOString().slice(0, 16)}`
      const body = {
        name: displayName,
        shots: shots.map((shot) => toBatchShotRequest(shot, model, resolution)),
        manifest: {
          rows: shots.map((shot) => rawRows?.[shot.index] ?? { shot_id: shot.shot_id }),
          options: {
            model,
            resolution,
            parallel,
            label,
            submitted_from: "dashboard_batch_studio",
          },
        },
      }
      const res = (await apiFetch("/v1/batch/runs", {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Idempotency-Key": `batch-run-${crypto.randomUUID()}`,
        },
      })) as { batch_run_id?: string }
      if (!res?.batch_run_id) {
        throw new ApiError(tb.noBatchRunId, 500, "missing_batch_run_id")
      }
      setActiveRunId(res.batch_run_id)
      await Promise.all([loadRun(res.batch_run_id), loadRecentRuns()])
      toast.success(tb.runCreated)
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : tb.unknownError
      toast.error(message)
    } finally {
      setRunning(false)
      setRunLabel(null)
    }
  }

  const downloadActiveManifest = async () => {
    if (!activeRunId) return
    try {
      const manifest = (await apiFetch(`/v1/batch/runs/${activeRunId}/manifest`)) as Record<string, unknown>
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `batch-${activeRunId}.manifest.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tb.loadRunFailed)
    }
  }

  const retryFailed = async () => {
    if (!activeRunId || retrying) return
    setRetrying(true)
    try {
      const res = (await apiFetch(`/v1/batch/runs/${activeRunId}/retry-failed`, {
        method: "POST",
      })) as { retried?: number }
      await Promise.all([loadRun(activeRunId), loadRecentRuns()])
      if ((res?.retried ?? 0) > 0) toast.success(tb.retrySubmitted.replace("{count}", String(res.retried)))
      else toast.message(tb.retryNoop)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tb.unknownError)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <DashboardShell
      activeHref="/batch"
      title={tb.title}
      description={tb.subtitle}
      workspace
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadRecentRuns()}>
            <RefreshCcw className="mr-1.5 size-3.5" />
            {tb.refreshRuns}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/sample-shot-manifest.csv" download>
              <Download className="mr-1.5 size-3.5" />
              {tb.downloadSample}
            </a>
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-2 sm:p-3">
        <section className="rounded-lg border border-border bg-card/70 p-3">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg border border-signal/20 bg-signal/10">
              <Clapperboard className="size-4 text-signal" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-relaxed text-muted-foreground">{tb.intro}</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {tb.desktopHint}{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">toolkit/batch_studio</code>.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">{tb.uploadCsv}</Label>
              <div className="relative mt-2 min-h-[11rem] overflow-hidden rounded-3xl border border-dashed border-signal/30 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.18),transparent_42%),color-mix(in_oklch,var(--background)_72%,transparent)] shadow-sm backdrop-blur-md transition-colors hover:border-signal/55 hover:bg-muted/35">
                <div aria-hidden className="soft-noise pointer-events-none absolute inset-0 opacity-20" />
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                />
                <div className="pointer-events-none relative flex min-h-[11rem] flex-col items-center justify-center px-4 py-8 text-center">
                  <span className="mb-3 flex size-12 items-center justify-center rounded-2xl border border-white/12 bg-card/60 shadow-sm backdrop-blur-md">
                    <Upload className="size-6 text-signal" />
                  </span>
                  <span className="text-[13px] text-foreground">{csvName ?? tb.dropHint}</span>
                </div>
              </div>
            </div>

            {validateResult && (
              <div className="space-y-3 rounded-3xl border border-white/12 bg-background/50 p-4 shadow-sm backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {tb.rowCount}: {prepared.length}
                  </span>
                  {validateResult.errors.length > 0 && (
                    <span className="font-mono text-[11px] text-destructive">
                      {tb.errorCount}: {validateResult.errors.length}
                    </span>
                  )}
                  {parallelHintValue && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {tb.parallelHint}: {parallelHintValue}
                    </span>
                  )}
                </div>
                {validateResult.warnings.map((warning) => (
                  <div
                    key={warning}
                    className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
                {validateResult.errors.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto scroll-thin text-[12px] text-destructive">
                    {validateResult.errors.slice(0, 50).map((error) => (
                      <li key={`${error.index}-${error.shot_id}`}>
                        {tb.rowLabel.replace("{row}", String(error.index + 1))} ({error.shot_id || "—"}): {error.message}
                      </li>
                    ))}
                    {validateResult.errors.length > 50 && <li>… {tb.moreErrors}</li>}
                  </ul>
                )}
              </div>
            )}

            {/* Shot editor — editable table after CSV upload */}
            {prepared.length > 0 && !activeRunId && (
              <div className="space-y-3">
                <Label className="text-[12px]">{tb.editShots}</Label>
                <ShotEditor
                  shots={prepared}
                  onChange={(next) => {
                    setValidateResult((prev) =>
                      prev ? { ...prev, prepared: next } : null,
                    )
                  }}
                  disabled={running}
                />
              </div>
            )}

            {/* Batch name input */}
            {prepared.length > 0 && !activeRunId && (
              <div className="space-y-1.5">
                <Label className="text-[12px]">{tb.batchName}</Label>
                <Input
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder={tb.batchNamePlaceholder}
                  className="h-8 max-w-sm text-xs"
                  disabled={running}
                />
              </div>
            )}

            {activeRun && activeSummary && (
              <section className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                      {tb.activeRun}
                    </div>
                    <div className="mt-1 text-[15px] font-medium text-foreground">
                      {activeRun.name || activeRun.id}
                    </div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {tb.statusLabel}: {activeRun.status} · {tb.createdLabel}: {relTime(activeRun.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={downloadActiveManifest}>
                      <FileJson2 className="mr-1.5 size-3.5" />
                      {tb.downloadManifest}
                    </Button>
                    <Button variant="outline" size="sm" disabled={retrying} onClick={retryFailed}>
                      {retrying ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-1.5 size-3.5" />
                      )}
                      {tb.retryFailed}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {activeSummary.map((item) => (
                    <div key={item.key} className="rounded-lg border border-border/60 bg-background/40 p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live concurrency indicator */}
                {concurrency && activeRun.status === "running" && (
                  <ConcurrencyIndicator
                    inFlight={concurrency.current_in_flight}
                    burstLimit={concurrency.org_burst_limit}
                    unlimited={concurrency.org_unlimited}
                    maxParallel={concurrency.max_parallel}
                  />
                )}
              </section>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4">
            <ModelSelect
              label={tb.model}
              value={model}
              onChange={setModel}
              category="video"
              helper={modelHelper}
              availableModelIds={models}
              statusLabels={{
                live: tb.modelStatusLive,
                compat: tb.modelStatusCompat,
                configured: tb.modelStatusConfigured,
                comingSoon: tb.modelStatusUnavailable,
                recommended: tb.recommendedModels,
                bestForFlow: tb.bestForBatch,
                searchPlaceholder: tb.modelSearchPlaceholder,
                noMatches: tb.modelNoMatches,
                tierAdvanced: tb.tierAdvanced,
                tierPrimary: tb.tierPrimary,
                tierEconomy: tb.tierEconomy,
                tierExperimental: tb.tierExperimental,
                tierCompat: tb.tierCompat,
              }}
            />
            <div>
              <Label className="text-[12px]">{tb.resolution}</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resolutionOptions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{resolutionHelper}</p>
            </div>
            <div>
              <Label className="text-[12px]">{tb.parallel}</Label>
              <Select value={String(parallel)} onValueChange={(value) => setParallel(Number(value))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 8, 10, 15, 20].map((item) => (
                    <SelectItem key={item} value={String(item)}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{tb.parallelNote}</p>
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
                onClick={() => void submitBatchRun(prepared.slice(0, 3), tb.quickTest)}
              >
                <Zap className="mr-1.5 size-3.5" />
                {tb.quickTest}
              </Button>
              <Button disabled={!canRun} onClick={() => void submitBatchRun(prepared, tb.fullBatch)}>
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

            <div className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-foreground">
                <History className="size-3.5" />
                {tb.recentRuns}
              </div>
              <div className="space-y-2">
                {loadingRuns && <div className="text-[12px] text-muted-foreground">{tb.loadingRuns}</div>}
                {!loadingRuns && recentRuns.length === 0 && (
                  <div className="text-[12px] text-muted-foreground">{tb.emptyRuns}</div>
                )}
                {recentRuns.map((run) => {
                  const active = run.id === activeRunId
                  return (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => setActiveRunId(run.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-signal bg-signal/8"
                          : "border-border/60 bg-card/20 hover:border-border hover:bg-card/40"
                      }`}
                    >
                      <div className="truncate text-[12px] font-medium text-foreground">
                        {run.name || run.id}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{run.status}</span>
                        <span>{relTime(run.createdAt)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[10.5px] font-mono text-muted-foreground">
                        <span>T {run.totalShots}</span>
                        <span>Q {run.queuedCount}</span>
                        <span>R {run.runningCount}</span>
                        <span>S {run.succeededCount}</span>
                        <span>F {run.failedCount}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {loadingActiveRun && (
          <section className="rounded-lg border border-border/60 bg-card/20 p-4 text-[12px] text-muted-foreground">
            <Loader2 className="mr-2 inline size-3.5 animate-spin" />
            {tb.loadingRun}
          </section>
        )}

        {outcomes && outcomes.length > 0 && (
          <section>
            <h2 className="mb-3 text-[13px] font-medium tracking-tight">{tb.results}</h2>

            {/* Visual progress grid */}
            <div className="mb-4">
              <ProgressGrid
                shots={outcomes.map((o) => ({
                  shot_id: o.shot_id,
                  prompt: o.shot_id,
                  phase: o.phase as "idle" | "queued" | "running" | "succeeded" | "failed",
                  jobId: o.jobId,
                  videoUrl: o.videoUrl,
                  error: o.error,
                }))}
              />
            </div>

            {/* Detailed table */}
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
                  {outcomes.map((outcome) => (
                    <tr key={`${outcome.shot_id}-${outcome.jobId ?? "idle"}`} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 font-mono text-[11px]">{outcome.shot_id}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                          {outcome.phase === "succeeded" && (
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                          )}
                          {outcome.phase === "failed" && <AlertTriangle className="size-3.5 text-destructive" />}
                          {(outcome.phase === "queued" || outcome.phase === "running") && (
                            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                          )}
                          {tb.phase[outcome.phase as keyof typeof tb.phase] ?? outcome.phase}
                        </span>
                        {outcome.error && (
                          <div className="mt-1 max-w-md text-[11px] text-destructive">{outcome.error}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {outcome.jobId ? (
                          <Link href={`/jobs/${outcome.jobId}`} className="text-signal hover:underline">
                            {outcome.jobId.slice(0, 12)}…
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {outcome.videoUrl ? (
                          <a href={outcome.videoUrl} target="_blank" rel="noreferrer" className="text-signal hover:underline">
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
