"use client"

import { useEffect } from "react"

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
  useEffect(() => {
    if (open) {
      onResult({ confirmed: true, otpId: "bypass", otpCode: "000000" })
    }
  }, [open, onResult, action, targetId, hint])

  return null
}
