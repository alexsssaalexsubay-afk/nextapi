"use client"

import { FormEvent, useEffect, useState } from "react"
import {
  Copy,
  Dices,
  KeyRound,
  Loader2,
  Lock,
  Search,
  UserPlus,
  X,
} from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { OTPDialog, type OTPDialogResult } from "@/components/admin/otp-dialog"
import { adminFetch, adminFetchWithOTP } from "@/lib/admin-api"
import { useTranslations } from "@/lib/i18n/context"
import { generateEmailLocal8, generateStrongPassword10 } from "@/lib/secure-random"

/* ── types ── */
type ApiUser = {
  ID?: string; id?: string
  Email?: string; email?: string
  CreatedAt?: string; created_at?: string
  DeletedAt?: string | null; deleted_at?: string | null
}
function uid(u: ApiUser) { return u.ID ?? u.id ?? "" }
function uemail(u: ApiUser) { return u.Email ?? u.email ?? "" }
function udate(u: ApiUser) { return u.CreatedAt ?? u.created_at ?? "" }

const EMAIL_DOMAIN = "nextapi.top" as const

function fullEmailFromLocal(local: string): string {
  const t = local.trim().toLowerCase()
  return `${t}@${EMAIL_DOMAIN}`
}

function isValidLocalPart(s: string): boolean {
  const t = s.trim()
  if (t.length < 1 || t.length > 64) return false
  if (t.includes("@") || t.includes(" ") || t.includes("..")) return false
  return /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i.test(t)
}

function handoffText(
  template: string,
  email: string,
  password: string,
  signInUrl: string,
) {
  return template.replace("{email}", email).replace("{password}", password).replace("{url}", signInUrl)
}

const DASHBOARD_ORIGIN = (() => {
  const b = (process.env.NEXT_PUBLIC_DASHBOARD_URL || "https://app.nextapi.top").replace(/\/$/, "")
  return b
})()
const DASHBOARD_SIGNIN_URL = `${DASHBOARD_ORIGIN}/sign-in`

