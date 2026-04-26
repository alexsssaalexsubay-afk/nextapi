"use client"

import * as React from "react"
import { CreditCard, Loader2, ShieldCheck } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Button } from "@/components/ui/button"
import { createTopup } from "@/lib/api"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

const AMOUNTS = [
  { cents: 1000, key: "ten" },
  { cents: 5000, key: "fifty" },
  { cents: 10000, key: "hundred" },
] as const

export default function RechargePage() {
  const t = useTranslations()
  const [amountCents, setAmountCents] = React.useState(1000)
  const [paymentType, setPaymentType] = React.useState<"alipay" | "wxpay">("alipay")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const order = await createTopup(amountCents, paymentType)
      window.location.assign(order.payment_url)
    } catch {
      setError(t.billing.recharge.failed)
      setLoading(false)
    }
  }

  return (
    <DashboardShell
      activeHref="/recharge"
      title={t.billing.recharge.title}
      description={t.billing.recharge.subtitle}
    >
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-signal/10 text-signal">
              <CreditCard className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">{t.billing.recharge.chooseAmount}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.billing.recharge.secureHint}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {AMOUNTS.map((item) => {
              const selected = amountCents === item.cents
              return (
                <button
                  key={item.cents}
                  type="button"
                  onClick={() => setAmountCents(item.cents)}
                  className={cn(
                    "rounded-xl border px-4 py-5 text-left transition-colors",
                    selected
                      ? "border-signal bg-signal/10 text-foreground"
                      : "border-border bg-background/40 text-muted-foreground hover:border-signal/50",
                  )}
                >
                  <div className="text-2xl font-semibold">
                    {t.billing.recharge.amounts[item.key]}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(item.cents / 100).toFixed(2)} credits
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-6">
            <div className="mb-2 text-sm font-medium text-foreground">
              {t.billing.recharge.choosePayment}
            </div>
            <div className="flex gap-3">
              {(["alipay", "wxpay"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPaymentType(type)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
                    paymentType === type
                      ? "border-signal bg-signal/10 text-signal"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ShieldCheck className="size-4" />
                  {type === "alipay" ? t.billing.recharge.alipay : t.billing.recharge.wxpay}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button onClick={submit} disabled={loading} className="mt-6 h-11 w-full rounded-full">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.billing.recharge.creating}
              </>
            ) : (
              t.billing.recharge.payNow
            )}
          </Button>
        </div>
      </div>
    </DashboardShell>
  )
}
