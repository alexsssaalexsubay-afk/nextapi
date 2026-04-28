"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react"
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-180px] size-[620px] -translate-x-1/2 rounded-full bg-gradient-to-b from-indigo-500/15 to-transparent blur-3xl"
      />
      <div className="relative z-10 w-full max-w-[420px] rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="mt-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-signal/20 bg-signal/10 text-signal">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-[22px] font-medium tracking-tight text-foreground">
            Admin sign in
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Use an ADMIN_EMAILS allowlisted NextAPI account.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[12px] text-destructive"
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
                className="h-10 w-full rounded-lg border border-input bg-input/30 pl-10 pr-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
                className="h-10 w-full rounded-lg border border-input bg-input/30 pl-10 pr-10 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                placeholder="••••••••"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 transition-all hover:shadow-[0_0_40px_-4px] hover:shadow-indigo-500/60 disabled:opacity-70"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
