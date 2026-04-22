const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

export async function apiFetch(path: string, options: RequestInit = {}) {
  const apiKey = typeof window !== "undefined" ? localStorage.getItem("nextapi_api_key") : null

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `API error: ${res.status}`)
  }

  return res.json()
}
