// Admin API client — operator session edition.
//
// Security model (no Clerk Pro MFA required):
//
//   1. On first admin call the browser exchanges its Clerk JWT for a
//      short-lived "ops_…" operator session token via POST /session.
//      The token is stored in sessionStorage (wiped when the tab closes)
//      and sent in X-Op-Session on every subsequent request.
//
//   2. High-risk operations (credits.adjust, org.pause, org.unpause,
//      webhook.replay) require a one-time email OTP: the frontend calls
//      POST /otp/send, shows a 6-digit input, then re-submits the
//      original request with X-Op-OTP: <id>.<code>.
//
//   3. The long-lived ADMIN_TOKEN is never sent to the browser. It is
//      only used by server-side cron jobs and scripts via X-Admin-Token.
//
//   4. Sessions expire hard after 8 h and go idle after 2 h of non-use.
//      On expiry the frontend silently re-bootstraps by exchanging a
//      fresh Clerk JWT.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

const SESSION_KEY = "nextapi.admin.ops_token"
const SESSION_EXPIRES_KEY = "nextapi.admin.ops_expires"
// Leave a 60 s buffer so we re-bootstrap before the server rejects us.
const SESSION_REFRESH_BUFFER_MS = 60_000

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>
      } | null
    }
  }
}

// --- Clerk JWT helpers ---

async function waitForClerk(timeoutMs = 4000): Promise<void> {
  if (typeof window === "undefined") return
  if (window.Clerk?.session !== undefined) return
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (window.Clerk?.session !== undefined) return
    await new Promise((r) => setTimeout(r, 50))
  }
}

async function clerkToken(skipCache = false): Promise<string | null> {
  if (typeof window === "undefined") return null
  await waitForClerk()
  const session = window.Clerk?.session
  if (!session) return null
  try {
    return await session.getToken({ skipCache })
  } catch {
    return null
  }
}

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
}

function clearSession() {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_EXPIRES_KEY)
}

async function createOperatorSession(clerkJwt: string): Promise<string> {
  const res = await fetch(`${API_URL}/v1/internal/admin/session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${clerkJwt}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const code: string = body?.error?.code ?? "session_error"
    const msg: string = body?.error?.message ?? `Session creation failed (${res.status})`
    throw new AdminApiError(msg, res.status, code)
  }
  const data = await res.json()
  storeSession(data.session_token, data.expires_at)
  return data.session_token
}

// getOrCreateSession returns a valid X-Op-Session token, bootstrapping
// a new one via Clerk JWT if needed. Throws AdminApiError on failure.
async function getOrCreateSession(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const stored = getStoredSession()
    if (stored && Date.now() < stored.expires - SESSION_REFRESH_BUFFER_MS) {
      return stored.token
    }
  }
  clearSession()
  const jwt = await clerkToken(true)
  if (!jwt) {
    throw new AdminApiError(
      "Not signed in. Please reload and sign in with your admin account.",
      401,
      "not_signed_in",
    )
  }
  return createOperatorSession(jwt)
}

// --- Public API ---

// ensureAdminToken is kept for back-compat with any page that calls it
// before rendering (it used to verify the operator was logged in).
export async function ensureAdminToken(): Promise<string | null> {
  try {
    return await getOrCreateSession()
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

  let token = await getOrCreateSession()
  let res = await doFetch(token)

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}))
    const code: string = body?.error?.code ?? ""
    if (code === "session_invalid" || code === "session_expired") {
      // Session expired or revoked — re-bootstrap once.
      clearSession()
      token = await getOrCreateSession(true)
      res = await doFetch(token)
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
