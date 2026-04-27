import { generateDirectorShotImages } from "@/lib/workflows"
import type { VimaxPlan, VimaxRuntimeOptions } from "../types"

export async function generateImageWithProvider(plan: VimaxPlan, options: VimaxRuntimeOptions): Promise<VimaxPlan> {
  const result = await generateDirectorShotImages({
    imageProviderId: options.imageProviderId,
    resolution: options.resolution === "1080p" ? "1024x1024" : options.resolution,
    style: options.style,
    shots: plan.shots.map((shot) => ({
      shotIndex: shot.shotIndex,
      title: shot.title,
      duration: shot.duration,
      scene: "",
      camera: shot.camera,
      emotion: shot.emotion,
      action: shot.action,
      videoPrompt: shot.videoPrompt,
      imagePrompt: shot.imagePrompt ?? "",
      negativePrompt: "",
      referenceAssets: shot.referenceAssetIds ?? [],
      referenceImageUrl: shot.referenceImageUrl,
      referenceImageAssetId: shot.referenceImageAssetId,
    })),
  })

  const byIndex = new Map(result.shots.map((shot) => [shot.shotIndex, shot]))
  return {
    ...plan,
    shots: plan.shots.map((shot) => {
      const generated = byIndex.get(shot.shotIndex)
      return generated ? {
        ...shot,
        referenceImageUrl: generated.referenceImageUrl,
        referenceImageAssetId: generated.referenceImageAssetId,
      } : shot
    }),
  }
}
