import { apiFetch } from "@/lib/api"
import type { DirectorPlan } from "@/lib/director-runtime/types"

export type DirectorEngineUsed = "advanced_sidecar" | "advanced_fallback" | "nextapi"

export type DirectorEngineStatus = {
  requested_engine?: string
  engine_used?: DirectorEngineUsed | string
  fallback_used?: boolean
  fallback_enabled?: boolean
  sidecar_configured?: boolean
  sidecar_healthy?: boolean
  reason?: string
}

export type CanvasNodeType =
  | "image.input"
  | "prompt.input"
  | "video.params"
  | "seedance.video"
  | "video.merge"
  | "output.preview"

export type WorkflowNode = {
  id: string
  type: CanvasNodeType
  position?: { x: number; y: number }
  data: Record<string, unknown>
}

export type WorkflowEdge = {
  id?: string
  source: string
  target: string
}

export type WorkflowJSON = {
  id?: string
  name: string
  model?: string
  metadata?: Record<string, unknown>
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type WorkflowRecord = {
  id: string
  name: string
  description?: string | null
  workflow_json: WorkflowJSON
  created_at?: string
  updated_at?: string
}

export type WorkflowRunResult = {
  run_id: string
  task_id: string
  video_id: string
  status: string
  estimated_cost_cents?: number
  batch_run_id?: string
  job_ids?: string[]
  video_ids?: string[]
  merge_job_id?: string
}

export type DirectorShot = {
  shotIndex: number
  title: string
  duration: number
  scene: string
  camera: string
  emotion: string
  action: string
  videoPrompt: string
  imagePrompt: string
  negativePrompt: string
  referenceAssets: string[]
  referenceImageAssetId?: string
  referenceImageUrl?: string
}

export type DirectorCharacterInput = {
  name: string
  description?: string
  asset_id?: string
  reference_images?: string[]
}

export type DirectorStoryboard = {
  title: string
  summary: string
  shots: DirectorShot[]
  engine_used?: DirectorEngineUsed | string
  engine_status?: DirectorEngineStatus
}

export type DirectorStatus = {
  available: boolean
  requires_vip: boolean
  entitled: boolean
  text_provider_configured: boolean
  image_provider_configured: boolean
  merge_enabled: boolean
  blocking_reason?: "vip_required" | "text_provider_not_configured"
  usage_notice: string
  engine_used?: DirectorEngineUsed | string
  engine_status?: DirectorEngineStatus
  runtime?: DirectorEngineStatus
  requested_engine?: string
  fallback_used?: boolean
  fallback_enabled?: boolean
  sidecar_configured?: boolean
  sidecar_healthy?: boolean
  reason?: string
}

export type LibraryAsset = {
  id: string
  kind: "image" | "video" | "audio"
  filename?: string
  url: string
  generation_url?: string
}

export type TemplateBatchRunResult = {
  batch_run_id: string
  job_ids: string[]
  total: number
  accepted: number
  rejected: number
  status: string
}

export type BatchRunDetail = {
  id: string
  status: string
  summary?: {
    total: number
    queued: number
    running: number
    succeeded: number
    failed: number
  }
}

export type CharacterRecord = {
  id: string
  name: string
  reference_images: string[]
}

export type CreateCharacterInput = {
  name: string
  reference_images: string[]
}

export type TemplateInputField = {
  key: string
  label: string
  type?: "text" | "textarea" | "image" | "number" | "select"
  placeholder?: string
  target_node_id?: string
  required?: boolean
}

export type TemplateRecord = {
  id: string
  name: string
  slug: string
  category: string
  visibility: string
  description?: string | null
  default_model?: string
  default_resolution?: string
  default_duration?: number
  default_aspect_ratio?: string
  default_max_parallel?: number
  input_schema?: TemplateInputField[]
  recommended_inputs_schema?: TemplateInputField[]
  estimated_cost_cents?: number | null
  workflow_json?: WorkflowJSON
}

export type ExportAPIResult = {
  payload: {
    model: string
    input: Record<string, unknown>
  }
  curl: string
  javascript: string
  python: string
}

export async function createWorkflow(input: {
  name: string
  description?: string
  workflow_json: WorkflowJSON
}): Promise<WorkflowRecord> {
  return apiFetch("/v1/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<WorkflowRecord>
}

export async function getWorkflow(id: string): Promise<WorkflowRecord> {
  return apiFetch(`/v1/workflows/${id}`) as Promise<WorkflowRecord>
}

export async function updateWorkflow(
  id: string,
  input: {
    name?: string
    description?: string
    workflow_json?: WorkflowJSON
  },
): Promise<WorkflowRecord> {
  return apiFetch(`/v1/workflows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<WorkflowRecord>
}

export async function runWorkflow(id: string): Promise<WorkflowRunResult> {
  return apiFetch(`/v1/workflows/${id}/run`, { method: "POST" }) as Promise<WorkflowRunResult>
}

export async function saveWorkflowAsTemplate(
  id: string,
  input: { name: string; category?: string },
): Promise<TemplateRecord> {
  return apiFetch(`/v1/workflows/${id}/save-as-template`, {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<TemplateRecord>
}

export async function exportWorkflowAPI(id: string): Promise<ExportAPIResult> {
  return apiFetch(`/v1/workflows/${id}/export-api`, { method: "POST" }) as Promise<ExportAPIResult>
}

export async function generateDirectorShots(input: {
  engine?: "nextapi" | "advanced"
  story: string
  genre?: string
  style?: string
  shot_count?: number
  duration_per_shot?: number
  scene?: string
  characters?: DirectorCharacterInput[]
  text_provider_id?: string
}): Promise<DirectorStoryboard> {
  return apiFetch("/v1/director/generate-shots", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<DirectorStoryboard>
}

export async function getDirectorStatus(): Promise<DirectorStatus> {
  return apiFetch("/v1/director/status") as Promise<DirectorStatus>
}

export async function createDirectorWorkflow(input: {
  storyboard: DirectorStoryboard
  options: { name?: string; ratio?: string; resolution?: string; generate_audio?: boolean; model?: string; enable_merge?: boolean }
}): Promise<{ workflow: WorkflowRecord }> {
  return apiFetch("/v1/director/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ workflow: WorkflowRecord }>
}

export async function generateDirectorShotImages(input: {
  shots: DirectorShot[]
  imageProviderId?: string
  style?: string
  resolution?: string
}): Promise<{ shots: DirectorShot[] }> {
  return apiFetch("/v1/director/generate-shot-images", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ shots: DirectorShot[] }>
}

export async function runBackendDirectorPipeline(input: {
  engine?: "nextapi" | "advanced"
  story: string
  genre?: string
  style?: string
  shot_count?: number
  duration_per_shot?: number
  characters?: DirectorCharacterInput[]
  text_provider_id?: string
  image_provider_id?: string
  generate_images?: boolean
  run_workflow?: boolean
  options?: { name?: string; ratio?: string; resolution?: string; generate_audio?: boolean; model?: string; enable_merge?: boolean }
}): Promise<{ plan: DirectorPlan & { engine_used?: DirectorEngineUsed | string; engine_status?: DirectorEngineStatus }; workflow: WorkflowJSON; record?: WorkflowRecord; run?: WorkflowRunResult | null; engine_used?: DirectorEngineUsed | string; engine_status?: DirectorEngineStatus }> {
  return apiFetch("/v1/director/mode/run", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ plan: DirectorPlan & { engine_used?: DirectorEngineUsed | string; engine_status?: DirectorEngineStatus }; workflow: WorkflowJSON; record?: WorkflowRecord; run?: WorkflowRunResult | null; engine_used?: DirectorEngineUsed | string; engine_status?: DirectorEngineStatus }>
}

export async function listLibraryAssets(kind = "image"): Promise<LibraryAsset[]> {
  const res = await apiFetch(`/v1/me/library/assets?kind=${encodeURIComponent(kind)}`) as { assets?: LibraryAsset[] }
  return Array.isArray(res.assets) ? res.assets : []
}

export async function uploadLibraryImage(file: File): Promise<LibraryAsset> {
  const body = new FormData()
  body.append("file", file)
  const res = await apiFetch("/v1/me/library/assets", {
    method: "POST",
    body,
  }) as { asset?: LibraryAsset } & LibraryAsset
  if (res.asset) return res.asset
  return res
}

export async function useTemplate(id: string, name?: string): Promise<WorkflowRecord> {
  return apiFetch(`/v1/templates/${id}/use`, {
    method: "POST",
    body: JSON.stringify({ name }),
  }) as Promise<WorkflowRecord>
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  const res = await apiFetch("/v1/templates") as { data?: TemplateRecord[] }
  return Array.isArray(res.data) ? res.data : []
}

export async function runTemplate(
  id: string,
  inputs: Record<string, unknown>,
): Promise<WorkflowRunResult> {
  return apiFetch(`/v1/templates/${id}/run`, {
    method: "POST",
    headers: { "Idempotency-Key": `template-${id}-${crypto.randomUUID()}` },
    body: JSON.stringify({ inputs }),
  }) as Promise<WorkflowRunResult>
}

export async function runTemplateBatch(
  id: string,
  input: {
    inputs: Record<string, unknown>
    variables: Record<string, unknown[]>
    mode: "cartesian" | "zip"
    name?: string
    max_parallel?: number
  },
): Promise<TemplateBatchRunResult> {
  return apiFetch(`/v1/templates/${id}/run-batch`, {
    method: "POST",
    headers: { "Idempotency-Key": `template-batch-${id}-${crypto.randomUUID()}` },
    body: JSON.stringify(input),
  }) as Promise<TemplateBatchRunResult>
}

export async function getBatchRun(id: string): Promise<BatchRunDetail> {
  return apiFetch(`/v1/batch/runs/${id}`) as Promise<BatchRunDetail>
}

export async function listCharacters(): Promise<CharacterRecord[]> {
  const res = await apiFetch("/v1/characters") as { data?: CharacterRecord[] }
  return Array.isArray(res.data) ? res.data : []
}

export async function createCharacter(input: CreateCharacterInput): Promise<CharacterRecord> {
  return apiFetch("/v1/characters", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<CharacterRecord>
}
