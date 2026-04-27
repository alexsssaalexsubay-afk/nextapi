import type { WorkflowJSON } from "@/lib/workflows"

export type VimaxCharacter = {
  name: string
  description?: string
  referenceAssetIds?: string[]
}

export type VimaxScene = {
  id: string
  title: string
  description?: string
}

export type VimaxShot = {
  shotIndex: number
  title: string
  duration: number
  camera: string
  action: string
  emotion: string
  videoPrompt: string
  imagePrompt?: string
  referenceAssetIds?: string[]
  referenceImageUrl?: string
  referenceImageAssetId?: string
}

export type VimaxPlan = {
  title: string
  summary: string
  characters: VimaxCharacter[]
  scenes: VimaxScene[]
  shots: VimaxShot[]
}

export type VimaxRuntimeOptions = {
  story: string
  genre?: string
  style?: string
  shotCount?: number
  durationPerShot?: number
  textProviderId?: string
  imageProviderId?: string
  generateImages?: boolean
  model?: string
  ratio?: string
  resolution?: string
  generateAudio?: boolean
  enableMerge?: boolean
}

export type VimaxPipelineResult = {
  plan: VimaxPlan
  workflow: WorkflowJSON
}
