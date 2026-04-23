// Admin API client.
//
// We do NOT exchange the Clerk JWT for a long-lived ADMIN_TOKEN any more.
// The backend's AdminMiddleware verifies the Clerk JWT inline (JWKS +
// ADMIN_EMAILS allowlist), so the only credential the browser ever holds
// is its own short-lived (≤60s) Clerk session token. That means:
//
//   - nothing sensitive lives in localStorage / sessionStorage
//   - token theft via XSS expires when the Clerk session refreshes
//   - revoking an operator = remove from ADMIN_EMAILS, no token rotation
//   - audit_log.actor_email comes from the verified JWT, not a header
//     the operator can lie about

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>
      } | null
    }
  }
}

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

// Back-compat shim — pages used to call ensureAdminToken() to verify
// the operator was logged in before rendering. Same intent, but we
// just confirm a Clerk JWT is currently obtainable.
export async function ensureAdminToken(): Promise<string | null> {
  return clerkToken(false)
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

  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {}
    if (options.body) headers["Content-Type"] = "application/json"
    Object.assign(headers, options.headers as Record<string, string> | undefined)
    return fetch(`${API_URL}/v1/internal/admin${normalizedPath}`, {
      ...options,
      headers,
    })
  }

  let token = await clerkToken(false)
  let res = await doFetch(token)

  // 401 / 403 typically means the Clerk session refreshed under us.
  // Retry once with a fresh token before giving up.
  if (res.status === 401 || res.status === 403) {
    token = await clerkToken(true)
    if (token) res = await doFetch(token)
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
