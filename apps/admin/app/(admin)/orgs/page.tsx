"use client"

import { useEffect, useState } from "react"
import {
  Loader2,
  Pause,
  Play,
  Search,
} from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { OTPDialog, type OTPDialogResult } from "@/components/admin/otp-dialog"
import { adminFetch, adminFetchWithOTP } from "@/lib/admin-api"
import { useTranslations } from "@/lib/i18n/context"

/* ── types ── */
type ApiOrg = {
  ID?: string; id?: string
  Name?: string; name?: string
  PausedAt?: string | null; paused_at?: string | null
  PauseReason?: string | null; pause_reason?: string | null
  CreditsBalance?: number; credits_balance?: number
  CreatedAt?: string; created_at?: string
}
function oid(o: ApiOrg) { return o.ID ?? o.id ?? "" }
function oname(o: ApiOrg) { return o.Name ?? o.name ?? "" }
function obalance(o: ApiOrg) { return o.CreditsBalance ?? o.credits_balance ?? 0 }
function opaused(o: ApiOrg) { return o.PausedAt ?? o.paused_at ?? null }
function odate(o: ApiOrg) { return o.CreatedAt ?? o.created_at ?? "" }

export default function OrgsPage() {
  const t = useTranslations()
  const o = t.admin.orgs

  const [orgs, setOrgs] = useState<ApiOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  /* OTP state */
  const [otpOpen, setOtpOpen] = useState(false)
  const [otpAction, setOtpAction] = useState("")
  const [otpTarget, setOtpTarget] = useState("")
  const [otpHint, setOtpHint] = useState("")
  const [pendingOp, setPendingOp] = useState<((r: OTPDialogResult) => void) | null>(null)

  /* pause reason dialog */
  const [pauseOrgId, setPauseOrgId] = useState<string | null>(null)
  const [pauseReason, setPauseReason] = useState("")

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = (await adminFetch("/orgs")) as { data?: ApiOrg[] }
      setOrgs(res.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleOtpResult(result: OTPDialogResult) {
    setOtpOpen(false)
    if (pendingOp) pendingOp(result)
    setPendingOp(null)
  }

  function doPause(orgId: string, reason: string) {
    setOtpAction("org.pause"); setOtpTarget(orgId)
    setOtpHint(`Pause org ${orgId}: ${reason}`)
    setPendingOp(() => (r: OTPDialogResult) => {
      if (!r.confirmed) return
      adminFetchWithOTP(`/orgs/${orgId}/pause`, r.otpId, r.otpCode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then(() => { setPauseOrgId(null); load() }).catch(console.error)
    })
    setOtpOpen(true)
  }

  function doUnpause(orgId: string) {
    setOtpAction("org.unpause"); setOtpTarget(orgId)
    setOtpHint(`Unpause org ${orgId}`)
    setPendingOp(() => (r: OTPDialogResult) => {
      if (!r.confirmed) return
      adminFetchWithOTP(`/orgs/${orgId}/unpause`, r.otpId, r.otpCode, {
        method: "POST",
      }).then(() => load()).catch(console.error)
    })
    setOtpOpen(true)
  }

  const filtered = orgs.filter((org) =>
    oname(org).toLowerCase().includes(search.toLowerCase()) || oid(org).includes(search)
  )

  return (
    <AdminShell activeHref="/orgs" title={o.title} description={o.subtitle}>
      <OTPDialog open={otpOpen} action={otpAction} targetId={otpTarget} hint={otpHint} onResult={handleOtpResult} />

      <div className="space-y-6 p-6">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder={o.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t.common.loading}</div>}

        {!loading && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">{o.colName}</th>
                  <th className="px-4 py-2.5">{o.colId}</th>
                  <th className="px-4 py-2.5">{o.colBalance}</th>
                  <th className="px-4 py-2.5">{o.colStatus}</th>
                  <th className="px-4 py-2.5">{o.colCreated}</th>
                  <th className="px-4 py-2.5 text-right">{o.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{o.noResults}</td></tr>
                )}
                {filtered.map((org) => {
                  const id = oid(org)
                  const paused = opaused(org)
                  return (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{oname(org)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{id.slice(0, 12)}…</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{(obalance(org) / 100).toFixed(2)}</td>
                      <td className="px-4 py-2.5">
                        {paused
                          ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">{o.statusPaused}</span>
                          : <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">{o.statusActive}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(odate(org)).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        {paused ? (
                          <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-500/10" onClick={() => doUnpause(id)}>
                            <Play className="h-3 w-3" /> {o.unpause}
                          </button>
                        ) : (
                          <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-500/10" onClick={() => { setPauseOrgId(id); setPauseReason("") }}>
                            <Pause className="h-3 w-3" /> {o.pause}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* pause reason dialog */}
        {pauseOrgId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPauseOrgId(null)}>
            <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-3 text-base font-semibold">{o.pauseReason}</h3>
              <input className="mb-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder={o.pauseReasonHint} value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} />
              <div className="flex gap-2">
                <button className="flex-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted" onClick={() => setPauseOrgId(null)}>{t.common.cancel}</button>
                <button className="flex-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700" onClick={() => doPause(pauseOrgId, pauseReason)}>{o.confirmPause}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
