import type { WorkflowJSON } from "@/lib/workflows"

export type DirectorCharacter = {
  name: string
  description?: string
  referenceAssetIds?: string[]
}

export type DirectorScene = {
  id: string
  title: string
  description?: string
}

export type DirectorShot = {
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

export type DirectorPlan = {
  title: string
  summary: string
  characters: DirectorCharacter[]
  scenes: DirectorScene[]
  shots: DirectorShot[]
}

export type DirectorRuntimeOptions = {
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

export type DirectorPipelineResult = {
  plan: DirectorPlan
  workflow: WorkflowJSON
}
