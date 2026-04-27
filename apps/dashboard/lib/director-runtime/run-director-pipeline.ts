import { generateImageWithProvider } from "./adapters/image-adapter"
import { generateTextWithProvider } from "./adapters/text-adapter"
import { convertDirectorPlanToWorkflow } from "./provider-bridge"
import type { DirectorPipelineResult, DirectorRuntimeOptions } from "./types"

export async function runDirectorPipeline(options: DirectorRuntimeOptions): Promise<DirectorPipelineResult> {
  let plan = await generateTextWithProvider(options)
  if (options.generateImages) {
    plan = await generateImageWithProvider(plan, options)
  }
  return {
    plan,
    workflow: convertDirectorPlanToWorkflow(plan, options),
  }
}

export async function runLocalDirectorPipeline(options: DirectorRuntimeOptions): Promise<DirectorPipelineResult> {
  return runDirectorPipeline(options)
}
