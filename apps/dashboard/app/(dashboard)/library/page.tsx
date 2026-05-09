"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  ImageIcon,
  Loader2,
  Music,
  Trash2,
  UploadCloud,
  UserRoundPlus,
  Video,
  X,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch, apiUpload, ApiError } from "@/lib/api"
import { createCharacter } from "@/lib/workflows"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type AssetKind = "image" | "video" | "audio"

type LibraryAsset = {
  id: string
  kind: AssetKind
  filename: string
  content_type: string
  size_bytes: number
  url: string
  generation_url?: string
  seedance_asset_status?: string
  seedance_processing_status?: string
  seedance_rejection_reason?: string
  url_expires_at: string
  created_at: string
}

type ListResponse = {
  assets?: LibraryAsset[]
  ttl_seconds?: number
}

type UploadNotice = {
  tone: "info" | "success" | "error"
  title: string
  detail?: string
} | null

type PreparedLibraryImage = {
  file: File
  normalized: boolean
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

const KIND_FILTERS: ReadonlyArray<{ id: "all" | AssetKind; key: string }> = [
  { id: "all", key: "all" },
  { id: "image", key: "image" },
  { id: "video", key: "video" },
  { id: "audio", key: "audio" },
]

const PROVIDER_IMAGE_MIN_SIDE = 300
const PROVIDER_IMAGE_MAX_SIDE = 6000
const PROVIDER_IMAGE_MIN_RATIO = 0.4
const PROVIDER_IMAGE_MAX_RATIO = 2.5

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function classifyByMime(file: File): AssetKind | null {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  return null
}

async function loadCanvasSource(file: File): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = "async"
  image.src = url
  await image.decode()
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  }
}

function providerImageTargetSize(width: number, height: number): { width: number; height: number; normalized: boolean } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width, height, normalized: false }
  }

  let scale = 1
  const minScale = Math.max(PROVIDER_IMAGE_MIN_SIDE / width, PROVIDER_IMAGE_MIN_SIDE / height)
  if (minScale > 1) {
    scale = minScale
  }
  const maxScale = Math.min(PROVIDER_IMAGE_MAX_SIDE / width, PROVIDER_IMAGE_MAX_SIDE / height)
  if (maxScale < scale) {
    scale = maxScale
  }

  const scaledWidth = Math.max(1, Math.round(width * scale))
  const scaledHeight = Math.max(1, Math.round(height * scale))
  let canvasWidth = scaledWidth
  let canvasHeight = scaledHeight
  const ratio = scaledWidth / scaledHeight
  if (ratio > PROVIDER_IMAGE_MAX_RATIO) {
    canvasHeight = Math.ceil(scaledWidth / PROVIDER_IMAGE_MAX_RATIO)
  } else if (ratio < PROVIDER_IMAGE_MIN_RATIO) {
    canvasWidth = Math.ceil(scaledHeight * PROVIDER_IMAGE_MIN_RATIO)
  }

  return {
    width: canvasWidth,
    height: canvasHeight,
    normalized: canvasWidth !== width || canvasHeight !== height || scaledWidth !== width || scaledHeight !== height,
  }
}

function jpegFilename(filename: string): string {
  const trimmed = filename.trim() || "image"
  if (/\.[^./\\]+$/.test(trimmed)) return trimmed.replace(/\.[^./\\]+$/, ".jpg")
  return `${trimmed}.jpg`
}

