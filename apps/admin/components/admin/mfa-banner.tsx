"use client"

import { useUser } from "@clerk/nextjs"
import { ShieldAlert, ShieldCheck, X } from "lucide-react"
import { useEffect, useState } from "react"

const DISMISS_KEY = "nextapi.admin.mfaBannerDismissed"
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000

// MfaBanner nags the operator to enable a second factor on their
// Clerk identity. Shown only when the user has zero non-password
// factors (no TOTP, no passkey, no backup codes). Stays dismissed
// for 24h via localStorage so we don't blast the same warning
// every page-nav.
export function MfaBanner() {
  const { isLoaded, isSignedIn, user } = useUser()
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return

    const hasTotp = !!user.totpEnabled
    const hasBackup = !!user.backupCodeEnabled
    // Clerk exposes passkeys as web3Wallets / passkeys in newer SDKs;
    // treat any factor beyond password as "good enough".
    const hasPasskey =
      typeof (user as unknown as { passkeys?: unknown[] }).passkeys !== "undefined" &&
      ((user as unknown as { passkeys: unknown[] }).passkeys?.length ?? 0) > 0

    if (!(hasTotp || hasBackup || hasPasskey)) setHidden(false)
  }, [isLoaded, isSignedIn, user])

  if (hidden) return null

  return (
    <div className="border-b border-yellow-500/40 bg-yellow-500/10 px-4 py-2 font-mono text-[12px] text-yellow-500">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <ShieldAlert className="size-4 shrink-0" />
        <span className="flex-1">
          Your admin account has no second factor. Anyone who steals your password
          can spend credits, pause orgs, or change billing. Enable TOTP / passkey
          in your{" "}
          <a
            href="https://big-vulture-6.clerk.accounts.dev/user"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-yellow-300"
          >
            Clerk account settings
          </a>
          .
        </span>
        <span className="hidden items-center gap-1 text-yellow-500/80 sm:inline-flex">
          <ShieldCheck className="size-3.5" />
          recommended: TOTP + 8 backup codes
        </span>
        <button
          type="button"
          aria-label="Dismiss for 24h"
          className="rounded p-1 hover:bg-yellow-500/20"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()))
            setHidden(true)
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
