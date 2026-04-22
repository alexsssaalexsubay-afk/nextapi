"use client"

import { useEffect, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { adminFetch } from "@/lib/admin-api"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

type Entry = {
  ts: string
  actor: string
  action: string
  target: string
  ip: string
  hash: string
  tone?: "default" | "write" | "sensitive"
}

const MOCK_ENTRIES: Entry[] = [
  {
    ts: "2026-04-22 22:12:44.812",
    actor: "m. winters",
    action: "credits.adjust",
    target: "org:linear-media · +120.00",
    ip: "10.4.12.88",
    hash: "f8c2…9a4b",
    tone: "sensitive",
  },
  {
    ts: "2026-04-22 22:08:19.204",
    actor: "s. patel",
    action: "key.rotate",
    target: "org:acme-prod · sk_live_7Hc9…4rS",
    ip: "10.4.12.91",
    hash: "a031…1e77",
    tone: "sensitive",
  },
  {
    ts: "2026-04-22 22:04:02.118",
    actor: "j. li",
    action: "attention.resolve",
    target: "job_3Bf0Kq9Uj2IwAa5R · refund 1.00",
    ip: "10.4.12.62",
    hash: "7bc1…02d4",
    tone: "write",
  },
  {
    ts: "2026-04-22 21:51:30.944",
    actor: "m. winters",
    action: "flag.toggle",
    target: "seedance.pool_b_shift · on",
    ip: "10.4.12.88",
    hash: "ee19…3f2c",
    tone: "write",
  },
  {
    ts: "2026-04-22 21:34:11.701",
    actor: "billing-bot",
    action: "invoice.finalize",
    target: "org:parallax-studio · inv_2026_0412",
    ip: "internal",
    hash: "3412…a8b0",
    tone: "write",
  },
  {
    ts: "2026-04-22 20:18:04.412",
    actor: "m. winters",
    action: "session.open",
    target: "admin.ops.nextapi.dev · webauthn",
    ip: "10.4.12.88",
    hash: "b8e2…7c10",
  },
  {
    ts: "2026-04-22 19:58:41.022",
    actor: "j. li",
    action: "org.view",
    target: "org:stellar-post · masked_pii=true",
    ip: "10.4.12.62",
    hash: "d401…9f88",
  },
  {
    ts: "2026-04-22 19:12:03.201",
    actor: "s. patel",
    action: "credits.adjust",
    target: "org:acme-prod · −8.42",
    ip: "10.4.12.91",
    hash: "c702…bb10",
    tone: "sensitive",
  },
]

type ApiModerationEvent = {
  ID?: number
  id?: number
  OrgID?: string
  org_id?: string
  VideoID?: string | null
  video_id?: string | null
  Verdict?: string
  verdict?: string
  Reason?: string | null
  reason?: string | null
  InternalNote?: string | null
  internal_note?: string | null
  Reviewer?: string | null
  reviewer?: string | null
  ProfileUsed?: string
  profile_used?: string
  CreatedAt?: string
  created_at?: string
}

// TODO: align with backend response — dedicated audit chain vs moderation events.
function formatAuditTs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`
}

function moderationEventToAuditEntry(e: ApiModerationEvent): Entry {
  const id = e.ID ?? e.id ?? 0
  const orgId = e.OrgID ?? e.org_id ?? ""
  const verdict = e.Verdict ?? e.verdict ?? ""
  const reason = e.Reason ?? e.reason ?? ""
  const note = e.InternalNote ?? e.internal_note ?? ""
  const reviewer = e.Reviewer ?? e.reviewer ?? "—"
  const profile = e.ProfileUsed ?? e.profile_used ?? ""
  const vid = e.VideoID ?? e.video_id ?? ""
  const created = e.CreatedAt ?? e.created_at ?? ""
  const targetParts = [`org:${orgId.slice(0, 8)}`]
  if (vid) targetParts.push(`video:${String(vid).slice(0, 8)}`)
  if (reason) targetParts.push(reason)
  else if (note) targetParts.push(note)
  const tone: Entry["tone"] =
    verdict === "block" ? "sensitive" : verdict === "review" ? "write" : "default"
  return {
    ts: formatAuditTs(created),
    actor: reviewer,
    action: `moderation.${verdict || "event"}`,
    target: targetParts.join(" · "),
    ip: profile || "—",
    hash: `me_${id}`,
    tone,
  }
}

export default function AuditLogPage() {
  const t = useTranslations()
  const p = t.admin.auditPage
  const [entries, setEntries] = useState<Entry[]>(MOCK_ENTRIES)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fromApi, setFromApi] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = (await adminFetch("/moderation/events")) as { data?: ApiModerationEvent[] }
        const rows = (res.data ?? []).map(moderationEventToAuditEntry)
        if (!cancelled) {
          setEntries(rows.length > 0 ? rows : MOCK_ENTRIES)
          setFromApi(rows.length > 0)
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load audit data")
          setEntries(MOCK_ENTRIES)
          setFromApi(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AdminShell
      activeHref="/audit"
      title={p.title}
      description={p.description}
      meta={
        <>
          <span>{p.meta.chainHeight}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.tailHash}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.verified}</span>
          {loading && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground">{t.common.loading}…</span>
            </>
          )}
        </>
      }
      actions={
        <>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12px] text-foreground hover:bg-card">
            {p.verifyChain}
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12px] text-foreground hover:bg-card">
            {p.export}
          </button>
        </>
      }
    >
      <div className="space-y-6 p-6">
        {loadError && (
          <div className="rounded-lg border border-status-failed/30 bg-status-failed/10 px-4 py-2 font-mono text-[11px] text-status-failed">
            {loadError}
          </div>
        )}
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card/40 p-3 font-mono text-[11.5px]">
          <FilterChip label={p.filters.actor} value={p.filters.anyValue} />
          <FilterChip label={p.filters.action} value={p.filters.actionValue} active />
          <FilterChip label={p.filters.target} value={p.filters.anyValue} />
          <FilterChip label={p.filters.since} value={p.filters.sinceValue} />
          <div className="ml-auto text-muted-foreground">
            {fromApi ? `${entries.length} moderation events` : p.filters.matches}
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <div className="grid grid-cols-[210px_140px_180px_1fr_120px_110px] items-center gap-4 border-b border-border/60 bg-background/40 px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{p.columns.timestamp}</span>
            <span>{p.columns.actor}</span>
            <span>{p.columns.action}</span>
            <span>{p.columns.target}</span>
            <span>{p.columns.ip}</span>
            <span>{p.columns.hash}</span>
          </div>
          <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
            {entries.map((e) => (
              <li
                key={e.hash}
                className="grid grid-cols-[210px_140px_180px_1fr_120px_110px] items-center gap-4 px-5 py-2.5 transition-colors hover:bg-card/60"
              >
                <span className="text-muted-foreground">{e.ts}</span>
                <span className="text-foreground/90">{e.actor}</span>
                <span
                  className={cn(
                    e.tone === "sensitive" && "text-status-failed",
                    e.tone === "write" && "text-status-running",
                    (!e.tone || e.tone === "default") && "text-foreground/90",
                  )}
                >
                  {e.action}
                </span>
                <span className="truncate text-foreground">{e.target}</span>
                <span className="text-muted-foreground">{e.ip}</span>
                <span className="text-signal">{e.hash}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border/60 bg-background/30 px-5 py-2.5 font-mono text-[10.5px] text-muted-foreground">
            <span>
              {fromApi ? `Showing ${entries.length} moderation events` : p.footer.note}
            </span>
            <div className="flex items-center gap-2">
              <button className="rounded-md border border-border/80 bg-card/40 px-2 py-0.5 text-foreground hover:bg-card">
                {p.footer.prev}
              </button>
              <button className="rounded-md border border-border/80 bg-card/40 px-2 py-0.5 text-foreground hover:bg-card">
                {p.footer.next}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  )
}

function FilterChip({
  label,
  value,
  active,
}: {
  label: string
  value: string
  active?: boolean
}) {
  return (
    <button
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px]",
        active
          ? "border-signal/40 bg-signal/10 text-signal"
          : "border-border/80 bg-background/40 text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="uppercase tracking-[0.12em] text-[10px] opacity-70">{label}</span>
      <span>{value}</span>
    </button>
  )
}
