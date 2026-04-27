import { generateImageWithProvider } from "./adapters/image-adapter"
import { generateTextWithProvider } from "./adapters/text-adapter"
import { convertVimaxPlanToWorkflow } from "./provider-bridge"
import type { VimaxPipelineResult, VimaxRuntimeOptions } from "./types"

export async function runVimaxPipeline(options: VimaxRuntimeOptions): Promise<VimaxPipelineResult> {
  let plan = await generateTextWithProvider(options)
  if (options.generateImages) {
    plan = await generateImageWithProvider(plan, options)
  }
  return {
    plan,
    workflow: convertVimaxPlanToWorkflow(plan, options),
  }
}

export async function runLocalVimaxPipeline(options: VimaxRuntimeOptions): Promise<VimaxPipelineResult> {
  return runVimaxPipeline(options)
}
