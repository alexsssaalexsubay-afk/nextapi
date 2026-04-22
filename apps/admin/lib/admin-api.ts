const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

export async function adminFetch(path: string, options: RequestInit = {}) {
  const adminToken = typeof window !== "undefined" ? localStorage.getItem("nextapi_admin_token") : null

  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  const headers: Record<string, string> = {
    ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
  }
  if (options.body) {
    headers["Content-Type"] = "application/json"
  }
  Object.assign(headers, options.headers)

  const res = await fetch(`${API_URL}/v1/internal/admin${normalizedPath}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Admin API error: ${res.status}`)
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {}
  }

  return res.json()
}