async function prepareLibraryImageForProvider(file: File): Promise<PreparedLibraryImage> {
  const image = await loadCanvasSource(file)
  try {
    const target = providerImageTargetSize(image.width, image.height)
    if (!target.normalized) {
      return {
        file,
        normalized: false,
        width: image.width,
        height: image.height,
        originalWidth: image.width,
        originalHeight: image.height,
      }
    }

    const canvas = document.createElement("canvas")
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("canvas_unavailable")
    }

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, target.width, target.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    const drawScale = Math.min(target.width / image.width, target.height / image.height)
    const drawWidth = Math.round(image.width * drawScale)
    const drawHeight = Math.round(image.height * drawScale)
    const offsetX = Math.floor((target.width - drawWidth) / 2)
    const offsetY = Math.floor((target.height - drawHeight) / 2)
    ctx.drawImage(image.source, offsetX, offsetY, drawWidth, drawHeight)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    })
    if (!blob) {
      throw new Error("canvas_encode_failed")
    }

    return {
      file: new File([blob], jpegFilename(file.name), { type: "image/jpeg", lastModified: file.lastModified }),
      normalized: true,
      width: target.width,
      height: target.height,
      originalWidth: image.width,
      originalHeight: image.height,
    }
  } finally {
    image.close()
  }
}

function isRejectedProviderUpload(asset: LibraryAsset): boolean {
  const status = asset.seedance_asset_status?.trim().toLowerCase()
  const processingStatus = asset.seedance_processing_status?.trim().toLowerCase()
  return (
    status === "failed" ||
    processingStatus === "failed" ||
    processingStatus === "rejected" ||
    Boolean(asset.seedance_rejection_reason?.trim())
  )
}

