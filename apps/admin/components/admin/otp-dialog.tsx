"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { AlertTriangle, Loader2, ShieldCheck, X } from "lucide-react"
import { requestOTP } from "@/lib/admin-api"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

export type OTPDialogResult =
  | { confirmed: true; otpId: string; otpCode: string }
  | { confirmed: false }

interface OTPDialogProps {
  /** Whether the dialog is visible */
  open: boolean
  /** Clerk action identifier, e.g. "credits.adjust" */
  action: string
  /** The org / job / entity being acted upon */
  targetId: string
  /** Human-readable description: "+100 credits on acme-prod" */
  hint: string
  /** Called when the operator confirms or cancels */
  onResult: (result: OTPDialogResult) => void
}

type Phase = "idle" | "sending" | "awaiting" | "verifying" | "error"

export function OTPDialog({ open, action, targetId, hint, onResult }: OTPDialogProps) {
  const t = useTranslations()
  const copy = t.admin.otpDialog
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [otpId, setOtpId] = useState("")
  const [code, setCode] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [deliveryHint, setDeliveryHint] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [bypass, setBypass] = useState(false)

  useEffect(() => {
    if (!open) {
      setPhase("idle")
      setOtpId("")
      setCode("")
      setExpiresAt("")
      setDeliveryHint("")
      setError(null)
      setBypass(false)
      return
    }

    let cancelled = false
    setPhase("sending")
    setCode("")
    setError(null)
    setBypass(false)
    requestOTP(action, targetId, hint)
      .then((result) => {
        if (cancelled) return
        setOtpId(result.otpId)
        setDeliveryHint(result.hint || copy.codeSentFallback)
        setExpiresAt(result.expiresAt)
        setBypass(Boolean(result.bypass))
        setCode(result.bypassCode ?? "")
        setPhase("awaiting")
        window.setTimeout(() => inputRef.current?.focus(), 40)
      })
      .catch((err) => {
        if (cancelled) return
        setPhase("error")
        setError(err instanceof Error ? err.message : copy.sendFailed)
      })

    return () => {
      cancelled = true
    }
  }, [open, action, targetId, hint, copy.codeSentFallback, copy.sendFailed])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onResult({ confirmed: false })
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onResult])

  if (!open) return null

  const sanitizedCode = code.replace(/\D/g, "").slice(0, 6)
  const isVerifying = phase === "verifying"
  const canConfirm = phase === "awaiting" && otpId && sanitizedCode.length === 6

  function resend() {
    setPhase("sending")
    setError(null)
    setOtpId("")
    setCode("")
    setBypass(false)
    requestOTP(action, targetId, hint)
      .then((result) => {
        setOtpId(result.otpId)
        setDeliveryHint(result.hint || copy.codeSentFallback)
        setExpiresAt(result.expiresAt)
        setBypass(Boolean(result.bypass))
        setCode(result.bypassCode ?? "")
        setPhase("awaiting")
        window.setTimeout(() => inputRef.current?.focus(), 40)
      })
      .catch((err) => {
        setPhase("error")
        setError(err instanceof Error ? err.message : copy.sendFailed)
      })
  }

  function confirm(event: FormEvent) {
    event.preventDefault()
    if (!canConfirm) {
      setError(copy.invalidCode)
      return
    }
    setPhase("verifying")
    onResult({ confirmed: true, otpId, otpCode: sanitizedCode })
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" role="presentation">
      <form
        onSubmit={confirm}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-otp-title"
        aria-describedby="admin-otp-description"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-signal/25 bg-signal/10 text-signal">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="admin-otp-title" className="text-base font-medium text-foreground">{copy.title}</h2>
              <p id="admin-otp-description" className="mt-1 text-sm leading-relaxed text-muted-foreground">{hint}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label={copy.cancelAria}
            onClick={() => onResult({ confirmed: false })}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-background/60 p-3 text-xs">
          <div className="font-mono uppercase tracking-[0.14em] text-muted-foreground">{copy.operation}</div>
          <div className="mt-1 break-all text-sm text-foreground">{action}</div>
          {targetId ? <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{targetId}</div> : null}
        </div>

        {phase === "sending" ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-signal/20 bg-signal/10 px-3 py-3 text-sm text-signal">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {copy.sending}
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="mt-4 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-medium">{copy.sendFailed}</div>
                {error ? <div className="mt-1 text-xs leading-relaxed">{error}</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        {phase === "awaiting" || phase === "verifying" ? (
          <div className="mt-4 space-y-3">
            <div className={cn("rounded-xl border p-3 text-xs", bypass ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200" : "border-border bg-background/60 text-muted-foreground")}>
              <div>{deliveryHint || copy.codeSentFallback}</div>
              {expiresAt ? (
                <div className="mt-1 font-mono text-[11px]">
                  {copy.expiresAtPrefix}: {new Date(expiresAt).toLocaleString()}
                </div>
              ) : null}
            </div>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              {copy.codeLabel}
              <input
                ref={inputRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={sanitizedCode}
                disabled={isVerifying}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  if (error) setError(null)
                }}
                className="h-11 rounded-xl border border-border bg-background px-3 text-center font-mono text-lg tracking-[0.45em] text-foreground outline-none transition focus:border-signal/55 focus:ring-2 focus:ring-signal/20 disabled:opacity-60"
              />
            </label>
          </div>
        ) : null}

        {error && phase !== "error" ? (
          <p className="mt-3 text-xs text-destructive">{error}</p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={resend}
            disabled={phase === "sending" || isVerifying}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "error" ? copy.retry : copy.resend}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onResult({ confirmed: false })}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition hover:text-foreground"
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              disabled={!canConfirm || isVerifying}
              className="inline-flex h-9 min-w-28 items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {copy.confirming}
                </>
              ) : copy.confirm}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
