"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { adminFetch, AdminApiError } from "@/lib/admin-api"
import { useTranslations } from "@/lib/i18n/context"
import type { Messages } from "@/lib/i18n/messages/en"
import { cn } from "@/lib/utils"

type MarketingPageCopy = Messages["admin"]["marketingPage"]

const PRESET_KEYS = [
  "landing_hero_main",
  "gallery_strip_1",
  "gallery_strip_2",
  "gallery_strip_3",
  "gallery_strip_4",
  "gallery_strip_5",
] as const

const SLOT_KEY_RE = /^[a-z][a-z0-9_]{1,48}$/

type AdminSlot = {
  slot_key: string
  media_kind: string
  url: string
  poster_url?: string | null
  source: string
  updated_at: string
}

function slotMapFromResponse(slots: AdminSlot[] | undefined): Record<string, AdminSlot> {
  const m: Record<string, AdminSlot> = {}
  for (const s of slots ?? []) {
    m[s.slot_key] = s
  }
  return m
}

export default function MarketingSlotsPage() {
  const t = useTranslations()
  const p = t.admin.marketingPage
  const [byKey, setByKey] = useState<Record<string, AdminSlot>>({})
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [extUrl, setExtUrl] = useState("")
  const [extPoster, setExtPoster] = useState("")
  const [extKind, setExtKind] = useState<"image" | "video">("image")
  const [extClearPoster, setExtClearPoster] = useState(false)
  const [extBusy, setExtBusy] = useState(false)
  const [extErr, setExtErr] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState<string | null>(null)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null)
  const [customDraft, setCustomDraft] = useState("")
  const [customErr, setCustomErr] = useState<string | null>(null)
  const [customActive, setCustomActive] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setListError(null)
    adminFetch("/marketing/slots")
      .then((res: unknown) => {
        const slots = (res as { slots?: AdminSlot[] })?.slots
        setByKey(slotMapFromResponse(slots))
      })
      .catch(() => setListError(p.loadError))
      .finally(() => setLoading(false))
  }, [p.loadError])

  useEffect(() => {
    load()
  }, [load])

  const presetHint = (key: string) => {
    const hints = p.slotHints as Record<string, string>
    return hints[key] ?? ""
  }

  const openExternal = (slot: string, row: AdminSlot | undefined, imageOnly: boolean) => {
    setExpanded(slot)
    setExtUrl("")
    setExtPoster("")
    setExtClearPoster(false)
    setExtErr(null)
    if (imageOnly) setExtKind("image")
    else setExtKind(row?.media_kind === "video" ? "video" : "image")
  }

  async function submitExternal(slot: string) {
    setExtBusy(true)
    setExtErr(null)
    try {
      const body: Record<string, unknown> = {
        media_kind: extKind,
        url: extUrl.trim(),
        clear_poster: extClearPoster,
      }
      if (extPoster.trim()) body.poster_url = extPoster.trim()
      await adminFetch(`/marketing/slots/${encodeURIComponent(slot)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
      setExpanded(null)
      load()
    } catch (e) {
      setExtErr(e instanceof AdminApiError ? e.message : p.loadError)
    } finally {
      setExtBusy(false)
    }
  }

  async function onUpload(slot: string, imageOnly: boolean, file: File | null, poster: File | null) {
    if (!file) return
    setUploadBusy(slot)
    setUploadErr(null)
    try {
      const fd = new FormData()
      const kind: "image" | "video" = imageOnly ? "image" : file.type.startsWith("video/") ? "video" : "image"
      fd.append("media_kind", kind)
      fd.append("file", file)
      if (kind === "video" && poster && poster.size > 0) {
        fd.append("poster", poster)
      }
      await adminFetch(`/marketing/slots/${encodeURIComponent(slot)}/upload`, {
        method: "POST",
        body: fd,
      })
      load()
    } catch (e) {
      setUploadErr(e instanceof AdminApiError ? e.message : p.loadError)
    } finally {
      setUploadBusy(null)
    }
  }

  async function onDelete(slot: string) {
    if (!window.confirm(`${p.remove} ${slot}?`)) return
    setDeleteBusy(slot)
    try {
      await adminFetch(`/marketing/slots/${encodeURIComponent(slot)}`, { method: "DELETE" })
      load()
    } catch {
      /* ignore */
    } finally {
      setDeleteBusy(null)
    }
  }

  function activateCustom() {
    const k = customDraft.trim()
    setCustomErr(null)
    if (!SLOT_KEY_RE.test(k)) {
      setCustomErr(p.invalidSlotKey)
      return
    }
    if ((PRESET_KEYS as readonly string[]).includes(k)) {
      setCustomErr(p.duplicateSlot)
      return
    }
    setCustomActive(k)
  }

  const customKeys = useMemo(() => {
    if (!customActive || (PRESET_KEYS as readonly string[]).includes(customActive)) return []
    return [customActive]
  }, [customActive])

  return (
    <AdminShell activeHref="/marketing" title={p.title} description={p.description}>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted-foreground">{p.limitsHint}</p>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border/80 bg-card/40 px-3 text-[12.5px] text-foreground hover:bg-card/60 disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {p.refresh}
          </button>
        </div>

        {listError ? (
          <p className="rounded-md border border-status-failed/30 bg-status-failed/10 px-3 py-2 text-[13px] text-status-failed">
            {listError}
          </p>
        ) : null}
        {uploadErr ? (
          <p className="rounded-md border border-status-failed/30 bg-status-failed/10 px-3 py-2 text-[13px] text-status-failed">
            {uploadErr}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border/80">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="border-b border-border/80 bg-muted/30 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">{p.slotKey}</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">{p.kind}</th>
                <th className="hidden px-4 py-2.5 md:table-cell">{p.source}</th>
                <th className="px-4 py-2.5">{p.status}</th>
                <th className="px-4 py-2.5 text-right">{p.updated}</th>
              </tr>
            </thead>
            <tbody>
              {PRESET_KEYS.map((key) => (
                <SlotRow
                  key={key}
                  slotKey={key}
                  row={byKey[key]}
                  hint={presetHint(key)}
                  imageOnly={key.startsWith("gallery_strip_")}
                  expanded={expanded === key}
                  onToggleExternal={() =>
                    expanded === key ? setExpanded(null) : openExternal(key, byKey[key], key.startsWith("gallery_strip_"))
                  }
                  extUrl={extUrl}
                  setExtUrl={setExtUrl}
                  extPoster={extPoster}
                  setExtPoster={setExtPoster}
                  extKind={extKind}
                  setExtKind={setExtKind}
                  extClearPoster={extClearPoster}
                  setExtClearPoster={setExtClearPoster}
                  extErr={extErr}
                  extBusy={extBusy}
                  onSubmitExternal={() => submitExternal(key)}
                  uploadBusy={uploadBusy === key}
                  deleteBusy={deleteBusy === key}
                  onUpload={(f, poster) => onUpload(key, key.startsWith("gallery_strip_"), f, poster)}
                  onDelete={() => onDelete(key)}
                  labels={p}
                />
              ))}
              {customKeys.map((key) => (
                <SlotRow
                  key={`custom-${key}`}
                  slotKey={key}
                  row={byKey[key]}
                  hint=""
                  imageOnly={false}
                  expanded={expanded === key}
                  onToggleExternal={() =>
                    expanded === key ? setExpanded(null) : openExternal(key, byKey[key], false)
                  }
                  extUrl={extUrl}
                  setExtUrl={setExtUrl}
                  extPoster={extPoster}
                  setExtPoster={setExtPoster}
                  extKind={extKind}
                  setExtKind={setExtKind}
                  extClearPoster={extClearPoster}
                  setExtClearPoster={setExtClearPoster}
                  extErr={extErr}
                  extBusy={extBusy}
                  onSubmitExternal={() => submitExternal(key)}
                  uploadBusy={uploadBusy === key}
                  deleteBusy={deleteBusy === key}
                  onUpload={(f, poster) => onUpload(key, false, f, poster)}
                  onDelete={() => onDelete(key)}
                  labels={p}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border/80 bg-card/30 p-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{p.customSection}</div>
          <div className="flex flex-wrap gap-2">
            <input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder={p.customSlotPlaceholder}
              className="h-9 min-w-[200px] flex-1 rounded-md border border-border/80 bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-signal/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => activateCustom()}
              className="h-9 rounded-md border border-border/80 bg-card/40 px-4 text-[12.5px] font-medium hover:bg-card/60"
            >
              {p.customOpen}
            </button>
          </div>
          {customErr ? <p className="mt-2 text-[12.5px] text-status-failed">{customErr}</p> : null}
        </div>
      </div>
    </AdminShell>
  )
}

function SlotRow({
  slotKey,
  row,
  hint,
  imageOnly,
  expanded,
  onToggleExternal,
  extUrl,
  setExtUrl,
  extPoster,
  setExtPoster,
  extKind,
  setExtKind,
  extClearPoster,
  setExtClearPoster,
  extErr,
  extBusy,
  onSubmitExternal,
  uploadBusy,
  deleteBusy,
  onUpload,
  onDelete,
  labels,
}: {
  slotKey: string
  row: AdminSlot | undefined
  hint: string
  imageOnly: boolean
  expanded: boolean
  onToggleExternal: () => void
  extUrl: string
  setExtUrl: (v: string) => void
  extPoster: string
  setExtPoster: (v: string) => void
  extKind: "image" | "video"
  setExtKind: (v: "image" | "video") => void
  extClearPoster: boolean
  setExtClearPoster: (v: boolean) => void
  extErr: string | null
  extBusy: boolean
  onSubmitExternal: () => void
  uploadBusy: boolean
  deleteBusy: boolean
  onUpload: (file: File | null, poster: File | null) => void
  onDelete: () => void
  labels: MarketingPageCopy
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const posterRef = useRef<HTMLInputElement>(null)
  const fileInputId = `marketing-slot-file-${slotKey}`
  const posterInputId = `marketing-slot-poster-${slotKey}`

  function runUpload() {
    const main = fileRef.current?.files?.[0] ?? null
    const poster = !imageOnly ? posterRef.current?.files?.[0] ?? null : null
    onUpload(main, poster)
  }

  return (
    <>
      <tr className="border-b border-border/60 last:border-0">
        <td className="px-4 py-3 align-top">
          <div className="font-mono text-[12px] text-foreground">{slotKey}</div>
          {hint ? <div className="mt-1 max-w-[320px] text-[11.5px] leading-snug text-muted-foreground">{hint}</div> : null}
        </td>
        <td className="hidden px-4 py-3 align-top sm:table-cell">{row?.media_kind ?? "—"}</td>
        <td className="hidden max-w-[200px] px-4 py-3 align-top text-[12px] md:table-cell">
          {row?.source === "r2_non_cms" ? labels.sourceNonCms : (row?.source ?? "—")}
        </td>
        <td className="px-4 py-3 align-top">
          {row ? (
            row.url ? (
              <div className="flex flex-col gap-2">
                {row.media_kind === "video" ? (
                  <video
                    src={row.url}
                    poster={row.poster_url ?? undefined}
                    className="h-14 w-24 rounded border border-border/80 object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img src={row.url} alt="" className="h-14 w-24 rounded border border-border/80 object-cover" />
                )}
              </div>
            ) : (
              <span className="max-w-[220px] text-[11px] leading-snug text-status-running">{labels.sourceNonCms}</span>
            )
          ) : (
            <span className="text-muted-foreground">{labels.notSet}</span>
          )}
        </td>
        <td className="px-4 py-3 align-top text-right text-[11.5px] text-muted-foreground">
          {row?.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
        </td>
      </tr>
      <tr className="border-b border-border/60 bg-muted/10 last:border-0">
        <td colSpan={5} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleExternal}
              className={cn(
                "h-8 rounded-md border px-3 text-[12px]",
                expanded ? "border-signal/50 bg-signal/10 text-foreground" : "border-border/80 bg-background hover:bg-muted/40",
              )}
            >
              {labels.set}
            </button>
            <input
              ref={fileRef}
              id={fileInputId}
              type="file"
              accept={imageOnly ? "image/*" : "image/*,video/*"}
              className="sr-only"
            />
            <label
              htmlFor={fileInputId}
              className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border/80 bg-background px-3 text-[12px] hover:bg-muted/40"
            >
              {labels.uploadPick}
            </label>
            {!imageOnly ? (
              <>
                <input ref={posterRef} id={posterInputId} type="file" accept="image/*" className="sr-only" />
                <label
                  htmlFor={posterInputId}
                  className="inline-flex h-8 cursor-pointer items-center rounded-md border border-dashed border-border/80 px-3 text-[11.5px] text-muted-foreground hover:bg-muted/30"
                >
                  {labels.posterPick}
                </label>
              </>
            ) : null}
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => runUpload()}
              className="inline-flex h-8 items-center rounded-md border border-border/80 bg-background px-3 text-[12px] hover:bg-muted/40 disabled:opacity-50"
            >
              {uploadBusy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
              {labels.upload}
            </button>
            <button
              type="button"
              disabled={!row || deleteBusy}
              onClick={onDelete}
              className="h-8 rounded-md border border-border/80 px-3 text-[12px] text-muted-foreground hover:border-status-failed/40 hover:text-status-failed disabled:opacity-40"
            >
              {deleteBusy ? <Loader2 className="size-3 animate-spin" /> : labels.remove}
            </button>
          </div>

          {expanded ? (
            <div className="mt-4 space-y-3 rounded-md border border-border/80 bg-background p-4">
              <div className="text-[12px] font-medium text-foreground">{labels.externalTitle}</div>
              {!imageOnly ? (
                <div className="flex gap-3 text-[12px]">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="radio" checked={extKind === "image"} onChange={() => setExtKind("image")} />
                    {labels.mediaImage}
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="radio" checked={extKind === "video"} onChange={() => setExtKind("video")} />
                    {labels.mediaVideo}
                  </label>
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-[11.5px] text-muted-foreground">{labels.url}</label>
                <input
                  value={extUrl}
                  onChange={(e) => setExtUrl(e.target.value)}
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[13px] focus:border-signal/50 focus:outline-none"
                  placeholder="https://"
                />
              </div>
              {extKind === "video" ? (
                <div>
                  <label className="mb-1 block text-[11.5px] text-muted-foreground">{labels.posterUrl}</label>
                  <input
                    value={extPoster}
                    onChange={(e) => setExtPoster(e.target.value)}
                    className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[13px] focus:border-signal/50 focus:outline-none"
                    placeholder="https://"
                  />
                  <label className="mt-2 inline-flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={extClearPoster} onChange={(e) => setExtClearPoster(e.target.checked)} />
                    {labels.clearPoster}
                  </label>
                </div>
              ) : null}
              {extErr ? <p className="text-[12px] text-status-failed">{extErr}</p> : null}
              <button
                type="button"
                disabled={extBusy || !extUrl.trim()}
                onClick={onSubmitExternal}
                className="h-9 rounded-md bg-foreground px-4 text-[12.5px] font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {extBusy ? labels.saving : labels.save}
              </button>
            </div>
          ) : null}
        </td>
      </tr>
    </>
  )
}