/* ── page ── */
export default function UsersPage() {
  const t = useTranslations()
  const u = t.admin.users

  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  /* create user dialog */
  const [showCreate, setShowCreate] = useState(false)
  const [createEmailLocal, setCreateEmailLocal] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createOrgName, setCreateOrgName] = useState("")
  const [createCredits, setCreateCredits] = useState("")
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [handoff, setHandoff] = useState<{ email: string; password: string } | null>(null)
  const [copyFlash, setCopyFlash] = useState(false)

  /* reset password dialog */
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  /* OTP */
  const [otpOpen, setOtpOpen] = useState(false)
  const [otpAction, setOtpAction] = useState("")
  const [otpTarget, setOtpTarget] = useState("")
  const [otpHint, setOtpHint] = useState("")
  const [pendingOp, setPendingOp] = useState<(() => (otp: OTPDialogResult) => Promise<void>) | null>(null)

  /* fetch users + orgs */
  async function load(q = "") {
    setLoading(true)
    setError(null)
    try {
      const uRes = (await adminFetch(`/users${q ? `?q=${encodeURIComponent(q)}` : ""}`)) as { data?: ApiUser[] }
      setUsers(uRes.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const createEmailFull = fullEmailFromLocal(createEmailLocal)

  useEffect(() => {
    if (showCreate) {
      setCreatePassword(generateStrongPassword10())
    }
  }, [showCreate])

  /* create user handler */
  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!isValidLocalPart(createEmailLocal)) {
      setCreateError(u.localInvalid)
      return
    }
    setCreateLoading(true)
    setCreateError(null)
    const emailForCreate = createEmailFull
    const doCreate = (otp: OTPDialogResult): Promise<void> => {
      if (!otp.confirmed) {
        setCreateLoading(false)
        return Promise.resolve()
      }
      return adminFetchWithOTP("/users", otp.otpId, otp.otpCode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailForCreate,
          password: createPassword,
          org_name: createOrgName || undefined,
          initial_credits: createCredits ? Number(createCredits) * 100 : 0,
          note: "created via admin panel",
        }),
      })
        .then(() => {
          setHandoff({ email: emailForCreate, password: createPassword })
          setShowCreate(false)
          setCreateEmailLocal("")
          setCreateOrgName("")
          setCreateCredits("")
          setCreatePassword(generateStrongPassword10())
          load(search)
        })
        .catch((err: unknown) => setCreateError(err instanceof Error ? err.message : "Failed"))
        .finally(() => setCreateLoading(false))
    }
    setOtpAction("user.create")
    setOtpTarget(emailForCreate)
    setOtpHint(`Create account: ${emailForCreate}`)
    setPendingOp(() => doCreate)
    setOtpOpen(true)
  }

  /* reset password handler */
  async function handleReset(e: FormEvent) {
    e.preventDefault()
    if (!resetUserId) return
    setResetLoading(true)
    setResetError(null)
    const doReset = (otp: OTPDialogResult) => {
      if (!otp.confirmed) { setResetLoading(false); return }
      return adminFetchWithOTP(`/users/${resetUserId}/password`, otp.otpId, otp.otpCode, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      })
        .then(() => { setResetUserId(null); setResetPassword("") })
        .catch((err: unknown) => setResetError(err instanceof Error ? err.message : "Failed"))
        .finally(() => setResetLoading(false))
    }
    setOtpAction("account.set_password")
    setOtpTarget(resetUserId)
    setOtpHint(`Reset password for user ${resetUserId}`)
    setPendingOp(() => doReset as any)
    setOtpOpen(true)
  }

  function handleOtpResult(result: OTPDialogResult) {
    setOtpOpen(false)
    if (pendingOp) (pendingOp as any)(result)
    setPendingOp(null)
  }
  const filtered = users.filter((usr) =>
    uemail(usr).toLowerCase().includes(search.toLowerCase()) || uid(usr).includes(search)
  )

  return (
    <AdminShell activeHref="/users" title={u.title} description={u.subtitle}>
      {/* OTP dialog */}
      <OTPDialog open={otpOpen} action={otpAction} targetId={otpTarget} hint={otpHint} onResult={handleOtpResult} />

      <div className="space-y-6 p-6">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder={u.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(search)}
            />
          </div>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowCreate(true)}
          >
            <UserPlus className="h-4 w-4" /> {u.createUser}
          </button>
        </div>

        {/* error / loading */}
        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t.common.loading}</div>}

        {/* user table */}
        {!loading && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">{u.colEmail}</th>
                  <th className="px-4 py-2.5">{u.colId}</th>
                  <th className="px-4 py-2.5">{u.colCreated}</th>
                  <th className="px-4 py-2.5">{u.colStatus}</th>
                  <th className="px-4 py-2.5 text-right">{u.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{u.noResults}</td></tr>
                )}
                {filtered.map((usr) => {
                  const id = uid(usr)
                  const deleted = usr.DeletedAt ?? usr.deleted_at
                  return (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-mono text-xs">{uemail(usr)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{id.slice(0, 12)}…</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(udate(usr)).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5">
                        {deleted
                          ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{u.statusDeleted}</span>
                          : <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">{u.statusActive}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => { setResetUserId(id); setResetPassword(""); setResetError(null) }}
                        >
                          <Lock className="h-3 w-3" /> {u.resetPassword}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* create user dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
            <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">{u.createUser}</h3>
                <button type="button" onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {createError && <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{createError}</div>}
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{u.fieldEmailLocal}</label>
                  <div className="flex min-w-0 items-stretch gap-0 rounded-md border border-input bg-background">
                    <input
                      required
                      className="h-9 min-w-0 flex-1 rounded-l-md border-0 bg-transparent px-3 font-mono text-sm outline-none focus:ring-0"
                      value={createEmailLocal}
                      onChange={(e) => {
                        let v = e.target.value
                        const at = v.indexOf("@")
                        if (at >= 0) v = v.slice(0, at)
                        v = v.replace(/\s/g, "")
                        setCreateEmailLocal(v)
                      }}
                      autoComplete="off"
                      placeholder="e.g. acme-acct1"
                    />
                    <div className="flex shrink-0 items-center border-l border-border bg-muted/40 px-2 font-mono text-sm text-muted-foreground">
                      @{EMAIL_DOMAIN}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">{u.emailDomainFixed}</p>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded border border-border/80 bg-muted/30 px-2 text-[11px] text-foreground hover:bg-muted/50"
                      onClick={() => {
                        setCreateError(null)
                        setCreateEmailLocal(generateEmailLocal8())
                      }}
                    >
                      <Dices className="h-3 w-3" />
                      {u.randomLocal}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">{u.fieldPassword}</label>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded border border-border/80 bg-muted/30 px-2 text-[11px] text-foreground hover:bg-muted/50"
                      onClick={() => {
                        setCreateError(null)
                        setCreatePassword(generateStrongPassword10())
                      }}
                    >
                      <KeyRound className="h-3 w-3" />
                      {u.regenPassword}
                    </button>
                  </div>
                  <input
                    readOnly
                    className="h-9 w-full cursor-default rounded-md border border-input bg-muted/20 px-3 font-mono text-sm outline-none"
                    value={createPassword}
                    title={createPassword}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{u.fieldOrgName}</label>
                  <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder={u.fieldOrgNameHint} value={createOrgName} onChange={(e) => setCreateOrgName(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{u.fieldCredits}</label>
                  <input type="number" min={0} step={1} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="0" value={createCredits} onChange={(e) => setCreateCredits(e.target.value)} />
                  <p className="mt-1 text-[11px] text-muted-foreground">{u.fieldCreditsHint}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">{u.afterCreateHint}</p>
                <button type="submit" disabled={createLoading} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {createLoading && <Loader2 className="h-4 w-4 animate-spin" />} {u.createUser}
                </button>
              </form>
            </div>
          </div>
        )}

        {handoff && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setHandoff(null)}>
            <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-semibold">{u.handoffTitle}</h3>
                <button type="button" onClick={() => setHandoff(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">{u.handoffSub}</p>
              <pre className="mb-4 max-h-48 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-left font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap break-all">
                {handoffText(u.copyHandoff, handoff.email, handoff.password, DASHBOARD_SIGNIN_URL).trimEnd()}
              </pre>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={async () => {
                    const text = handoffText(u.copyHandoff, handoff.email, handoff.password, DASHBOARD_SIGNIN_URL).trimEnd()
                    try {
                      await navigator.clipboard.writeText(text)
                      setCopyFlash(true)
                      setTimeout(() => setCopyFlash(false), 2000)
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                  {copyFlash ? u.copyDone : u.copyAll}
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-muted/30"
                  onClick={() => setHandoff(null)}
                >
                  {u.handoffDone}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* reset password dialog */}
        {resetUserId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setResetUserId(null)}>
            <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">{u.resetPassword}</h3>
                <button onClick={() => setResetUserId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {resetError && <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{resetError}</div>}
              <form onSubmit={handleReset} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{u.fieldNewPassword}</label>
                  <input required minLength={8} type="password" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
                </div>
                <button type="submit" disabled={resetLoading} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {resetLoading && <Loader2 className="h-4 w-4 animate-spin" />} {u.confirmReset}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
