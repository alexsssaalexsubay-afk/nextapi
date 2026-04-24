// Admin API client — first-party operator session edition.
//
// Admin login exchanges an ADMIN_EMAILS allowlisted email/password for a
// short-lived "ops_…" operator session. High-risk operations still require
// a one-time email OTP through X-Op-OTP.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

const SESSION_KEY = "nextapi.admin.ops_token"
const SESSION_EXPIRES_KEY = "nextapi.admin.ops_expires"
const SESSION_COOKIE = "nextapi_admin_ops_token"
// Leave a 60 s buffer so we re-bootstrap before the server rejects us.
const SESSION_REFRESH_BUFFER_MS = 60_000

// --- Operator session management ---

function getStoredSession(): { token: string; expires: number } | null {
  if (typeof window === "undefined") return null
  const token = sessionStorage.getItem(SESSION_KEY)
  const expires = Number(sessionStorage.getItem(SESSION_EXPIRES_KEY) ?? 0)
  if (!token || !expires) return null
  return { token, expires }
}

function storeSession(token: string, expiresAt: string) {
  if (typeof window === "undefined") return
  const expiresMs = new Date(expiresAt).getTime()
  sessionStorage.setItem(SESSION_KEY, token)
  sessionStorage.setItem(SESSION_EXPIRES_KEY, String(expiresMs))
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 8}; SameSite=Lax; Secure`
}

function clearSession() {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_EXPIRES_KEY)
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax; Secure`
}

export async function loginAdmin(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/internal/admin/session/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const code: string = body?.error?.code ?? "session_error"
    const msg: string = body?.error?.message ?? `Session creation failed (${res.status})`
    throw new AdminApiError(msg, res.status, code)
  }
  const data = await res.json()
  storeSession(data.session_token, data.expires_at)
}

// getSession returns a valid X-Op-Session token. It does not auto-login;
// operators must visit /sign-in when the session expires.
async function getSession(): Promise<string> {
  const stored = getStoredSession()
  if (stored && Date.now() < stored.expires - SESSION_REFRESH_BUFFER_MS) {
    return stored.token
  }
  clearSession()
  throw new AdminApiError("Admin session expired. Please sign in again.", 401, "not_signed_in")
}

// --- Public API ---

// ensureAdminToken is kept for back-compat with any page that calls it
// before rendering (it used to verify the operator was logged in).
export async function ensureAdminToken(): Promise<string | null> {
  try {
    return await getSession()
  } catch {
    return null
  }
}

export class AdminApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function adminFetch(path: string, options: RequestInit = {}) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  const doFetch = async (token: string) => {
    const headers: Record<string, string> = {
      [opSessionHeader]: token,
    }
    if (options.body) headers["Content-Type"] = "application/json"
    Object.assign(headers, options.headers as Record<string, string> | undefined)
    return fetch(`${API_URL}/v1/internal/admin${normalizedPath}`, {
      ...options,
      headers,
    })
  }

  let token = await getSession()
  let res = await doFetch(token)

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}))
    const code: string = body?.error?.code ?? ""
    if (code === "session_invalid" || code === "session_expired") {
      clearSession()
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const code: string | undefined = body?.error?.code
    const message: string = body?.error?.message || `Admin API error: ${res.status}`
    throw new AdminApiError(message, res.status, code)
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") return {}
  return res.json()
}

// adminFetchWithOTP is like adminFetch but includes an X-Op-OTP header.
// Used after the operator completes the OTP challenge dialog.
export async function adminFetchWithOTP(
  path: string,
  otpId: string,
  otpCode: string,
  options: RequestInit = {},
) {
  return adminFetch(path, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      [opOTPHeader]: `${otpId}.${otpCode}`,
    },
  })
}

// requestOTP asks the server to send a 6-digit code to the operator's email.
export async function requestOTP(
  action: string,
  targetId: string,
  hint: string,
): Promise<{ otpId: string; hint: string; expiresAt: string }> {
  const data = (await adminFetch("/otp/send", {
    method: "POST",
    body: JSON.stringify({ action, target_id: targetId, hint }),
  })) as { otp_id: string; hint: string; expires_at: string }
  return { otpId: data.otp_id, hint: data.hint, expiresAt: data.expires_at }
}

// Header name constants mirrored from Go (keep in sync with admin_session.go).
const opSessionHeader = "X-Op-Session"
const opOTPHeader = "X-Op-OTP"
