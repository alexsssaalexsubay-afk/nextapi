import type { WorkflowEdge, WorkflowJSON, WorkflowNode } from "@/lib/workflows"

type ComfyUINode = {
  id?: number | string
  type?: string
  class_type?: string
  pos?: [number, number]
  widgets_values?: unknown[]
  inputs?: Record<string, unknown> | Array<{ name?: string; link?: number }>
}

const NEXTAPI_TYPES = new Set([
  "image.input",
  "prompt.input",
  "video.params",
  "seedance.video",
  "video.merge",
  "output.preview",
  "director.llm",
])

export function importWorkflowJSON(input: unknown): WorkflowJSON {
  if (isNextAPIWorkflow(input)) return normalizeNextAPIWorkflow(input)
  if (isComfyUIObject(input)) return convertComfyUIWorkflow(input)
  throw new Error("unsupported_workflow_json")
}

function normalizeNextAPIWorkflow(input: WorkflowJSON): WorkflowJSON {
  return {
    ...input,
    metadata: input.metadata || {},
    nodes: input.nodes.map((node) => ({
      ...node,
      data: { ...(node.data || {}) },
    })),
    edges: input.edges || [],
  }
}

function convertComfyUIWorkflow(input: Record<string, unknown>): WorkflowJSON {
  const comfyNodes = readComfyNodes(input)
  const director = comfyNodes.find((node) => nodeType(node) === "NextAPIDirectorPlan")
  const generate = comfyNodes.find((node) => nodeType(node) === "NextAPIGenerateVideo")
  const textPrompt = findPromptText(comfyNodes)
  const script = stringWidget(director, 0) || textPrompt
  const prompt = stringWidget(generate, 0) || script || "Describe the shot here"
  const duration = numberWidget(generate, 1) || numberWidget(director, 2) || 5
  const aspectRatio = stringWidget(generate, 2) || stringWidget(director, 3) || "16:9"
  const characterRef = stringWidget(generate, 4) || stringWidget(director, 5)
  const style = stringWidget(director, 4) || "cinematic realistic"
  const model = "seedance-2.0-pro"
  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []

  if (director) {
    nodes.push({
      id: "imported_director_llm",
      type: "director.llm",
      position: pos(director, 40, 80),
      data: {
        label: "Director / LLM plan",
        script,
        style,
        shot_count: numberWidget(director, 1) || 3,
        duration,
        aspect_ratio: aspectRatio,
        character_refs: characterRef,
        requires_director_entitlement: true,
        source_node_type: nodeType(director),
      },
    })
  }

  const promptNodeId = "imported_prompt"
  const paramsNodeId = "imported_params"
  const imageNodeId = "imported_image"
  const videoNodeId = "imported_seedance_video"
  const outputNodeId = "imported_output"

  nodes.push(
    {
      id: promptNodeId,
      type: "prompt.input",
      position: { x: 40, y: director ? 260 : 120 },
      data: {
        label: director ? "Director prompt" : "Imported prompt",
        prompt,
        source_node_type: director ? "NextAPIDirectorPlan" : "ComfyUI",
      },
    },
    {
      id: paramsNodeId,
      type: "video.params",
      position: { x: 40, y: director ? 430 : 290 },
      data: {
        label: "Video params",
        duration,
        aspect_ratio: aspectRatio,
        resolution: "1080p",
        negative_prompt: stringWidget(generate, 3),
      },
    },
    {
      id: videoNodeId,
      type: "seedance.video",
      position: generate ? pos(generate, 430, 260) : { x: 430, y: 220 },
      data: {
        label: "Seedance video",
        model,
        source_node_type: generate ? nodeType(generate) : "ComfyUI",
      },
    },
    {
      id: outputNodeId,
      type: "output.preview",
      position: { x: 780, y: 220 },
      data: { label: "Output preview" },
    },
  )

  if (characterRef) {
    nodes.push({
      id: imageNodeId,
      type: "image.input",
      position: { x: 40, y: director ? 600 : 460 },
      data: {
        label: "Reference image",
        image_type: "reference",
        image_url: characterRef,
      },
    })
    edges.push({ id: `edge_${imageNodeId}_${videoNodeId}`, source: imageNodeId, target: videoNodeId })
  }

  if (director) edges.push({ id: "edge_director_prompt", source: "imported_director_llm", target: promptNodeId })
  edges.push(
    { id: `edge_${promptNodeId}_${videoNodeId}`, source: promptNodeId, target: videoNodeId },
    { id: `edge_${paramsNodeId}_${videoNodeId}`, source: paramsNodeId, target: videoNodeId },
    { id: `edge_${videoNodeId}_${outputNodeId}`, source: videoNodeId, target: outputNodeId },
  )

  const templateName = readTemplateName(input) || (director ? "Imported Director workflow" : "Imported ComfyUI workflow")
  return {
    name: templateName,
    model,
    metadata: {
      source: "comfyui_import",
      imported_comfyui: true,
      requires_director_entitlement: Boolean(director),
      source_node_types: comfyNodes.map(nodeType).filter(Boolean),
    },
    nodes,
    edges,
  }
}

function isNextAPIWorkflow(input: unknown): input is WorkflowJSON {
  const item = input as WorkflowJSON
  return Boolean(item && typeof item === "object" && Array.isArray(item.nodes) && item.nodes.every((node) => NEXTAPI_TYPES.has(String(node.type))))
}

function isComfyUIObject(input: unknown): input is Record<string, unknown> {
  if (!input || typeof input !== "object") return false
  const item = input as Record<string, unknown>
  return Array.isArray(item.nodes) || Object.values(item).some((value) => {
    const node = value as { class_type?: unknown }
    return Boolean(node && typeof node === "object" && typeof node.class_type === "string")
  })
}

function readComfyNodes(input: Record<string, unknown>): ComfyUINode[] {
  if (Array.isArray(input.nodes)) return input.nodes as ComfyUINode[]
  return Object.entries(input)
    .filter(([, value]) => value && typeof value === "object" && typeof (value as { class_type?: unknown }).class_type === "string")
    .map(([id, value]) => ({ id, ...(value as ComfyUINode) }))
}

function nodeType(node: ComfyUINode | undefined): string {
  return String(node?.type || node?.class_type || "")
}

function stringWidget(node: ComfyUINode | undefined, index: number): string {
  const value = node?.widgets_values?.[index]
  return typeof value === "string" ? value.trim() : ""
}

function numberWidget(node: ComfyUINode | undefined, index: number): number | undefined {
  const value = node?.widgets_values?.[index]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function pos(node: ComfyUINode | undefined, x: number, y: number): { x: number; y: number } {
  const value = node?.pos
  if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number") {
    return { x: value[0], y: value[1] }
  }
  return { x, y }
}

function findPromptText(nodes: ComfyUINode[]): string {
  for (const node of nodes) {
    const typ = nodeType(node).toLowerCase()
    if (!typ.includes("text") && !typ.includes("prompt") && !typ.includes("cliptextencode")) continue
    const text = (node.widgets_values || []).find((value) => typeof value === "string" && value.trim().length > 0)
    if (typeof text === "string") return text.trim()
  }
  return ""
}

function readTemplateName(input: Record<string, unknown>): string {
  const extra = input.extra as { nextapi_template?: { name?: unknown } } | undefined
  const name = extra?.nextapi_template?.name
  return typeof name === "string" ? name.trim() : ""
}
