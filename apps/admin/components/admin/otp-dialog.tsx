"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { KeyRound, Loader2, Mail, ShieldCheck, X } from "lucide-react"
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
  const o = t.admin.otpDialog
  const [phase, setPhase] = useState<Phase>("idle")
  const [otpId, setOtpId] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [serverHint, setServerHint] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-send OTP as soon as the dialog opens.
  useEffect(() => {
    if (!open) {
      setPhase("idle")
      setCode("")
      setError(null)
      return
    }
    sendOTP()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Focus the code input once it appears.
  useEffect(() => {
    if (phase === "awaiting") {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [phase])

  async function sendOTP() {
    setPhase("sending")
    setError(null)
    try {
      const resp = await requestOTP(action, targetId, hint)
      setOtpId(resp.otpId)
      setExpiresAt(resp.expiresAt)
      setServerHint(resp.hint)
      setPhase("awaiting")
    } catch (err) {
      setError(err instanceof Error ? err.message : o.sendFailed)
      setPhase("error")
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().replace(/\s/g, "")
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setError(o.invalidCode)
      return
    }
    setPhase("verifying")
    onResult({ confirmed: true, otpId, otpCode: trimmed })
  }

  function handleCancel() {
    onResult({ confirmed: false })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-border/80 bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md border border-status-failed/30 bg-status-failed/10">
              <KeyRound className="size-4 text-status-failed" />
            </div>
            <div>
              <h2 className="text-[13.5px] font-medium tracking-tight">{o.title}</h2>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {action}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={o.cancelAria}
            onClick={handleCancel}
            className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Operation hint */}
          <div className="rounded-md border border-border/60 bg-background/40 px-4 py-3">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.12em] mb-1">
              {o.operation}
            </p>
            <p className="font-mono text-[12.5px] text-foreground">{hint || action}</p>
          </div>

          {/* State feedback */}
          {phase === "sending" && (
            <div className="flex items-center gap-2.5 rounded-md border border-border/60 bg-background/40 px-4 py-3 font-mono text-[12px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {o.sending}
            </div>
          )}

          {phase === "error" && (
            <div className="rounded-md border border-status-failed/30 bg-status-failed/10 px-4 py-3 font-mono text-[12px] text-status-failed">
              {error}
              <button
                type="button"
                onClick={sendOTP}
                className="ml-3 underline underline-offset-2 hover:no-underline"
              >
                {o.retry}
              </button>
            </div>
          )}

          {(phase === "awaiting" || phase === "verifying") && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 px-4 py-3 font-mono text-[12px] text-muted-foreground">
                <Mail className="mt-0.5 size-3.5 shrink-0" />
                <span>{serverHint || o.codeSentFallback}</span>
              </div>

              {expiresAt && (
                <p className="font-mono text-[11px] text-muted-foreground">
                  {o.expiresAtPrefix}{" "}
                  <span className="text-foreground">
                    {new Date(expiresAt).toLocaleTimeString()}
                  </span>
                </p>
              )}

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {o.codeLabel}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value)
                    setError(null)
                  }}
                  placeholder="000000"
                  disabled={phase === "verifying"}
                  className={cn(
                    "w-full rounded-md border bg-background/40 px-3 py-2 font-mono text-[18px] tracking-[0.3em] text-foreground placeholder-muted-foreground/40 focus:outline-none focus:ring-1",
                    error
                      ? "border-status-failed focus:ring-status-failed/40"
                      : "border-border/80 focus:ring-signal/40",
                  )}
                />
                {error && (
                  <p className="mt-1 font-mono text-[11px] text-status-failed">{error}</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={phase === "verifying"}
                  className="flex-1 rounded-md border border-border/80 bg-card/40 py-2 text-[12.5px] text-foreground hover:bg-card disabled:opacity-50"
                >
                  {o.cancel}
                </button>
                <button
                  type="submit"
                  disabled={code.length !== 6 || phase === "verifying"}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-foreground py-2 text-[12.5px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
                >
                  {phase === "verifying" ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      {o.confirming}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-3.5" />
                      {o.confirm}
                    </>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={sendOTP}
                className="w-full font-mono text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {o.resend}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
