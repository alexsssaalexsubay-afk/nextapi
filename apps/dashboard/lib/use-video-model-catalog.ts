"use client"

import { useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/lib/api"

export type VideoModelCatalogState = "loading" | "ready" | "unavailable"

export type VideoModelCapability = {
  id: string
  minDurationSeconds: number
  maxDurationSeconds: number
  supportedResolutions: string[]
  supportedAspectRatios: string[]
  supportsAudioOutput: boolean
  priceCentsPerSecond: Record<string, number>
}

type BackendModel = {
  id?: string
  min_duration_seconds?: number
  max_duration_seconds?: number
  supported_resolutions?: string[]
  supported_aspect_ratios?: string[]
  supports_audio_output?: boolean
  price_cents_per_second?: Record<string, number>
}

function normalizeModel(item: BackendModel): VideoModelCapability | null {
  if (!item.id) return null
  return {
    id: item.id,
    minDurationSeconds: Number(item.min_duration_seconds ?? 4),
    maxDurationSeconds: Number(item.max_duration_seconds ?? 15),
    supportedResolutions: Array.isArray(item.supported_resolutions) ? item.supported_resolutions : [],
    supportedAspectRatios: Array.isArray(item.supported_aspect_ratios) ? item.supported_aspect_ratios : [],
    supportsAudioOutput: Boolean(item.supports_audio_output),
    priceCentsPerSecond: item.price_cents_per_second ?? {},
  }
}

export function useVideoModelCatalog() {
  const [state, setState] = useState<VideoModelCatalogState>("loading")
  const [models, setModels] = useState<VideoModelCapability[]>([])

  useEffect(() => {
    let cancelled = false
    apiFetch("/v1/models")
      .then((res) => {
        if (cancelled) return
        const items = (Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []) as BackendModel[]
        const normalized = items.map(normalizeModel).filter((item): item is VideoModelCapability => item !== null)
        setModels(normalized)
        setState(normalized.length > 0 ? "ready" : "unavailable")
      })
      .catch(() => {
        if (cancelled) return
        setModels([])
        setState("unavailable")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const modelIds = useMemo(() => models.map((model) => model.id), [models])
  const modelById = useMemo(() => {
    const out: Record<string, VideoModelCapability> = {}
    for (const model of models) out[model.id] = model
    return out
  }, [models])
  const priceCentsPerSecond = useMemo(() => {
    const out: Record<string, number> = {}
    for (const model of models) {
      const p = model.priceCentsPerSecond["1080p"] ?? Object.values(model.priceCentsPerSecond)[0]
      if (typeof p === "number") out[model.id] = p
    }
    return out
  }, [models])

  return { state, models, modelIds, modelById, priceCentsPerSecond }
}
