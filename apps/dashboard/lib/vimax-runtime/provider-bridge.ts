import type { WorkflowJSON } from "@/lib/workflows"
import type { VimaxPlan, VimaxRuntimeOptions } from "./types"

export function convertVimaxPlanToWorkflow(plan: VimaxPlan, options: VimaxRuntimeOptions = {}): WorkflowJSON {
  const model = options.model || "seedance-2.0-pro"
  const ratio = options.ratio || "9:16"
  const resolution = options.resolution || "1080p"
  const nodes: WorkflowJSON["nodes"] = []
  const edges: WorkflowJSON["edges"] = []

  plan.shots.forEach((shot, index) => {
    const col = index * 360
    const promptId = `vimax_${shot.shotIndex}_prompt`
    const imageId = `vimax_${shot.shotIndex}_image`
    const paramsId = `vimax_${shot.shotIndex}_params`
    const videoId = `vimax_${shot.shotIndex}_video`

    nodes.push(
      {
        id: promptId,
        type: "prompt.input",
        position: { x: col, y: 80 },
        data: { label: shot.title, prompt: shot.videoPrompt },
      },
      {
        id: paramsId,
        type: "video.params",
        position: { x: col, y: 240 },
        data: {
          label: "Video params",
          duration: shot.duration,
          aspect_ratio: ratio,
          resolution,
          generate_audio: options.generateAudio ?? false,
        },
      },
      {
        id: videoId,
        type: "seedance.video",
        position: { x: col + 340, y: 180 },
        data: { label: "Seedance video", model },
      },
    )

    if (shot.referenceImageUrl) {
      nodes.push({
        id: imageId,
        type: "image.input",
        position: { x: col, y: 400 },
        data: {
          label: "Reference image",
          image_type: "reference",
          image_url: shot.referenceImageUrl,
          asset_id: shot.referenceImageAssetId,
          prompt: shot.imagePrompt,
        },
      })
      edges.push({ id: `edge_${imageId}_${videoId}`, source: imageId, target: videoId })
    }

    edges.push(
      { id: `edge_${promptId}_${videoId}`, source: promptId, target: videoId },
      { id: `edge_${paramsId}_${videoId}`, source: paramsId, target: videoId },
    )
  })

  const outputId = "vimax_output"
  if (options.enableMerge) {
    const mergeId = "vimax_merge"
    nodes.push(
      {
        id: mergeId,
        type: "video.merge",
        position: { x: plan.shots.length * 360 + 260, y: 180 },
        data: { label: "Video merge", status: "disabled" },
      },
      {
        id: outputId,
        type: "output.preview",
        position: { x: plan.shots.length * 360 + 580, y: 180 },
        data: { label: "Output preview" },
      },
    )
    for (const shot of plan.shots) {
      edges.push({ id: `edge_vimax_${shot.shotIndex}_video_merge`, source: `vimax_${shot.shotIndex}_video`, target: mergeId })
    }
    edges.push({ id: "edge_vimax_merge_output", source: mergeId, target: outputId })
  } else {
    nodes.push({
      id: outputId,
      type: "output.preview",
      position: { x: plan.shots.length * 360 + 260, y: 180 },
      data: { label: "Output preview" },
    })
    for (const shot of plan.shots) {
      edges.push({ id: `edge_vimax_${shot.shotIndex}_video_output`, source: `vimax_${shot.shotIndex}_video`, target: outputId })
    }
  }

  return { name: plan.title || "ViMax workflow", model, nodes, edges }
}
