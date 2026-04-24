"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { OTPDialog, type OTPDialogResult } from "@/components/admin/otp-dialog"
import { adminFetch, adminFetchWithOTP } from "@/lib/admin-api"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type BudgetPayload = {
  budget_credits?: number | null
  credits_used_all_time?: number
  remaining_credits?: number | null
  updated_at?: string
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

export default function PlatformBudgetPage() {
  const t = useTranslations()
  const p = t.admin.budgetPage
  const [data, setData] = useState<BudgetPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [budgetInput, setBudgetInput] = useState("")
  const [clearCap, setClearCap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [otpOpen, setOtpOpen] = useState(false)
  const [pendingSave, setPendingSave] = useState<{ body: { budget_credits: number | null } } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    adminFetch("/operator-budget")
      .then((j: unknown) => {
        const b = j as BudgetPayload
        setData(b)
        if (b.budget_credits != null) setBudgetInput(String(b.budget_credits))
        else setBudgetInput("")
        setClearCap(false)
      })
      .catch((e) => {
        setData(null)
        setErr(e instanceof Error ? e.message : "load failed")
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function onSubmitForm(e: FormEvent) {
    e.preventDefault()
    setSaveErr(null)
    setOk(false)
    if (clearCap) {
      setPendingSave({ body: { budget_credits: null } })
      setOtpOpen(true)
      return
    }
    const n = Math.trunc(Number(budgetInput))
    if (budgetInput.trim() === "" || Number.isNaN(n) || n < 0) {
      setSaveErr(p.errorInvalid)
      return
    }
    setPendingSave({ body: { budget_credits: n } })
    setOtpOpen(true)
  }

  async function onOtpResult(result: OTPDialogResult) {
    setOtpOpen(false)
    if (!result.confirmed || !pendingSave) {
      setPendingSave(null)
      return
    }
    const { body } = pendingSave
    setPendingSave(null)
    setSaving(true)
    try {
      const j = await adminFetchWithOTP(
        "/operator-budget",
        result.otpId,
        result.otpCode,
        { method: "PUT", body: JSON.stringify({ budget_credits: body.budget_credits }) },
      )
      setData(j as BudgetPayload)
      setOk(true)
      if ((j as BudgetPayload).budget_credits != null) {
        setBudgetInput(String((j as BudgetPayload).budget_credits))
      } else {
        setBudgetInput("")
      }
      setClearCap(false)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "save failed")
    } finally {
      setSaving(false)
    }
  }

  const used = data?.credits_used_all_time ?? 0
  const cap = data?.budget_credits
  const rem = data?.remaining_credits
  const ratio =
    cap != null && cap > 0 ? Math.min(100, Math.round((100 * used) / cap)) : cap != null && cap === 0 ? 100 : 0

  return (
    <>
      <OTPDialog
        open={otpOpen}
        action="operator.budget"
        targetId="1"
        hint={
          pendingSave?.body.budget_credits == null
            ? p.otpClear
            : `${p.otpSet} ${formatInt(pendingSave?.body.budget_credits ?? 0)}`
        }
        onResult={onOtpResult}
      />
      <AdminShell
        activeHref="/budget"
        title={p.title}
        description={p.description}
        meta={
          <span>
            {data?.updated_at
              ? `${p.updated} ${new Date(data.updated_at).toLocaleString()}`
              : t.common.loading + "…"}
          </span>
        }
      >
        <div className="max-w-2xl space-y-6 p-6">
          {err && (
            <div className="rounded-lg border border-status-failed/30 bg-status-failed/10 px-4 py-2 font-mono text-[11px] text-status-failed">
              {err}
            </div>
          )}

          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{p.disclaimer}</p>

          <section className="rounded-xl border border-border/80 bg-card/40 p-5">
            <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {p.statusHeading}
            </h2>
            {loading && (
              <p className="font-mono text-[12px] text-muted-foreground">{t.common.loading}…</p>
            )}
            {!loading && data && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {p.used}
                    </div>
                    <div className="mt-1 text-lg font-medium tabular-nums">{formatInt(used)}</div>
                    <p className="text-[10px] text-muted-foreground">{p.usedHint}</p>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {p.budget}
                    </div>
                    <div className="mt-1 text-lg font-medium tabular-nums">
                      {cap == null ? "—" : formatInt(cap)}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{p.budgetHint}</p>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {p.remaining}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-lg font-medium tabular-nums",
                        rem != null && rem === 0 && cap != null && cap > 0 && "text-status-failed",
                      )}
                    >
                      {rem == null && cap == null
                        ? "—"
                        : rem == null
                          ? p.noRemaining
                          : formatInt(rem)}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{p.remainingHint}</p>
                  </div>
                </div>
                {cap != null && cap > 0 && (
                  <div>
                    <div className="mb-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                      <span>{p.barLabel}</span>
                      <span>{ratio}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-signal"
                        style={{ width: `${ratio}%` }}
                        aria-label={p.barLabel}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <form onSubmit={onSubmitForm} className="rounded-xl border border-border/80 bg-card/30 p-5">
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {p.formTitle}
            </h2>
            <p className="mb-4 text-[12px] text-muted-foreground">{p.formSub}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {p.budget}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={budgetInput}
                  onChange={(e) => {
                    setClearCap(false)
                    setBudgetInput(e.target.value)
                  }}
                  disabled={clearCap || saving}
                  placeholder="0"
                  className="rounded-md border border-border/80 bg-background/40 px-2 py-1.5 font-mono text-[13px] text-foreground disabled:opacity-50"
                />
              </label>
              <label className="flex items-center gap-2 pb-1.5 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearCap}
                  onChange={(e) => setClearCap(e.target.checked)}
                  disabled={saving}
                />
                {p.clearCheck}
              </label>
            </div>
            {saveErr && (
              <p className="mt-2 font-mono text-[11px] text-status-failed">{saveErr}</p>
            )}
            {ok && <p className="mt-2 font-mono text-[11px] text-emerald-600">{p.saved}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-9 items-center rounded-md bg-foreground px-4 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {saving ? t.common.loading + "…" : p.save}
              </button>
              <button
                type="button"
                onClick={load}
                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-muted/30"
              >
                {t.common.refresh}
              </button>
            </div>
          </form>
        </div>
      </AdminShell>
    </>
  )
}
