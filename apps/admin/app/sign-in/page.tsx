"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, ClipboardCheck, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Siren } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/nextapi/logo"
import { loginAdmin, AdminApiError } from "@/lib/admin-api"

export default function AdminSignInPage() {
  const router = useRouter()
  const search = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await loginAdmin(email, password)
      const next = search.get("next")
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/")
      router.refresh()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Admin sign-in failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ops-canvas relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-8">
      <div aria-hidden className="soft-noise pointer-events-none absolute inset-0 opacity-[0.14]" />
      <div aria-hidden className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-[0.11]" />

      <main className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-background/54 shadow-2xl backdrop-blur-2xl lg:grid-cols-[1fr_430px]">
        <section className="hidden border-r border-white/10 p-7 lg:block">
          <div className="flex items-center justify-between">
            <Logo />
            <span className="rounded-full border border-status-failed/35 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-status-failed">
              admin
            </span>
          </div>
          <div className="mt-14 max-w-lg">
            <div className="ops-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-warning" />
              signed operations only
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-foreground">
              Enter the cockpit for incidents, credits, and provider risk.
            </h1>
            <p className="mt-4 text-[14px] leading-7 text-muted-foreground">
              Admin access is intentionally slower and more explicit: allowlist, session audit, and high-risk controls stay visible before any action.
            </p>
          </div>
          <div className="mt-8 grid gap-3">
            {[
              { icon: ShieldCheck, label: "allowlist", value: "ADMIN_EMAILS verified" },
              { icon: ClipboardCheck, label: "audit", value: "every mutation signed" },
              { icon: Siren, label: "risk", value: "attention queue first" },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="ops-risk-panel rounded-xl p-4">
                  <Icon className="size-4 text-status-failed" />
                  <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-1 text-[13px] text-foreground">{item.value}</div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="p-5 sm:p-8">
          <div className="flex items-center justify-between lg:hidden">
            <Logo />
            <span className="rounded-full border border-status-failed/35 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-status-failed">
              admin
            </span>
          </div>
          <div className="mt-8 flex flex-col text-left lg:mt-0">
          <div className="flex size-12 items-center justify-center rounded-xl border border-status-failed/24 bg-status-failed/10 text-status-failed">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-[26px] font-semibold tracking-tight text-foreground">
            Admin sign in
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            Use an ADMIN_EMAILS allowlisted NextAPI account.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background/45 pl-10 pr-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-status-failed focus-visible:ring-2 focus-visible:ring-status-failed/25"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </Label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background/45 pl-10 pr-10 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-status-failed focus-visible:ring-2 focus-visible:ring-status-failed/25"
                placeholder="••••••••"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="ops-interactive absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-card/60 hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ops-interactive mt-2 inline-flex h-11 w-full items-center justify-center rounded-full bg-status-failed text-[14px] font-medium text-white shadow-[0_18px_45px_-26px] shadow-status-failed hover:translate-y-[-1px] hover:bg-status-failed/90"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </button>
        </form>
        </section>
      </main>
    </div>
  )
}
