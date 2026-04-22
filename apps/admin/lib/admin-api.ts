const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

export async function adminFetch(path: string, options: RequestInit = {}) {
  const adminToken = typeof window !== "undefined" ? localStorage.getItem("nextapi_admin_token") : null

  const res = await fetch(`${API_URL}/v1/internal/admin${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Admin API error: ${res.status}`)
  }

  return res.json()
}
