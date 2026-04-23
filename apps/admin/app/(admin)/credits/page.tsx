"use client"

import { FormEvent, useEffect, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { OTPDialog, type OTPDialogResult } from "@/components/admin/otp-dialog"
import { adminFetch, adminFetchWithOTP } from "@/lib/admin-api"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

type Entry = {
  ts: string
  org: string
  delta: string
  reason: string
  by: string
  ref: string
  approved?: string
}

const MOCK_LEDGER: Entry[] = [
  {
    ts: "2026-04-22 21:48:12",
    org: "linear-media",
    delta: "+120.00",
    reason: "Goodwill · Seedance outage 2026-04-21",
    by: "m. winters",
    ref: "adj_7Hc9Xk",
    approved: "j. li",
  },
  {
    ts: "2026-04-22 19:12:03",
    org: "acme-prod",
    delta: "−8.42",
    reason: "Correction · double-billed batch 4F2a",
    by: "s. patel",
    ref: "adj_4Pt8Yz",
    approved: "m. winters",
  },
  {
    ts: "2026-04-22 17:04:41",
    org: "parallax-studio",
    delta: "+500.00",
    reason: "Annual top-up · invoice #2026-0412",
    by: "billing-bot",
    ref: "adj_2Lm0Fh",
  },
  {
    ts: "2026-04-22 14:22:08",
    org: "northwind-labs",
    delta: "+14.00",
    reason: "Refund · webhook retry storm",
    by: "j. li",
    ref: "adj_9Qr5Dp",
    approved: "m. winters",
  },
  {
    ts: "2026-04-22 11:51:19",
    org: "stellar-post",
    delta: "−4.20",
    reason: "Chargeback reversal",
    by: "billing-bot",
    ref: "adj_6Xw3Nv",
  },
  {
    ts: "2026-04-21 23:02:55",
    org: "acme-prod",
    delta: "+80.00",
    reason: "SLA credit · p99 breach 2026-04-20",
    by: "m. winters",
    ref: "adj_3Bf0Kq",
    approved: "j. li",
  },
]

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
  const [otpOpen, setOtpOpen] = useState(false)
  const [pendingAdjust, setPendingAdjust] = useState<{ orgId: string; delta: number; note: string } | null>(null)

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

  async function onSubmitAdjust(e: FormEvent) {
    e.preventDefault()
    setAdjustError(null)
    setAdjustOk(false)
    const delta = Math.trunc(Number(deltaInput))
    if (!selectedOrgId || Number.isNaN(delta) || delta === 0) {
      setAdjustError("Select an organization and enter a non-zero integer delta.")
      return
    }
    // Stage the adjustment and open the OTP dialog for email confirmation.
    const orgName = orgs.find((o) => (o.ID ?? o.id) === selectedOrgId)
    const name = orgName?.Name ?? orgName?.name ?? selectedOrgId.slice(0, 8)
    setPendingAdjust({ orgId: selectedOrgId, delta, note: adjustNote.trim() })
    setOtpOpen(true)
  }

  async function onOTPResult(result: OTPDialogResult) {
    setOtpOpen(false)
    if (!result.confirmed || !pendingAdjust) {
      setPendingAdjust(null)
      return
    }
    const { orgId, delta, note } = pendingAdjust
    setPendingAdjust(null)
    setAdjustSubmitting(true)
    try {
      await adminFetchWithOTP(
        "/credits/adjust",
        result.otpId,
        result.otpCode,
        {
          method: "POST",
          body: JSON.stringify({ org_id: orgId, delta, note: note || undefined }),
        },
      )
      setAdjustOk(true)
      setDeltaInput("")
      setAdjustNote("")
    } catch (err) {
      console.error(err)
      setAdjustError(err instanceof Error ? err.message : "Adjustment failed")
    } finally {
      setAdjustSubmitting(false)
    }
  }

  const pendingOrg = orgs.find((o) => (o.ID ?? o.id) === (pendingAdjust?.orgId ?? selectedOrgId))
  const pendingOrgName = pendingOrg?.Name ?? pendingOrg?.name ?? selectedOrgId.slice(0, 8)

  return (
    <>
      <OTPDialog
        open={otpOpen}
        action="credits.adjust"
        targetId={pendingAdjust?.orgId ?? ""}
        hint={`${pendingAdjust && pendingAdjust.delta > 0 ? "+" : ""}${pendingAdjust?.delta ?? 0} credits on ${pendingOrgName}${pendingAdjust?.note ? ` · ${pendingAdjust.note}` : ""}`}
        onResult={onOTPResult}
      />
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
          <Tile label={p.tiles.issuedLabel} value="+8,420" sub={p.tiles.issuedSub} tone="success" />
          <Tile label={p.tiles.reclaimedLabel} value="−214.80" sub={p.tiles.reclaimedSub} tone="failed" />
          <Tile
            label={p.tiles.pendingLabel}
            value={orgCount > 0 ? formatInt(pausedCount) : "2"}
            sub={p.tiles.pendingSub}
            tone="warn"
          />
          <Tile label={p.tiles.driftLabel} value="0.03%" sub={p.tiles.driftSub} tone="default" />
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

        {/* Ledger — currently a static demo until /v1/internal/admin/credits/ledger ships. */}
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-2 font-mono text-[11px] text-yellow-500">
          PREVIEW · the rows below are sample data. Real adjustments are recorded in
          <code className="mx-1">credits_ledger</code> and visible in <code>/audit</code> after every change.
        </div>
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <div className="grid grid-cols-[180px_160px_100px_1fr_120px_120px] items-center gap-4 border-b border-border/60 bg-background/40 px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{p.columns.timestamp}</span>
            <span>{p.columns.organization}</span>
            <span>{p.columns.delta}</span>
            <span>{p.columns.reason}</span>
            <span>{p.columns.operator}</span>
            <span>{p.columns.ref}</span>
          </div>
          <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
            {MOCK_LEDGER.map((e) => {
              const positive = e.delta.startsWith("+")
              return (
                <li
                  key={e.ref}
                  className="grid grid-cols-[180px_160px_100px_1fr_120px_120px] items-center gap-4 px-5 py-2.5 transition-colors hover:bg-card/60"
                >
                  <span className="text-muted-foreground">{e.ts}</span>
                  <span className="truncate text-foreground">{e.org}</span>
                  <span className={positive ? "text-status-success" : "text-status-failed"}>
                    {e.delta}
                  </span>
                  <div className="min-w-0 text-muted-foreground">
                    <span className="truncate text-foreground/90">{e.reason}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-foreground/90">{e.by}</span>
                    {e.approved && (
                      <span className="text-[10px] text-muted-foreground">
                        {p.approvedLabel} · {e.approved}
                      </span>
                    )}
                  </div>
                  <span className="text-signal">{e.ref}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Reconciliation hint */}
        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <h2 className="text-[13.5px] font-medium tracking-tight">{p.reconciliation.title}</h2>
          <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-muted-foreground">
            {p.reconciliation.description}
          </p>
          <div className="mt-4 overflow-hidden rounded-md border border-border/60">
            <div className="grid grid-cols-5 bg-background/40 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>{p.reconciliation.columns.window}</span>
              <span>{p.reconciliation.columns.reserved}</span>
              <span>{p.reconciliation.columns.billed}</span>
              <span>{p.reconciliation.columns.refunded}</span>
              <span>{p.reconciliation.columns.drift}</span>
            </div>
            <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
              <ReconRow window={p.reconciliation.windowLabels.h1} reserved="142.00" billed="118.40" refunded="23.60" drift="0.00%" />
              <ReconRow window={p.reconciliation.windowLabels.h24} reserved="4,120.00" billed="3,412.84" refunded="706.20" drift="0.02%" />
              <ReconRow window={p.reconciliation.windowLabels.d7} reserved="28,904.00" billed="24,018.42" refunded="4,884.12" drift="0.01%" />
              <ReconRow window={p.reconciliation.windowLabels.d30} reserved="112,842.00" billed="93,718.02" refunded="19,089.40" drift="0.03%" />
            </ul>
          </div>
        </section>
      </div>
    </AdminShell>
    </>
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

function ReconRow({
  window: w,
  reserved,
  billed,
  refunded,
  drift,
}: {
  window: string
  reserved: string
  billed: string
  refunded: string
  drift: string
}) {
  return (
    <li className="grid grid-cols-5 items-center px-4 py-2.5">
      <span className="text-muted-foreground">{w}</span>
      <span className="text-foreground/90">{reserved}</span>
      <span className="text-foreground">{billed}</span>
      <span className="text-status-success">{refunded}</span>
      <span className="text-foreground/90">{drift}</span>
    </li>
  )
}
