"use client"

import React from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  CreditCard,
  Download,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/i18n/context"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { apiFetch } from "@/lib/api"

type UsagePoint = {
  day: string
  jobs: number
  credits_used: number
}

type LedgerEntry = {
  ID?: number
  id?: number
  DeltaCredits?: number
  delta_credits?: number
  DeltaCents?: number | null
  delta_cents?: number | null
  Reason?: string
  reason?: string
  Note?: string
  note?: string
  CreatedAt?: string
  created_at?: string
}

function eid(e: LedgerEntry) {
  return e.ID ?? e.id ?? 0
}

// Ledger values are stored in cents (1 credit = 100 cents). Older rows may
// have only delta_credits filled with the cents value, so fall back.
function edeltaCents(e: LedgerEntry) {
  return e.DeltaCents ?? e.delta_cents ?? e.DeltaCredits ?? e.delta_credits ?? 0
}

function ereason(e: LedgerEntry) {
  return e.Reason ?? e.reason ?? ""
}

function enote(e: LedgerEntry) {
  return e.Note ?? e.note ?? ""
}

function ets(e: LedgerEntry) {
  return e.CreatedAt ?? e.created_at ?? ""
}

const CREDITS_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCredits(cents: number): string {
  return CREDITS_FMT.format(cents / 100)
}