export default function AssetLibraryPage() {
  const t = useTranslations()
  const labels = t.library
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<AssetKind | null>(null)
  const [filter, setFilter] = useState<"all" | AssetKind>("all")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [characterDraft, setCharacterDraft] = useState<{ asset: LibraryAsset; name: string } | null>(null)
  const [creatingCharacter, setCreatingCharacter] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<UploadNotice>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = (await apiFetch("/v1/me/library/assets?kind=all")) as ListResponse
      setAssets(res?.assets ?? [])
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : labels.loadFailed
      setLoadError(msg)
    } finally {
      setLoading(false)
    }
  }, [labels.loadFailed])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleFile = useCallback(
    async (file: File) => {
      const kind = classifyByMime(file)
      if (!kind) {
        toast.error(labels.unsupportedKind)
        setUploadNotice({
          tone: "error",
          title: labels.unsupportedKind,
          detail: `${file.name} · ${file.type || "unknown"}`,
        })
        return
      }
      if (kind !== "image") {
        toast.error(labels.unsupportedKind)
        setUploadNotice({
          tone: "error",
          title: labels.unsupportedKind,
          detail: `${file.name} · ${file.type || kind}`,
        })
        return
      }
      if (file.size <= 0 || file.size > 30 * 1024 * 1024) {
        const title = file.size <= 0 ? labels.uploadEmptyFile : labels.uploadTooLarge
        toast.error(title)
        setUploadNotice({
          tone: "error",
          title,
          detail: `${file.name} · ${formatBytes(file.size)}`,
        })
        return
      }
      setUploading(kind)
      setUploadNotice({
        tone: "info",
        title: labels.uploadPreparingDetail.replace("{name}", file.name),
        detail: labels.uploadPreparingHint,
      })
      let prepared: PreparedLibraryImage
      try {
        prepared = await prepareLibraryImageForProvider(file)
      } catch {
        toast.error(labels.uploadNormalizeFailed)
        setUploadNotice({
          tone: "error",
          title: labels.uploadNormalizeFailed,
          detail: file.name,
        })
        setUploading(null)
        return
      }
      if (prepared.file.size <= 0 || prepared.file.size > 30 * 1024 * 1024) {
        const title = prepared.file.size <= 0 ? labels.uploadEmptyFile : labels.uploadTooLarge
        toast.error(title)
        setUploadNotice({
          tone: "error",
          title,
          detail: `${file.name} · ${formatBytes(prepared.file.size)}`,
        })
        setUploading(null)
        return
      }
      const normalizedHint = prepared.normalized
        ? labels.uploadNormalizedHint
            .replace("{from}", `${prepared.originalWidth}×${prepared.originalHeight}`)
            .replace("{to}", `${prepared.width}×${prepared.height}`)
        : null
      setUploadNotice({
        tone: "info",
        title: labels.uploadingDetail.replace("{name}", file.name),
        detail: normalizedHint || labels.uploadingNetworkHint,
      })
      try {
        const body = new FormData()
        body.append("file", prepared.file)
        const uploaded = (await apiUpload("/v1/me/library/assets", body)) as LibraryAsset
        const uploadedName = uploaded.filename || file.name
        const rejectionReason = uploaded.seedance_rejection_reason?.trim()
        if (isRejectedProviderUpload(uploaded)) {
          const detail = rejectionReason || labels.uploadRejectedDetail
          toast.error(detail)
          setUploadNotice({
            tone: "error",
            title: labels.uploadRejectedTitle.replace("{name}", uploadedName),
            detail,
          })
        } else {
          toast.success(labels.uploadSuccess)
          setUploadNotice({
            tone: "success",
            title: labels.uploadSuccessDetail.replace("{name}", uploadedName),
            detail: normalizedHint || labels.uploadProviderHint,
          })
        }
        await refresh()
      } catch (e) {
        if (e instanceof ApiError && e.code === "library_full") {
          toast.error(labels.libraryFull)
          setUploadNotice({ tone: "error", title: labels.libraryFull })
        } else if (e instanceof ApiError) {
          toast.error(e.message)
          setUploadNotice({
            tone: "error",
            title: labels.uploadFailed,
            detail: e.code === "network_unreachable" ? labels.uploadNetworkHint : e.message,
          })
        } else {
          toast.error(labels.uploadFailed)
          setUploadNotice({ tone: "error", title: labels.uploadFailed, detail: labels.uploadNetworkHint })
        }
      } finally {
        setUploading(null)
      }
    },
    [labels, refresh],
  )

  const handleDelete = useCallback(
    async (asset: LibraryAsset) => {
      if (!confirm(labels.confirmDelete.replace("{name}", asset.filename || asset.id))) {
        return
      }
      setDeletingId(asset.id)
      try {
        await apiFetch(`/v1/me/library/assets/${asset.id}`, { method: "DELETE" })
        toast.success(labels.deleted)
        setAssets((prev) => prev.filter((a) => a.id !== asset.id))
      } catch (e) {
        const msg =
          e instanceof ApiError ? e.message : e instanceof Error ? e.message : labels.deleteFailed
        toast.error(msg)
      } finally {
        setDeletingId(null)
      }
    },
    [labels],
  )

  const openCharacterDraft = useCallback((asset: LibraryAsset) => {
    const rawName = asset.filename?.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
    setCharacterDraft({ asset, name: rawName || labels.defaultCharacterName })
  }, [labels.defaultCharacterName])

  const handleCreateCharacter = useCallback(async () => {
    if (!characterDraft) return
    const name = characterDraft.name.trim()
    const referenceURL = isProviderReadyAsset(characterDraft.asset) ? characterDraft.asset.generation_url : ""
    if (!name) {
      toast.error(labels.characterNameRequired)
      return
    }
    if (!referenceURL) {
      toast.error(labels.characterProviderPending)
      return
    }
    setCreatingCharacter(true)
    try {
      await createCharacter({ name, reference_images: [referenceURL] })
      toast.success(labels.characterSaved)
      setCharacterDraft(null)
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : labels.characterSaveFailed
      toast.error(msg)
    } finally {
      setCreatingCharacter(false)
    }
  }, [characterDraft, labels])

  const filtered = useMemo(() => {
    if (filter === "all") return assets
    return assets.filter((a) => a.kind === filter)
  }, [assets, filter])

  const counts = useMemo(() => {
    const acc: Record<AssetKind, number> = { image: 0, video: 0, audio: 0 }
    for (const a of assets) {
      if (a.kind === "image" || a.kind === "video" || a.kind === "audio") {
        acc[a.kind] += 1
      }
    }
    return acc
  }, [assets])

  return (
    <DashboardShell activeHref="/library">
      <div className="mx-auto w-full max-w-[1280px] space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-medium tracking-tight">{labels.title}</h1>
            <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-muted-foreground">
              {labels.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading !== null}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[13px] font-medium text-background transition-all",
              uploading !== null && "cursor-not-allowed opacity-70",
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {labels.uploading}
              </>
            ) : (
              <>
                <UploadCloud className="size-3.5" />
                {labels.uploadButton}
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) void handleFile(file)
            }}
          />
        </header>

        <div
          className="rounded-[20px] border border-dashed border-border/80 bg-card/30 p-6"
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const f = e.dataTransfer.files?.[0]
            if (f) void handleFile(f)
          }}
        >
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <FolderOpen className="size-7 text-muted-foreground" />
            <p className="text-[13px] font-medium">{labels.dragHint}</p>
            <p className="text-[12px] text-muted-foreground">{labels.dragSubhint}</p>
          </div>
        </div>

        {uploadNotice ? (
          <div
            className={cn(
              "flex items-start gap-3 rounded-[18px] border p-4 text-[13px]",
              uploadNotice.tone === "info" && "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-200",
              uploadNotice.tone === "success" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
              uploadNotice.tone === "error" && "border-destructive/35 bg-destructive/10 text-destructive",
            )}
          >
            {uploadNotice.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : uploadNotice.tone === "info" ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium">{uploadNotice.title}</div>
              {uploadNotice.detail ? (
                <div className="mt-1 break-words text-[12px] opacity-80">{uploadNotice.detail}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setUploadNotice(null)}
              className="rounded-full p-1 opacity-70 transition hover:bg-background/60 hover:opacity-100"
              aria-label={labels.close}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {KIND_FILTERS.map((f) => {
            const isActive = filter === f.id
            const label = labels.filters[f.key as keyof typeof labels.filters]
            const count = f.id === "all" ? assets.length : counts[f.id]
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] transition-colors",
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/80 bg-card/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{label}</span>
                <span className="font-mono text-[10.5px] opacity-80">{count}</span>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-[13px]">{labels.loading}</span>
          </div>
        ) : loadError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-[13px] text-destructive">
            {loadError}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[20px] border border-border/70 bg-card/20 p-12 text-center">
            <p className="text-[13.5px] font-medium">{labels.emptyTitle}</p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">{labels.emptyHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                deleting={deletingId === asset.id}
                onDelete={() => handleDelete(asset)}
                onCreateCharacter={() => openCharacterDraft(asset)}
                labels={labels}
              />
            ))}
          </div>
        )}

        {characterDraft ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-xl">
            <div className="w-full max-w-[480px] overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-border/70 p-5">
                <div>
                  <h2 className="text-[18px] font-semibold tracking-tight">{labels.characterModalTitle}</h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {labels.characterModalSubtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCharacterDraft(null)}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition hover:bg-background hover:text-foreground"
                  aria-label={labels.close}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-[112px_1fr]">
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-border/70 bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={characterDraft.asset.url}
                    alt={characterDraft.asset.filename}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <label className="space-y-2">
                  <span className="text-[12px] font-medium text-muted-foreground">{labels.characterName}</span>
                  <input
                    value={characterDraft.name}
                    onChange={(e) => setCharacterDraft((current) => current ? { ...current, name: e.target.value } : current)}
                    className="h-11 w-full rounded-2xl border border-border/80 bg-background px-3 text-sm outline-none transition focus:border-signal focus:ring-4 focus:ring-signal/15"
                    placeholder={labels.characterNamePlaceholder}
                    autoFocus
                  />
                  <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                    {labels.characterModalHint}
                  </p>
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-border/70 p-5">
                <button
                  type="button"
                  onClick={() => setCharacterDraft(null)}
                  className="inline-flex h-10 items-center rounded-full border border-border/80 px-4 text-[13px] text-muted-foreground transition hover:text-foreground"
                >
                  {labels.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateCharacter()}
                  disabled={creatingCharacter}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-signal px-5 text-[13px] font-semibold text-white shadow-lg shadow-signal/25 transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
                >
                  {creatingCharacter ? <Loader2 className="size-3.5 animate-spin" /> : <UserRoundPlus className="size-3.5" />}
                  {labels.saveAsCharacter}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  )
}

