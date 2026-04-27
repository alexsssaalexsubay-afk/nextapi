import type { VimaxShot } from "../types"

export type VimaxVideoTaskPayload = {
  model: string
  prompt: string
  image_urls?: string[]
  duration: number
  resolution: string
  ratio: string
  generate_audio: boolean
}

export function shotToCreateVideoTaskPayload(
  shot: VimaxShot,
  options: { model?: string; resolution?: string; ratio?: string; generateAudio?: boolean },
): VimaxVideoTaskPayload {
  const imageUrls = [shot.referenceImageUrl].filter((url): url is string => typeof url === "string" && url.trim() !== "")
  return {
    model: options.model || "seedance-2.0-pro",
    prompt: shot.videoPrompt,
    ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
    duration: shot.duration,
    resolution: options.resolution || "1080p",
    ratio: options.ratio || "9:16",
    generate_audio: options.generateAudio ?? false,
  }
}
