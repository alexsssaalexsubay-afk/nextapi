export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (ADMIN_TOKEN) headers["X-Admin-Token"] = ADMIN_TOKEN;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: ADMIN_TOKEN ? "same-origin" : "include",
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(text || res.statusText, res.status);
  }
  return (await res.json()) as T;
}
