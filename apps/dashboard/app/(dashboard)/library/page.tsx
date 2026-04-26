"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FolderOpen,
  ImageIcon,
  Loader2,
  Music,
  Trash2,
  UploadCloud,
  Video,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch, apiUpload, ApiError } from "@/lib/api"
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
  url_expires_at: string
  created_at: string
}

type ListResponse = {
  assets?: LibraryAsset[]
  ttl_seconds?: number
}

const KIND_FILTERS: ReadonlyArray<{ id: "all" | AssetKind; key: string }> = [
  { id: "all", key: "all" },
  { id: "image", key: "image" },
  { id: "video", key: "video" },
  { id: "audio", key: "audio" },
]

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

export default function AssetLibraryPage() {
  const t = useTranslations()
  const labels = t.library
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<AssetKind | null>(null)
  const [filter, setFilter] = useState<"all" | AssetKind>("all")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = (await apiFetch("/v1/me/library/assets")) as ListResponse
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
        return
      }
      setUploading(kind)
      try {
        const body = new FormData()
        body.append("file", file)
        await apiUpload("/v1/me/library/assets", body)
        toast.success(labels.uploadSuccess)
        await refresh()
      } catch (e) {
        if (e instanceof ApiError && e.code === "library_full") {
          toast.error(labels.libraryFull)
        } else if (e instanceof ApiError) {
          toast.error(e.message)
        } else {
          toast.error(labels.uploadFailed)
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
            accept="image/*,video/*,audio/*"
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
                labels={labels}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function AssetCard({
  asset,
  deleting,
  onDelete,
  labels,
}: {
  asset: LibraryAsset
  deleting: boolean
  onDelete: () => void
  labels: ReturnType<typeof useTranslations>["library"]
}) {
  const created = new Date(asset.created_at).toLocaleDateString()
  const Icon = asset.kind === "video" ? Video : asset.kind === "audio" ? Music : ImageIcon

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
