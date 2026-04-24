"use client"

import { useCallback, useEffect, useState } from "react"
import {
  CheckCircle2,
  Loader2,
  Mail,
  Search,
} from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { OTPDialog, type OTPDialogResult } from "@/components/admin/otp-dialog"
import { adminFetch, adminFetchWithOTP } from "@/lib/admin-api"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type Lead = {
  ID?: number; id?: number
  Name?: string; name?: string
  Company?: string; company?: string
  Email?: string; email?: string
  Volume?: string; volume?: string
  Latency?: string; latency?: string
  Message?: string; message?: string
  Source?: string; source?: string
  ContactedAt?: string | null; contacted_at?: string | null
  CreatedAt?: string; created_at?: string
}

function lid(l: Lead) { return l.ID ?? l.id ?? 0 }
function lname(l: Lead) { return l.Name ?? l.name ?? "" }
function lcompany(l: Lead) { return l.Company ?? l.company ?? "" }
function lemail(l: Lead) { return l.Email ?? l.email ?? "" }
function lvolume(l: Lead) { return l.Volume ?? l.volume ?? "" }
function llatency(l: Lead) { return l.Latency ?? l.latency ?? "" }
function lmessage(l: Lead) { return l.Message ?? l.message ?? "" }
function lsource(l: Lead) { return l.Source ?? l.source ?? "site" }
function lcontacted(l: Lead) { return l.ContactedAt ?? l.contacted_at ?? null }
function lcreated(l: Lead) { return l.CreatedAt ?? l.created_at ?? "" }

function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60_000) return "just now"
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

export default function LeadsPage() {
  const t = useTranslations()
  const p = t.admin.leadsPage
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [marking, setMarking] = useState<number | null>(null)

  const load = useCallback((q?: string) => {
    setLoading(true)
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    adminFetch(`/leads${qs}`)
      .then((res: any) => {
        if (Array.isArray(res?.data)) setLeads(res.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    load(query)
  }

  async function markContacted(id: number) {
    setMarking(id)
    try {
      await adminFetch(`/leads/${id}/contacted`, { method: "PATCH" })
      load(query)
    } catch { /* ignore */ }
    finally { setMarking(null) }
  }

  const pending = leads.filter((l) => !lcontacted(l))
  const contacted = leads.filter((l) => !!lcontacted(l))

  return (
    <AdminShell
      activeHref="/leads"
      title={p.title}
      description={p.description}
      meta={
        <>
          <span>{pending.length} {p.meta.pending}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{leads.length} {p.meta.total}</span>
        </>
      }
    >
      <div className="flex flex-col gap-6 p-6">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={p.searchPlaceholder}
              className="h-9 w-full rounded-md border border-border/80 bg-background pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-signal/50 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md border border-border/80 bg-card/40 px-4 text-[12.5px] font-medium text-foreground hover:bg-card/60"
          >
            {p.search}
          </button>
        </form>

        {loading && leads.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
          </div>
        ) : leads.length === 0 ? (
          <div className="py-20 text-center text-[13px] text-muted-foreground">
            {p.empty}
          </div>
        ) : (
          <>
            {/* Pending leads */}
            {pending.length > 0 && (
              <section className="rounded-xl border border-border/80 bg-card/40">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                  <h2 className="text-[13px] font-medium tracking-tight">
                    {p.pendingTitle} · {pending.length}
                  </h2>
                </div>
                <ul className="divide-y divide-border/60">
                  {pending.map((l) => (
                    <LeadRow
                      key={lid(l)}
                      lead={l}
                      marking={marking === lid(l)}
                      onMark={() => markContacted(lid(l))}
                      labels={p}
                    />
                  ))}
                </ul>
              </section>
            )}

            {/* Contacted leads */}
            {contacted.length > 0 && (
              <section className="rounded-xl border border-border/80 bg-card/40">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                  <h2 className="text-[13px] font-medium tracking-tight text-muted-foreground">
                    {p.contactedTitle} · {contacted.length}
                  </h2>
                </div>
                <ul className="divide-y divide-border/60">
                  {contacted.map((l) => (
                    <LeadRow
                      key={lid(l)}
                      lead={l}
                      contacted
                      labels={p}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AdminShell>
  )
}

function LeadRow({
  lead,
  contacted,
  marking,
  onMark,
  labels,
}: {
  lead: Lead
  contacted?: boolean
  marking?: boolean
  onMark?: () => void
  labels: any
}) {
  return (
    <li className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-card/60">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground truncate">
            {lname(lead)}
          </span>
          <span className="text-[12px] text-muted-foreground">·</span>
          <span className="text-[12px] text-foreground/80 truncate">
            {lcompany(lead)}
          </span>
          <span className="rounded-sm bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {lsource(lead)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 font-mono text-[11.5px] text-muted-foreground">
          <a href={`mailto:${lemail(lead)}`} className="flex items-center gap-1 text-signal hover:underline">
            <Mail className="size-3" />
            {lemail(lead)}
          </a>
          {lvolume(lead) && <span>vol: {lvolume(lead)}</span>}
          {llatency(lead) && <span>lat: {llatency(lead)}</span>}
        </div>
        {lmessage(lead) && (
          <p className="mt-1.5 text-[12px] text-muted-foreground/80 line-clamp-2">
            {lmessage(lead)}
          </p>
        )}
        <div className="mt-1.5 font-mono text-[10.5px] text-muted-foreground/60">
          {relTime(lcreated(lead))}
          {contacted && lcontacted(lead) && (
            <span className="ml-2 text-status-success">
              ✓ {labels.contactedAt} {relTime(lcontacted(lead)!)}
            </span>
          )}
        </div>
      </div>
      {!contacted && onMark && (
        <button
          onClick={onMark}
          disabled={marking}
          className={cn(
            "mt-1 flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11.5px] font-medium transition-colors",
            "border-border/80 bg-card/40 text-foreground hover:bg-status-success/10 hover:border-status-success/40 hover:text-status-success",
            marking && "opacity-50",
          )}
        >
          {marking ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
          {labels.markContacted}
        </button>
      )}
    </li>
  )
}
