const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

const SESSION_KEY = "nextapi_dashboard_session_key"
const ACCOUNT_SESSION_KEY = "nextapi_account_session_token"
const ACCOUNT_SESSION_COOKIE = "nextapi_account_session"

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null
}

function writeSessionCookie(token: string) {
  if (typeof document === "undefined") return
  document.cookie = `${ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`
}

function clearSessionCookie() {
  if (typeof document === "undefined") return
  document.cookie = `${ACCOUNT_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax; Secure`
}

let cachedKey: string | null = null
let inflightBootstrap: Promise<string | null> | null = null

export function getAccountSessionToken(): string | null {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem(ACCOUNT_SESSION_KEY) || readCookie(ACCOUNT_SESSION_COOKIE)
}

async function bootstrap(force = false): Promise<string | null> {
  if (typeof window === "undefined") return null

  if (!force) {
    if (cachedKey) return cachedKey
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) {
      cachedKey = stored
      return stored
    }
  } else {
    cachedKey = null
    sessionStorage.removeItem(SESSION_KEY)
  }

  const token = getAccountSessionToken()
  if (!token) return null

  try {
    const res = await fetch(`${API_URL}/v1/auth/session?mint_key=1`, {
      method: "GET",
      headers: { "X-NextAPI-Session": token },
    })
    if (!res.ok) return null
    const body = await res.json()
    if (typeof body?.dashboard_key?.secret === "string") {
      cachedKey = body.dashboard_key.secret
      sessionStorage.setItem(SESSION_KEY, body.dashboard_key.secret)
      return body.dashboard_key.secret
    }
    return null
  } catch {
    return null
  }
}

async function getDashboardKey(force = false): Promise<string | null> {
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

/**
 * Returns the freshly-bootstrapped dashboard session key, minted from the
 * current first-party account session. Use this from React components if you need to
 * surface "your session is connected" UI.
 */
export async function ensureDashboardKey(): Promise<string | null> {
  return getDashboardKey(false)
}

/** Force a re-bootstrap (e.g. after the user clicks "rotate session"). */
export async function refreshDashboardKey(): Promise<string | null> {
  return getDashboardKey(true)
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type LoginResponse = {
  session_token?: string
  dashboard_key?: { secret?: string }
}

export async function loginWithPassword(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(
      body?.error?.message || "Email or password is incorrect",
      res.status,
      body?.error?.code,
    )
  }
  if (typeof body?.session_token === "string") {
    sessionStorage.setItem(ACCOUNT_SESSION_KEY, body.session_token)
    writeSessionCookie(body.session_token)
  }
  if (typeof body?.dashboard_key?.secret === "string") {
    cachedKey = body.dashboard_key.secret
    sessionStorage.setItem(SESSION_KEY, body.dashboard_key.secret)
  }
  return body
}

export async function logoutAccount(): Promise<void> {
  const token = getAccountSessionToken()
  if (token) {
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: "POST",
      headers: { "X-NextAPI-Session": token },
    }).catch(() => undefined)
  }
  cachedKey = null
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(ACCOUNT_SESSION_KEY)
  clearSessionCookie()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function isFormDataBody(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const doFetch = async (key: string | null) => {
    const isMultipart = isFormDataBody(options.body)
    const headers: Record<string, string> = {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    }
    if (options.body && !isMultipart) {
      headers["Content-Type"] = "application/json"
    }
    Object.assign(headers, options.headers as Record<string, string> | undefined)
    if (isMultipart) {
      delete headers["Content-Type"]
      delete headers["content-type"]
    }
    return fetch(`${API_URL}${path}`, { ...options, headers })
  }

  let key = await getDashboardKey(false)
  let res = await doFetch(key)

  // Stale or revoked session key → force re-bootstrap once and retry.
  if (res.status === 401) {
    key = await getDashboardKey(true)
    if (key) res = await doFetch(key)
  }

  // 5xx network errors: retry once with exponential backoff (500ms, 1000ms).
  // Do not retry mutating FormData (e.g. R2 upload) to avoid duplicate objects.
  if (res.status >= 500 && !isFormDataBody(options.body)) {
    await sleep(500)
    res = await doFetch(key)
    if (res.status >= 500) {
      await sleep(1000)
      res = await doFetch(key)
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const code: string | undefined = body?.error?.code
    const message: string = body?.error?.message || `API error: ${res.status}`

    // idempotent_request_in_progress: wait 500ms and retry up to 3 times.
    if (code === "idempotent_request_in_progress") {
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(500 * (attempt + 1))
        const retryRes = await doFetch(key)
        if (retryRes.ok) {
          if (retryRes.status === 204 || retryRes.headers.get("content-length") === "0") return {}
          return retryRes.json()
        }
        const retryBody = await retryRes.json().catch(() => ({}))
        if (retryBody?.error?.code !== "idempotent_request_in_progress") {
          const rc: string | undefined = retryBody?.error?.code
          const rm: string = retryBody?.error?.message || `API error: ${retryRes.status}`
          throw new ApiError(rm, retryRes.status, rc)
        }
      }
    }

    throw new ApiError(message, res.status, code)
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") return {}
  return res.json()
}
