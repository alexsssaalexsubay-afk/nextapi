"use client"

import { ShieldCheck } from "lucide-react"
import { useState } from "react"

// SecurityBanner shows a one-time informational note about the admin
// security model. Dismissed permanently per session once read.
//
// Note: Clerk Pro MFA (TOTP / passkey) is NOT available on the Hobby plan.
// Admin security is provided by:
//   1. Short-lived DB-backed operator sessions (8 h hard TTL, 2 h idle timeout)
//   2. Email OTP for high-risk operations (credits.adjust, org pause/unpause,
//      webhook.replay) — requires RESEND_API_KEY
//   3. ADMIN_EMAILS allowlist enforced server-side on every request
export function MfaBanner() {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return true
    return sessionStorage.getItem("nextapi.admin.securityBannerDismissed") === "1"
  })

  if (hidden) return null

  return (
    <div className="border-b border-signal/30 bg-signal/5 px-4 py-2 font-mono text-[12px] text-signal">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <ShieldCheck className="size-4 shrink-0" />
        <span className="flex-1">
          Admin access uses short-lived operator sessions (8 h) plus email OTP for
          high-risk operations. No Clerk Pro MFA required.
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded px-2 py-0.5 text-[11px] hover:bg-signal/10"
          onClick={() => {
            if (typeof window !== "undefined") {
              sessionStorage.setItem("nextapi.admin.securityBannerDismissed", "1")
            }
            setHidden(true)
          }}
        >
          got it
        </button>
      </div>
    </div>
  )
}