function AssetCard({
  asset,
  deleting,
  onDelete,
  onCreateCharacter,
  labels,
}: {
  asset: LibraryAsset
  deleting: boolean
  onDelete: () => void
  onCreateCharacter: () => void
  labels: ReturnType<typeof useTranslations>["library"]
}) {
  const created = new Date(asset.created_at).toLocaleDateString()
  const Icon = asset.kind === "video" ? Video : asset.kind === "audio" ? Music : ImageIcon
  const canSaveCharacter = isProviderReadyAsset(asset)
  const reviewState = providerReviewState(asset, labels)

  return (
    <div className="group flex flex-col overflow-hidden rounded-[18px] border border-border/80 bg-card/40 transition-shadow hover:shadow-lg">
      <div className="relative aspect-square w-full overflow-hidden bg-[oklch(0.13_0.005_260)]">
        {asset.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt={asset.filename}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : asset.kind === "video" ? (
          <video
            src={asset.url}
            controls
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <Music className="size-8 text-muted-foreground" />
            <audio src={asset.url} controls className="w-full" />
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px] text-foreground/80 backdrop-blur">
          <Icon className="size-3" />
          {asset.kind}
        </span>
      </div>
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium" title={asset.filename}>
            {asset.filename || asset.id}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
            <span>{formatBytes(asset.size_bytes)}</span>
            <span>·</span>
            <span>{created}</span>
          </div>
          {reviewState ? (
            <div
              className={cn(
                "mt-1 max-w-full truncate text-[10.5px]",
                reviewState.tone === "ok" && "text-status-succeeded",
                reviewState.tone === "warn" && "text-amber-500",
                reviewState.tone === "bad" && "text-status-failed",
              )}
              title={reviewState.title}
            >
              {reviewState.label}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={labels.delete}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-status-failed disabled:opacity-50"
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
        {asset.kind === "image" ? (
          <button
            type="button"
            onClick={onCreateCharacter}
            disabled={!canSaveCharacter}
            title={canSaveCharacter ? labels.saveAsCharacter : labels.characterProviderPending}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-signal/30 bg-signal/10 px-2 text-[11px] font-medium text-signal hover:bg-signal hover:text-white disabled:cursor-not-allowed disabled:border-border/70 disabled:bg-muted/30 disabled:text-muted-foreground"
          >
            <UserRoundPlus className="size-3" />
            {labels.saveAsCharacter}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(asset.url).then(() => toast.success(labels.copied))
          }}
          className="inline-flex h-7 items-center rounded-md border border-border/80 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {labels.copyUrl}
        </button>
        <a
          href={asset.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 items-center rounded-md border border-border/80 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {labels.openOriginal}
        </a>
      </div>
    </div>
  )
}

function isProviderReadyAsset(asset: LibraryAsset): asset is LibraryAsset & { generation_url: string } {
  const status = asset.seedance_asset_status?.trim().toLowerCase()
  return asset.kind === "image" && status === "active" && Boolean(asset.generation_url)
}

function providerReviewState(
  asset: LibraryAsset,
  labels: ReturnType<typeof useTranslations>["library"],
): { label: string; title: string; tone: "ok" | "warn" | "bad" } | null {
  if (asset.kind !== "image" || !asset.seedance_asset_status) return null
  const status = asset.seedance_asset_status.trim().toLowerCase()
  if (status === "active") {
    return { label: labels.providerStatusActive, title: labels.providerStatusActive, tone: "ok" }
  }
  if (status === "ready") {
    return { label: labels.providerStatusReady, title: labels.providerStatusReady, tone: "ok" }
  }
  if (status === "failed") {
    const reason = asset.seedance_rejection_reason?.trim()
    return {
      label: reason || labels.providerStatusFailed,
      title: reason || labels.providerStatusFailed,
      tone: "bad",
    }
  }
  const processing = asset.seedance_processing_status?.trim()
  return {
    label: processing || labels.providerStatusPending,
    title: processing || labels.providerStatusPending,
    tone: "warn",
  }
}
