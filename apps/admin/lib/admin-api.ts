const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

const SESSION_KEY = "nextapi_admin_operator_token"

declare global {
  interface Window {
    Clerk?: {
      session?: { getToken: (opts?: { skipCache?: boolean }) => Promise<string | null> } | null
    }
  }
}

let cachedToken: string | null = null
let inflightBootstrap: Promise<string | null> | null = null

async function waitForClerk(timeoutMs = 4000): Promise<void> {
  if (typeof window === "undefined") return
  if (window.Clerk?.session !== undefined) return
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (window.Clerk?.session !== undefined) return
    await new Promise((r) => setTimeout(r, 50))
  }
}

async function bootstrap(force = false): Promise<string | null> {
  if (typeof window === "undefined") return null

  if (!force) {
    if (cachedToken) return cachedToken
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) {
      cachedToken = stored
      return stored
    }
  } else {
    cachedToken = null
    sessionStorage.removeItem(SESSION_KEY)
  }

  await waitForClerk()
  const session = window.Clerk?.session
  if (!session) return null

  let token: string | null = null
  try {
    token = await session.getToken()
  } catch {
    return null
  }
  if (!token) return null

  try {
    const res = await fetch(`${API_URL}/v1/me/admin-bootstrap`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const body = await res.json()
    if (typeof body?.admin_token === "string") {
      cachedToken = body.admin_token
      sessionStorage.setItem(SESSION_KEY, body.admin_token)
      return body.admin_token
    }
    return null
  } catch {
    return null
  }
}

async function getAdminToken(force = false): Promise<string | null> {
  if (force) {
    inflightBootstrap = bootstrap(true)
  } else if (!inflightBootstrap) {
    inflightBootstrap = bootstrap(false)
  }
  try {
    return await inflightBootstrap
  } finally {
    inflightBootstrap = null
  }
}

export async function ensureAdminToken(): Promise<string | null> {
  return getAdminToken(false)
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
    const headers: Record<string, string> = {
      ...(token ? { "X-Admin-Token": token } : {}),
    }
    if (options.body) headers["Content-Type"] = "application/json"
    Object.assign(headers, options.headers as Record<string, string> | undefined)
    return fetch(`${API_URL}/v1/internal/admin${normalizedPath}`, { ...options, headers })
  }

  let token = await getAdminToken(false)
  let res = await doFetch(token)

  if (res.status === 401 || res.status === 403) {
    token = await getAdminToken(true)
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
