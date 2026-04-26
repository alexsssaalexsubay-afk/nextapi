export type MarketingSlot = {
  slot_key: string
  media_kind: "image" | "video" | string
  url: string
  poster_url?: string
  updated_at: string
}

export async function fetchMarketingSlots(): Promise<MarketingSlot[]> {
  const base = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"
  try {
    const res = await fetch(`${base}/v1/public/marketing/slots`, {
      method: "GET",
      cache: "no-store",
    })
    if (!res.ok) return []
    const body = (await res.json()) as { slots?: MarketingSlot[] }
    return Array.isArray(body.slots) ? body.slots : []
  } catch {
    return []
  }
}
