export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("nextapi_api_key") ?? null;
}

export function setApiKey(key: string) {
  localStorage.setItem("nextapi_api_key", key);
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const key = getApiKey();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> ?? {}),
    };
    if (key) headers["Authorization"] = `Bearer ${key}`;
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export const centsToUsd = (c: number | null | undefined): string =>
  c == null ? "" : (c / 100).toFixed(2);
export const usdToCents = (v: string): number | null => {
  if (!v.trim()) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};
