import type { WorkflowJSON } from "@/lib/workflows"
import type { DirectorPlan, DirectorRuntimeOptions } from "./types"

export function convertDirectorPlanToWorkflow(plan: DirectorPlan, options: Partial<DirectorRuntimeOptions> = {}): WorkflowJSON {
  const model = options.model || "seedance-2.0-pro"
  const ratio = options.ratio || "9:16"
  const resolution = options.resolution || "1080p"
  const nodes: WorkflowJSON["nodes"] = []
  const edges: WorkflowJSON["edges"] = []

  plan.shots.forEach((shot, index) => {
    const col = index * 360
    const promptId = `director_${shot.shotIndex}_prompt`
    const imageId = `director_${shot.shotIndex}_image`
    const paramsId = `director_${shot.shotIndex}_params`
    const videoId = `director_${shot.shotIndex}_video`

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

  const outputId = "director_output"
  if (options.enableMerge) {
    const mergeId = "director_merge"
    nodes.push(
      {
        id: mergeId,
        type: "video.merge",
        position: { x: plan.shots.length * 360 + 260, y: 180 },
        data: { label: "Video merge", mode: "auto" },
      },
      {
        id: outputId,
        type: "output.preview",
        position: { x: plan.shots.length * 360 + 580, y: 180 },
        data: { label: "Output preview" },
      },
    )
    for (const shot of plan.shots) {
      edges.push({ id: `edge_director_${shot.shotIndex}_video_merge`, source: `director_${shot.shotIndex}_video`, target: mergeId })
    }
    edges.push({ id: "edge_director_merge_output", source: mergeId, target: outputId })
  } else {
    nodes.push({
      id: outputId,
      type: "output.preview",
      position: { x: plan.shots.length * 360 + 260, y: 180 },
      data: { label: "Output preview" },
    })
    for (const shot of plan.shots) {
      edges.push({ id: `edge_director_${shot.shotIndex}_video_output`, source: `director_${shot.shotIndex}_video`, target: outputId })
    }
  }

  return { name: plan.title || "NextAPI Director workflow", model, nodes, edges }
}