export default function BillingPage() {
  const t = useTranslations()
  const [balanceCents, setBalanceCents] = React.useState<number | null>(null)
  const [usage, setUsage] = React.useState<UsagePoint[] | null>(null)
  const [ledger, setLedger] = React.useState<LedgerEntry[] | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      apiFetch("/v1/auth/me"),
      apiFetch("/v1/me/billing/usage?days=30"),
      apiFetch("/v1/me/billing/ledger?limit=200"),
    ]).then(([meRes, usageRes, ledgerRes]) => {
      if (meRes.status === "fulfilled" && typeof meRes.value?.balance === "number") {
        setBalanceCents(meRes.value.balance)
      }
      if (usageRes.status === "fulfilled" && Array.isArray(usageRes.value?.data)) {
        setUsage(usageRes.value.data as UsagePoint[])
      } else {
        setUsage([])
      }
      if (ledgerRes.status === "fulfilled" && Array.isArray(ledgerRes.value?.data)) {
        setLedger(ledgerRes.value.data as LedgerEntry[])
      } else {
        setLedger([])
      }
      setLoading(false)
    })
  }, [])

  React.useEffect(() => { load() }, [load])

  const displayBalance = balanceCents != null
    ? formatCredits(balanceCents)
    : loading ? "…" : "—"

  const monthBilled = usage
    ? formatCredits(usage.reduce((s, p) => s + (p.credits_used ?? 0), 0))
    : "—"
  const monthJobs = usage
    ? usage.reduce((s, p) => s + (p.jobs ?? 0), 0).toLocaleString()
    : "—"

  // Compute totals from the ledger so the page is self-consistent even if the
  // /usage endpoint is degraded.
  const totalRefundedCents = ledger
    ? ledger
        .filter((e) => ereason(e) === "refund" || ereason(e) === "reconciliation")
        .reduce((s, e) => s + Math.max(0, edeltaCents(e)), 0)
    : 0

  return (
    <DashboardShell
      activeHref="/billing"
      title={t.billing.title}
      description={t.billing.subtitle}
      actions={
        <>
          <Button
            variant="outline"
            className="h-8 gap-1.5 border-border/80 bg-card/40 text-[12.5px]"
          >
            <Download className="size-3.5" />
            {t.usage.exportCsv}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    disabled
                    className="h-8 cursor-not-allowed gap-1.5 bg-foreground/30 text-[12.5px] text-background opacity-50"
                  >
                    {t.common.topUp}
                    <ArrowUpRight className="size-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-[12px]">
                {t.billing.preview.topUpDisabledTooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            asChild
            variant="outline"
            className="h-8 gap-1.5 border-signal/40 bg-signal/5 text-[12.5px] text-signal hover:bg-signal/10"
          >
            <Link href="https://nextapi.top/enterprise" target="_blank" rel="noopener noreferrer">
              {t.billing.preview.contactSales}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-[1180px] px-6 py-8">
        {/* Top-up coming soon banner */}
        <div className="mb-6 flex flex-col gap-2 rounded-xl border border-signal/30 bg-signal/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 size-4 shrink-0 text-signal" />
            <div className="text-[13px] text-foreground">
              <span className="font-medium">{t.billing.preview.comingSoonEn}</span>
              <span className="ml-2 text-muted-foreground">{t.billing.preview.comingSoonZh}</span>
            </div>
          </div>
          <Link
            href="https://nextapi.top/enterprise"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-signal/40 bg-background px-3 py-1.5 text-[12.5px] font-medium text-signal transition-colors hover:bg-signal/10"
          >
            {t.billing.preview.contactSales}
            <ArrowUpRight className="size-3" />
          </Link>
        </div>

        {/* Current balance */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <BalanceCard
            label={t.billing.balance.available}
            value={displayBalance}
            sub={t.billing.balance.availableHint}
            accent
            loading={loading && balanceCents == null}
          />
          <BalanceCard
            label={t.billing.reconciliation.refunded}
            value={ledger ? formatCredits(totalRefundedCents) : "—"}
            sub={t.billing.balance.reservedHint ?? ""}
            loading={loading && ledger == null}
          />
          <BalanceCard
            label={t.billing.balance.billedMonth}
            value={monthBilled}
            sub={t.billing.balance.billedMonthHint}
            loading={loading && usage == null}
          />
          <BalanceCard
            label={t.billing.balance.autoTopUp}
            value={t.common.disabled}
            sub={t.billing.balance.autoTopUpHint}
            muted
          />
        </section>

        {/* Reconciliation tile (kept lean — no fake Visa card) */}
        <section className="mt-6 rounded-xl border border-border/80 bg-card/40">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div>
              <div className="text-[13px] font-medium text-foreground">
                {t.billing.reconciliation.title}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {t.billing.reconciliation.subtitle}
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {loading
                ? <Loader2 className="size-3 animate-spin" />
                : <RefreshCw className="size-3" />
              }
              {t.common.refresh.toLowerCase()}
            </button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/60">
            <LedgerStat
              label={t.billing.reconciliation.reserved}
              value={monthJobs}
              sub={t.billing.balance.reservedHint ?? ""}
            />
            <LedgerStat
              label={t.billing.reconciliation.billed}
              value={monthBilled}
              sub={t.billing.balance.billedMonthHint}
            />
            <LedgerStat
              label={t.billing.reconciliation.refunded}
              value={ledger ? formatCredits(totalRefundedCents) : "—"}
              sub={t.common.resolved.toLowerCase()}
              tone="success"
            />
          </div>
        </section>

        {/* Live ledger — every credit movement (admin adjustments included) */}
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[15px] font-medium tracking-tight">
                {t.billing.ledger.title}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {t.billing.ledger.subtitle}
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
            <div className="grid grid-cols-[160px_120px_140px_1fr_70px] items-center gap-4 border-b border-border/60 bg-card/60 px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>{t.billing.ledger.columns.time}</span>
              <span className="text-right">{t.billing.ledger.columns.delta}</span>
              <span>{t.billing.ledger.columns.reason}</span>
              <span>{t.billing.ledger.columns.note}</span>
              <span className="text-right">{t.billing.ledger.columns.ref}</span>
            </div>
            <ul className="divide-y divide-border/40">
              {ledger == null ? (
                <li className="px-5 py-10 text-center text-[12.5px] text-muted-foreground">
                  {t.billing.ledger.loading}
                </li>
              ) : ledger.length === 0 ? (
                <li className="px-5 py-10 text-center text-[12.5px] text-muted-foreground">
                  {t.billing.ledger.empty}
                </li>
              ) : ledger.map((e) => {
                const cents = edeltaCents(e)
                const positive = cents > 0
                const reasonRaw = ereason(e)
                const reasons = t.billing.ledger.reasons as Record<string, string>
                const reasonLabel = reasons[reasonRaw] || reasonRaw
                return (
                  <li
                    key={eid(e)}
                    className="grid grid-cols-[160px_120px_140px_1fr_70px] items-center gap-4 px-5 py-2.5 transition-colors hover:bg-card/60"
                  >
                    <span className="font-mono text-[11.5px] text-muted-foreground">
                      {new Date(ets(e)).toLocaleString()}
                    </span>
                    <span
                      className={
                        "text-right font-mono text-[12.5px] " +
                        (positive ? "text-status-success" : "text-status-failed")
                      }
                    >
                      {positive ? "+" : "−"}
                      {formatCredits(Math.abs(cents))}
                    </span>
                    <span className="text-[12px] text-foreground/90">{reasonLabel}</span>
                    <span className="truncate text-[12px] text-muted-foreground">
                      {enote(e) || "—"}
                    </span>
                    <span className="text-right font-mono text-[11px] text-signal">
                      #{eid(e)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* Footer note */}
        <section className="mt-8 flex items-start gap-3 rounded-xl border border-border/60 bg-card/30 px-5 py-4">
          <CreditCard className="mt-0.5 size-4 shrink-0 text-signal" />
          <div className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t.billing.reconciliation.subtitle} ·{" "}
            <Link href="https://nextapi.top/docs" className="text-foreground underline underline-offset-4">
              {t.common.readDocs}
            </Link>
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}

function BalanceCard({
  label,
  value,
  sub,
  accent,
  muted,
  loading,
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
  muted?: boolean
  loading?: boolean
}) {
  return (
    <div
      className={
        "rounded-xl border bg-card/40 px-5 py-4 " +
        (accent ? "border-signal/30" : "border-border/80")
      }
    >
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-2 font-mono text-[26px] leading-none tracking-tight " +
          (muted ? "text-muted-foreground" : "text-foreground") +
          (loading ? " animate-pulse" : "")
        }
      >
        {value}
      </div>
      <div className="mt-2 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  )
}

function LedgerStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: "success"
}) {
  return (
    <div className="px-5 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-1.5 font-mono text-[20px] leading-none " +
          (tone === "success" ? "text-status-success" : "text-foreground")
        }
      >
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">{sub}</div>
    </div>
  )
}
