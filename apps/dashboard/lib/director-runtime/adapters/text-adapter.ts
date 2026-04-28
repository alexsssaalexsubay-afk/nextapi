import { generateDirectorShots } from "@/lib/workflows"
import type { DirectorPlan, DirectorRuntimeOptions } from "../types"

export async function generateTextWithProvider(options: DirectorRuntimeOptions): Promise<DirectorPlan> {
  const storyboard = await generateDirectorShots({
    story: options.story,
    genre: options.genre,
    style: options.style,
    shot_count: options.shotCount,
    duration_per_shot: options.durationPerShot,
    text_provider_id: options.textProviderId,
    image_provider_id: options.imageProviderId,
  })
  return {
    title: storyboard.title,
    summary: storyboard.summary,
    characters: [],
    scenes: storyboard.shots.map((shot) => ({
      id: `scene_${shot.shotIndex}`,
      title: shot.scene || shot.title,
      description: shot.action,
    })),
    shots: storyboard.shots.map((shot) => ({
      shotIndex: shot.shotIndex,
      title: shot.title,
      duration: shot.duration,
      camera: shot.camera,
      action: shot.action,
      emotion: shot.emotion,
      videoPrompt: shot.videoPrompt,
      imagePrompt: shot.imagePrompt,
      referenceAssetIds: shot.referenceAssets,
      referenceImageUrl: shot.referenceImageUrl,
      referenceImageAssetId: shot.referenceImageAssetId,
    })),
  }
}
