"use client"

import React from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  CheckCircle2,
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

type Invoice = {
  id: string
  period: string
  issued: string
  reserved: string
  billed: string
  refunded: string
  net: string
  status: "paid" | "processing" | "open"
}

type UsagePoint = {
  day: string
  jobs: number
  credits_used: number
}

export default function BillingPage() {
  const t = useTranslations()
  const [balance, setBalance] = React.useState<number | null>(null)
  const [usage, setUsage] = React.useState<UsagePoint[] | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      apiFetch("/v1/balance"),
      apiFetch("/v1/usage?days=30"),
    ]).then(([balRes, usageRes]) => {
      if (balRes.status === "fulfilled" && typeof balRes.value?.balance === "number") {
        setBalance(balRes.value.balance)
      }
      if (usageRes.status === "fulfilled" && Array.isArray(usageRes.value?.data)) {
        setUsage(usageRes.value.data as UsagePoint[])
      }
      setLoading(false)
    })
  }, [])

  React.useEffect(() => { load() }, [load])

  const displayBalance = balance != null
    ? (balance / 100).toFixed(2)
    : loading ? "…" : "—"

  // Compute this-month usage from real data
  const monthBilled = usage
    ? (usage.reduce((s, p) => s + (p.credits_used ?? 0), 0) / 100).toFixed(2)
    : "—"
  const monthJobs = usage
    ? usage.reduce((s, p) => s + (p.jobs ?? 0), 0).toLocaleString()
    : "—"

  // Invoices are not yet backed by a real endpoint — show an empty state.
  const invoices: Invoice[] = []

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
            value={loading && balance == null ? "…" : displayBalance}
            sub={t.billing.balance.availableHint}
            accent
            loading={loading && balance == null}
          />
          <BalanceCard
            label={t.billing.balance.reserved}
            value={monthJobs}
            sub={t.billing.balance.reservedHint ?? "Jobs this period"}
            loading={loading && usage == null}
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

        {/* Payment method + reconciliation */}
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_1fr]">
          <div className="rounded-xl border border-border/80 bg-card/40">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <div>
                <div className="text-[13px] font-medium text-foreground">
                  {t.billing.payment.title}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {t.billing.payment.subtitle}
                </div>
              </div>
              <Button
                variant="outline"
                className="h-7 border-border/80 bg-background/40 text-[11.5px] text-foreground"
              >
                {t.billing.payment.update}
              </Button>
            </div>
            <div className="flex items-center gap-4 px-5 py-5">
              <div className="flex h-10 w-16 items-center justify-center rounded-md border border-border/80 bg-background/60 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Visa
              </div>
              <div className="flex-1">
                <div className="font-mono text-[13px] text-foreground">•••• •••• •••• 4242</div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">
                  09 / 2028 · J. Lin · billing@acme.co
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-sm bg-status-success/12 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-status-success">
                <CheckCircle2 className="size-3" />
                {t.common.verified.toLowerCase()}
              </div>
            </div>
            <div className="border-t border-border/60 px-5 py-3 text-[12px] text-muted-foreground">
              {t.billing.payment.billingDetails} ·{" "}
              <Link href="#" className="text-foreground underline underline-offset-4">
                {t.billing.payment.tax}
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/40">
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
              <LedgerRow
                label={t.billing.reconciliation.reserved}
                value={monthJobs}
                sub={t.billing.balance.reservedHint ?? "Jobs this period"}
              />
              <LedgerRow
                label={t.billing.reconciliation.billed}
                value={monthBilled}
                sub={t.billing.balance.billedMonthHint}
              />
              <LedgerRow
                label={t.billing.reconciliation.refunded}
                value="—"
                sub={t.common.resolved.toLowerCase()}
                tone="success"
              />
            </div>

            <div className="flex items-start gap-2 border-t border-border/60 px-5 py-3 text-[12px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
              <span>
                {t.billing.reconciliation.drift}:{" "}
                <span className="font-mono text-foreground">
                  {usage ? "live" : "—"}
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* Invoices table */}
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[15px] font-medium tracking-tight">{t.billing.invoices.title}</h2>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {t.billing.reconciliation.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/80 bg-card/40 p-0.5">
              {[t.common.all, t.billing.invoices.status.paid, t.billing.invoices.status.open].map(
                (f, i) => (
                  <button
                    key={f}
                    className={
                      "h-6 rounded-sm px-2 text-[11.5px] font-medium " +
                      (i === 0
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {f}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 bg-card/60 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-normal">
                    {t.billing.invoices.columns.number}
                  </th>
                  <th className="px-3 py-2.5 text-left font-normal">
                    {t.billing.invoices.columns.period}
                  </th>
                  <th className="px-3 py-2.5 text-right font-normal">
                    {t.billing.invoices.columns.reserved}
                  </th>
                  <th className="px-3 py-2.5 text-right font-normal">
                    {t.billing.invoices.columns.billed}
                  </th>
                  <th className="px-3 py-2.5 text-right font-normal">
                    {t.billing.invoices.columns.refunded}
                  </th>
                  <th className="px-5 py-2.5 text-right font-normal">
                    {t.billing.invoices.columns.status}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-card/60"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href="#"
                        className="font-mono text-[12.5px] text-foreground hover:text-signal"
                      >
                        {inv.id}
                      </Link>
                      <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                        {inv.issued}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-muted-foreground">{inv.period}</td>
                    <td className="px-3 py-3 text-right font-mono text-[12.5px] text-foreground">
                      {inv.reserved}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[12.5px] text-foreground">
                      {inv.billed}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[12.5px] text-status-success">
                      −{inv.refunded}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <InvoiceStatus status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoices.length === 0 && (
              <div className="px-5 py-12 text-center text-[13px] text-muted-foreground">
                No invoices yet. Invoices will appear here once billing is active.
              </div>
            )}
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

function LedgerRow({
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
        {tone === "success" ? "−" : ""}
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">{sub}</div>
    </div>
  )
}

function InvoiceStatus({ status }: { status: Invoice["status"] }) {
  const t = useTranslations()
  const map = {
    paid: {
      label: t.billing.invoices.status.paid,
      cls: "bg-status-success/12 text-status-success",
    },
    processing: {
      label: t.common.pending,
      cls: "bg-status-running/15 text-status-running",
    },
    open: {
      label: t.billing.invoices.status.open,
      cls: "bg-status-queued/15 text-status-queued",
    },
  } as const
  const s = map[status]
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider " +
        s.cls
      }
    >
      {s.label}
    </span>
  )
}
