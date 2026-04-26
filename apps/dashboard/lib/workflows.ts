import { apiFetch } from "@/lib/api"

export type CanvasNodeType =
  | "image.input"
  | "prompt.input"
  | "video.params"
  | "seedance.video"
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

export type TemplateRecord = {
  id: string
  name: string
  slug: string
  category: string
  visibility: string
  description?: string | null
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
