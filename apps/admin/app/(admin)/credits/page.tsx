"use client"

import { FormEvent, useEffect, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { adminFetch } from "@/lib/admin-api"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

type Entry = {
  ID?: number; id?: number
  OrgID?: string; org_id?: string
  DeltaCredits?: number; delta_credits?: number
  DeltaCents?: number; delta_cents?: number
  Reason?: string; reason?: string
  Note?: string; note?: string
  CreatedAt?: string; created_at?: string
}

function eid(e: Entry) { return e.ID ?? e.id ?? 0 }
function eorg(e: Entry) { return e.OrgID ?? e.org_id ?? "" }
function edelta(e: Entry) { return e.DeltaCredits ?? e.delta_credits ?? 0 }
function ereason(e: Entry) { return e.Reason ?? e.reason ?? "" }
function enote(e: Entry) { return e.Note ?? e.note ?? "" }
function ets(e: Entry) { return e.CreatedAt ?? e.created_at ?? "" }

type ApiOrg = {
  ID?: string
  id?: string
  Name?: string
  name?: string
  PausedAt?: string | null
  paused_at?: string | null
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

export default function CreditsPage() {
  const t = useTranslations()
  const p = t.admin.creditsPage
  const [orgs, setOrgs] = useState<ApiOrg[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState("")
  const [deltaInput, setDeltaInput] = useState("")
  const [adjustNote, setAdjustNote] = useState("")
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [adjustOk, setAdjustOk] = useState(false)
  const [ledger, setLedger] = useState<Entry[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(true)

  function loadLedger() {
    setLedgerLoading(true)
    adminFetch("/billing/ledger?limit=200")
      .then((res: any) => {
        if (Array.isArray(res?.data)) setLedger(res.data)
      })
      .catch(() => {})
      .finally(() => setLedgerLoading(false))
  }

  useEffect(() => { loadLedger() }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setOrgsLoading(true)
      setOrgsError(null)
      try {
        const res = (await adminFetch("/orgs")) as { data?: ApiOrg[] }
        const list = res.data ?? []
        if (!cancelled) {
          setOrgs(list)
          const first = list[0]
          const fid = first?.ID ?? first?.id ?? ""
          if (fid) setSelectedOrgId(fid)
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setOrgsError(e instanceof Error ? e.message : "Failed to load organizations")
        }
      } finally {
        if (!cancelled) setOrgsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // TODO: align with backend response — tile metrics from billing aggregates when available.
  const orgCount = orgs.length
  const pausedCount = orgs.filter((o) => (o.PausedAt ?? o.paused_at) != null).length
  const issuedCredits = ledger.reduce((sum, entry) => {
    const delta = edelta(entry)
    return delta > 0 ? sum + delta : sum
  }, 0)
  const reclaimedCredits = ledger.reduce((sum, entry) => {
    const delta = edelta(entry)
    return delta < 0 ? sum + Math.abs(delta) : sum
  }, 0)

  async function onSubmitAdjust(e: FormEvent) {
    e.preventDefault()
    setAdjustError(null)
    setAdjustOk(false)
    const delta = Math.trunc(Number(deltaInput))
    if (!selectedOrgId || Number.isNaN(delta) || delta === 0) {
      setAdjustError("Select an organization and enter a non-zero integer delta.")
      return
    }
    setAdjustSubmitting(true)
    try {
      await adminFetch("/credits/adjust", {
        method: "POST",
        body: JSON.stringify({ org_id: selectedOrgId, delta, note: adjustNote.trim() || undefined }),
      })
      setAdjustOk(true)
      setDeltaInput("")
      setAdjustNote("")
      loadLedger()
    } catch (err) {
      console.error(err)
      setAdjustError(err instanceof Error ? err.message : "Adjustment failed")
    } finally {
      setAdjustSubmitting(false)
    }
  }

  return (
    <AdminShell
      activeHref="/credits"
      title={p.title}
      description={p.description}
      meta={
        <>
          <span>{p.meta.ledgerHeight}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.lastEntry}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.dualApproval}</span>
          {orgsLoading && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground">{t.common.loading}…</span>
            </>
          )}
          {!orgsLoading && orgCount > 0 && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground">
                {orgCount} org{orgCount === 1 ? "" : "s"}
              </span>
            </>
          )}
        </>
      }
      actions={
        <>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12px] text-foreground hover:bg-card">
            {p.exportCsv}
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground/90">
            {p.newAdjustment}
          </button>
        </>
      }
    >
      <div className="space-y-6 p-6">
        {orgsError && (
          <div className="rounded-lg border border-status-failed/30 bg-status-failed/10 px-4 py-2 font-mono text-[11px] text-status-failed">
            {orgsError}
          </div>
        )}
        {/* Summary tiles */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label={p.tiles.issuedLabel} value={`+${formatInt(issuedCredits)}`} sub={p.tiles.issuedSub} tone="success" />
          <Tile label={p.tiles.reclaimedLabel} value={`-${formatInt(reclaimedCredits)}`} sub={p.tiles.reclaimedSub} tone="failed" />
          <Tile
            label={p.tiles.pendingLabel}
            value={orgCount > 0 ? formatInt(pausedCount) : "2"}
            sub={p.tiles.pendingSub}
            tone="warn"
          />
          <Tile label={p.tiles.driftLabel} value="—" sub={p.tiles.driftSub} tone="default" />
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <form onSubmit={onSubmitAdjust} className="flex flex-col gap-3 font-mono text-[11.5px]">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  org
                </span>
                <select
                  value={selectedOrgId}
                  onChange={(ev) => setSelectedOrgId(ev.target.value)}
                  className="rounded-md border border-border/80 bg-background/40 px-2 py-1.5 text-foreground"
                  disabled={orgsLoading || orgCount === 0}
                >
                  {orgs.map((o) => {
                    const id = o.ID ?? o.id ?? ""
                    const name = o.Name ?? o.name ?? id.slice(0, 8)
                    return (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    )
                  })}
                </select>
              </label>
              <label className="flex w-28 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  delta
                </span>
                <input
                  type="number"
                  step={1}
                  value={deltaInput}
                  onChange={(ev) => setDeltaInput(ev.target.value)}
                  className="rounded-md border border-border/80 bg-background/40 px-2 py-1.5 text-foreground"
                  placeholder="±credits"
                />
              </label>
              <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  note
                </span>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(ev) => setAdjustNote(ev.target.value)}
                  className="rounded-md border border-border/80 bg-background/40 px-2 py-1.5 text-foreground"
                  placeholder="optional"
                />
              </label>
              <button
                type="submit"
                disabled={adjustSubmitting || orgCount === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {adjustSubmitting ? t.common.loading : p.newAdjustment}
              </button>
            </div>
            {adjustError && (
              <p className="text-[11px] text-status-failed">{adjustError}</p>
            )}
            {adjustOk && (
              <p className="text-[11px] text-status-success">Adjustment applied.</p>
            )}
          </form>
        </section>

        {/* Ledger */}
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <div className="grid grid-cols-[180px_160px_100px_1fr_120px] items-center gap-4 border-b border-border/60 bg-background/40 px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{p.columns.timestamp}</span>
            <span>{p.columns.organization}</span>
            <span>{p.columns.delta}</span>
            <span>{p.columns.reason}</span>
            <span>{p.columns.ref}</span>
          </div>
          <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
            {ledgerLoading ? (
              <li className="px-5 py-8 text-center text-muted-foreground">Loading…</li>
            ) : ledger.length === 0 ? (
              <li className="px-5 py-8 text-center text-muted-foreground">No ledger entries yet</li>
            ) : ledger.map((e) => {
              const delta = edelta(e)
              const positive = delta > 0
              return (
                <li
                  key={eid(e)}
                  className="grid grid-cols-[180px_160px_100px_1fr_120px] items-center gap-4 px-5 py-2.5 transition-colors hover:bg-card/60"
                >
                  <span className="text-muted-foreground">{new Date(ets(e)).toLocaleString()}</span>
                  <span className="truncate text-foreground">{eorg(e)}</span>
                  <span className={positive ? "text-status-success" : "text-status-failed"}>
                    {positive ? "+" : ""}{delta.toFixed(2)}
                  </span>
                  <div className="min-w-0 text-muted-foreground">
                    <span className="truncate text-foreground/90">{ereason(e)}</span>
                    {enote(e) && <span className="ml-2 text-muted-foreground/70">· {enote(e)}</span>}
                  </div>
                  <span className="text-signal">#{eid(e)}</span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <h2 className="text-[13.5px] font-medium tracking-tight">{p.reconciliation.title}</h2>
          <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-muted-foreground">
            {p.reconciliation.description}
          </p>
          <div className="mt-4 rounded-md border border-border/60 bg-background/40 px-4 py-8 text-center font-mono text-[11.5px] text-muted-foreground">
            Real-time reconciliation metrics are not wired yet. Ledger entries above are live.
          </div>
        </section>
      </div>
    </AdminShell>
  )
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: "success" | "failed" | "warn" | "default"
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-[22px] font-medium tracking-tight",
          tone === "success" && "text-status-success",
          tone === "failed" && "text-status-failed",
          tone === "warn" && "text-status-running",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{sub}</div>
    </div>
  )
}

