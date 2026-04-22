const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

export async function apiFetch(path: string, options: RequestInit = {}) {
  const apiKey = typeof window !== "undefined" ? localStorage.getItem("nextapi_api_key") : null

  const headers: Record<string, string> = {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
  if (options.body) {
    headers["Content-Type"] = "application/json"
  }
  Object.assign(headers, options.headers)

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `API error: ${res.status}`)
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {}
  }

  return res.json()
}
