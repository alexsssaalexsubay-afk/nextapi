"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { adminFetch } from "@/lib/admin-api"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

type AuditRow = {
  ID?: number
  id?: number
  ActorEmail?: string
  actor_email?: string
  ActorIP?: string
  actor_ip?: string
  ActorKind?: string
  actor_kind?: string
  Action?: string
  action?: string
  TargetType?: string
  target_type?: string
  TargetID?: string
  target_id?: string
  Payload?: Record<string, unknown> | string
  payload?: Record<string, unknown> | string
  CreatedAt?: string
  created_at?: string
}

type Entry = {
  id: number
  ts: string
  actor: string
  action: string
  target: string
  ip: string
  hash: string
  tone: "default" | "write" | "sensitive"
}

const SENSITIVE = new Set([
  "credits.adjust",
  "org.pause",
  "key.rotate",
  "key.revoke",
])
const WRITE = new Set([
  "job.cancel",
  "moderation.update",
  "throughput.update",
  "webhook.replay",
  "attention.resolve",
  "flag.toggle",
])

function pad(n: number) {
  return String(n).padStart(2, "0")
}
function formatTs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function rowToEntry(row: AuditRow): Entry {
  const id = row.ID ?? row.id ?? 0
  const action = row.Action ?? row.action ?? ""
  const targetType = row.TargetType ?? row.target_type ?? ""
  const targetID = row.TargetID ?? row.target_id ?? ""
  const target =
    targetType && targetID
      ? `${targetType}:${targetID}`
      : targetType || targetID || "—"
  const tone: Entry["tone"] = SENSITIVE.has(action)
    ? "sensitive"
    : WRITE.has(action)
      ? "write"
      : "default"
  return {
    id,
    ts: formatTs(row.CreatedAt ?? row.created_at ?? ""),
    actor: row.ActorEmail ?? row.actor_email ?? "—",
    action,
    target,
    ip: row.ActorIP ?? row.actor_ip ?? "—",
    hash: `#${id}`,
    tone,
  }
}

export default function AuditLogPage() {
  const t = useTranslations()
  const p = t.admin.auditPage
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const params = new URLSearchParams()
        params.set("limit", "200")
        if (actionFilter) params.set("action", actionFilter)
        const res = (await adminFetch(`/audit?${params.toString()}`)) as {
          data?: AuditRow[]
        }
        if (cancelled) return
        setEntries((res.data ?? []).map(rowToEntry))
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : "Failed to load audit log")
        setEntries([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [actionFilter])

  const counts = useMemo(() => {
    const c = { sensitive: 0, write: 0, total: entries.length }
    for (const e of entries) {
      if (e.tone === "sensitive") c.sensitive++
      else if (e.tone === "write") c.write++
    }
    return c
  }, [entries])

  return (
    <AdminShell
      activeHref="/audit"
      title={p.title}
      description={p.description}
      meta={
        <>
          <span>
            {counts.total} entries · {counts.sensitive} sensitive · {counts.write} write
          </span>
          {loading && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground">{t.common.loading}…</span>
            </>
          )}
        </>
      }
      actions={
        <button
          onClick={() => setActionFilter("")}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12px] text-foreground hover:bg-card"
        >
          {p.filters.anyValue}
        </button>
      }
    >
      <div className="space-y-6 p-6">
        {loadError && (
          <div className="rounded-lg border border-status-failed/30 bg-status-failed/10 px-4 py-2 font-mono text-[11px] text-status-failed">
            {loadError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card/40 p-3 font-mono text-[11.5px]">
          <FilterChip
            label={p.filters.action}
            value={actionFilter || p.filters.anyValue}
            active={!!actionFilter}
            onClick={() => setActionFilter("")}
          />
          {[
            "credits.adjust",
            "org.pause",
            "job.cancel",
            "webhook.replay",
          ].map((a) => (
            <FilterChip
              key={a}
              label="quick"
              value={a}
              active={actionFilter === a}
              onClick={() => setActionFilter(a)}
            />
          ))}
          <div className="ml-auto text-muted-foreground">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <div className="grid grid-cols-[180px_220px_180px_1fr_140px_80px] items-center gap-4 border-b border-border/60 bg-background/40 px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{p.columns.timestamp}</span>
            <span>{p.columns.actor}</span>
            <span>{p.columns.action}</span>
            <span>{p.columns.target}</span>
            <span>{p.columns.ip}</span>
            <span>{p.columns.hash}</span>
          </div>
          {entries.length === 0 && !loading ? (
            <div className="px-5 py-12 text-center font-mono text-[11.5px] text-muted-foreground">
              {actionFilter
                ? `No audit entries match action "${actionFilter}".`
                : "No admin actions recorded yet. State-changing operations (pause / adjust / cancel) will appear here."}
            </div>
          ) : (
            <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="grid grid-cols-[180px_220px_180px_1fr_140px_80px] items-center gap-4 px-5 py-2.5 transition-colors hover:bg-card/60"
                >
                  <span className="text-muted-foreground">{e.ts}</span>
                  <span className="truncate text-foreground/90">{e.actor}</span>
                  <span
                    className={cn(
                      e.tone === "sensitive" && "text-status-failed",
                      e.tone === "write" && "text-status-running",
                      e.tone === "default" && "text-foreground/90",
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
          )}
        </section>
      </div>
    </AdminShell>
  )
}

function FilterChip({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
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
