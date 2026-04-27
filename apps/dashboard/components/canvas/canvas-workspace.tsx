"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import { AlertTriangle, CheckCircle2, Code2, GitBranch, ImageIcon, Loader2, Play, Save, Settings2, Sparkles, Type, Video, Workflow } from "lucide-react"
import { toast } from "sonner"
import { ModelSelect } from "@/components/ai/model-select"
import { apiFetch, ApiError } from "@/lib/api"
import {
  createWorkflow,
  exportWorkflowAPI,
  getWorkflow,
  listLibraryAssets,
  runWorkflow,
  saveWorkflowAsTemplate,
  updateWorkflow,
  uploadLibraryImage,
  type ExportAPIResult,
  type CanvasNodeType,
  type LibraryAsset,
  type WorkflowJSON,
  type WorkflowRecord,
} from "@/lib/workflows"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type CanvasNodeData = Record<string, unknown> & {
  node_type?: CanvasNodeType
  label?: string
  prompt?: string
  image_url?: string
  preview_url?: string
  image_type?: "character" | "scene" | "reference"
  duration?: number
  aspect_ratio?: string
  resolution?: string
  seed?: number | null
  model?: string
  video_url?: string
  node_status?: "idle" | "waiting" | "running" | "success" | "failed" | "skipped"
  error_message?: string
}

type CanvasNode = Node<CanvasNodeData, "canvas">
type CanvasEdge = Edge

type CurrentVideo = {
  id: string
  model?: string
  status: string
  output?: { url?: string; video_url?: string }
  error_code?: string
  error_message?: string
}

const ACTIVE_STATUSES = new Set(["queued", "submitting", "running", "retrying"])
const RATIOS = ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
const RESOLUTIONS = ["480p", "720p", "1080p"]

const initialNodes: CanvasNode[] = [
  node("node_image_1", "image.input", { x: 40, y: 80 }, { label: "Character image", image_type: "character", image_url: "" }),
  node("node_prompt_1", "prompt.input", { x: 40, y: 260 }, { label: "Prompt", prompt: "" }),
  node("node_params_1", "video.params", { x: 40, y: 440 }, { label: "Video params", duration: 5, aspect_ratio: "9:16", resolution: "1080p", seed: null }),
  node("node_seedance_1", "seedance.video", { x: 420, y: 250 }, { label: "Seedance video", model: "seedance-2.0-pro" }),
  node("node_output_1", "output.preview", { x: 780, y: 250 }, { label: "Output preview" }),
]

const initialEdges: CanvasEdge[] = [
  { id: "edge_image_video", source: "node_image_1", target: "node_seedance_1" },
  { id: "edge_prompt_video", source: "node_prompt_1", target: "node_seedance_1" },
  { id: "edge_params_video", source: "node_params_1", target: "node_seedance_1" },
  { id: "edge_video_output", source: "node_seedance_1", target: "node_output_1" },
]

function node(id: string, type: CanvasNodeType, position: { x: number; y: number }, data: CanvasNodeData): CanvasNode {
  return { id, type: "canvas", position, data: { ...data, node_type: type } }
}

function FlowNode({ data, type, selected }: NodeProps<CanvasNode>) {
  const nodeType = String(data.node_type || type)
  const Icon =
    nodeType === "image.input" ? ImageIcon :
      nodeType === "prompt.input" ? Type :
        nodeType === "video.params" ? Settings2 :
          nodeType === "seedance.video" ? Sparkles :
            nodeType === "video.merge" ? GitBranch :
            Video
  const status = data.node_status
  return (
    <div
      className={cn(
        "min-w-56 overflow-hidden rounded-2xl border bg-card/92 shadow-[0_18px_60px_-44px] backdrop-blur transition-all",
        selected ? "border-signal shadow-signal/30" : "border-white/12",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-signal" />
      <div className={cn("h-1", nodeAccent(nodeType))} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl border border-white/12 bg-background/60 shadow-sm">
            <Icon className="size-3.5 text-signal" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium">{String(data.label || nodeType)}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{nodeType}</div>
          </div>
        </div>
        {status ? <NodeStatusBadge status={status} /> : null}
        {nodeType === "image.input" && data.image_url ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/12">
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned/user URL preview */}
            <img src={String(data.preview_url || data.image_url)} alt="" className="h-24 w-full object-cover" />
          </div>
        ) : null}
        {nodeType === "output.preview" && data.video_url ? (
          <video src={String(data.video_url)} controls className="mt-3 aspect-video w-full rounded-xl bg-black object-contain" />
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-signal" />
    </div>
  )
}

function nodeAccent(nodeType: string) {
  if (nodeType === "image.input") return "bg-cyan-400/70"
  if (nodeType === "prompt.input") return "bg-violet-400/70"
  if (nodeType === "video.params") return "bg-amber-400/70"
  if (nodeType === "seedance.video") return "bg-fuchsia-500/70"
  if (nodeType === "video.merge") return "bg-emerald-400/70"
  return "bg-signal/70"
}

function NodeStatusBadge({ status }: { status: NonNullable<CanvasNodeData["node_status"]> }) {
  return (
    <span className={cn(
      "mt-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px]",
      status === "running" && "border-signal/40 bg-signal/10 text-signal",
      status === "waiting" && "border-muted-foreground/30 bg-card/40 text-muted-foreground",
      status === "success" && "border-status-success/40 bg-status-success/10 text-status-success",
      status === "failed" && "border-status-failed/40 bg-status-failed/10 text-status-failed",
    )}>
      {status === "running" ? <Loader2 className="size-3 animate-spin" /> : status === "success" ? <CheckCircle2 className="size-3" /> : status === "failed" ? <AlertTriangle className="size-3" /> : null}
      {status}
    </span>
  )
}

const nodeTypes = { canvas: FlowNode }

export function CanvasWorkspace() {
  const t = useTranslations()
  const labels = t.canvas
  const searchParams = useSearchParams()
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(initialEdges)
  const [selectedId, setSelectedId] = useState<string>("node_prompt_1")
  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null)
  const [name, setName] = useState(labels.defaultName)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportAPIResult | null>(null)
  const [currentVideo, setCurrentVideo] = useState<CurrentVideo | null>(null)
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId])

  useEffect(() => {
    listLibraryAssets("image")
      .then(setAssets)
      .catch(() => setAssets([]))
  }, [])

  useEffect(() => {
    const id = searchParams.get("workflow")
    if (!id) return
    getWorkflow(id).then((row) => {
      setWorkflow(row)
      setName(row.name)
      setNodes(row.workflow_json.nodes.map((n) => ({ id: n.id, type: "canvas", position: n.position ?? { x: 0, y: 0 }, data: { ...n.data, node_type: n.type } })))
      setEdges(row.workflow_json.edges.map((edge) => ({ id: edge.id ?? `edge_${edge.source}_${edge.target}`, source: edge.source, target: edge.target })))
    }).catch(() => toast.error(labels.loadFailed))
  }, [labels.loadFailed, searchParams, setEdges, setName, setNodes, setWorkflow])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, id: `edge_${Date.now()}` }, eds)),
    [setEdges],
  )

  const updateSelectedData = useCallback((patch: CanvasNodeData) => {
    if (!selectedId) return
    setNodes((items) => items.map((item) => item.id === selectedId ? { ...item, data: { ...item.data, ...patch } } : item))
  }, [selectedId, setNodes])

  const uploadImageForSelectedNode = useCallback(async (file: File) => {
    setUploadingImage(true)
    try {
      const asset = await uploadLibraryImage(file)
      setAssets((items) => [asset, ...items.filter((item) => item.id !== asset.id)])
      updateSelectedData({ image_url: asset.generation_url || asset.url, preview_url: asset.url, asset_id: asset.id })
    } catch {
      toast.error(labels.uploadFailed)
    } finally {
      setUploadingImage(false)
    }
  }, [labels.uploadFailed, updateSelectedData])

  const addNode = (type: CanvasNodeType) => {
    const id = `node_${type.replace(".", "_")}_${Date.now()}`
    const data: CanvasNodeData =
      type === "image.input" ? { label: labels.imageNode, image_type: "reference", image_url: "" } :
        type === "prompt.input" ? { label: labels.promptNode, prompt: "" } :
          type === "video.params" ? { label: labels.paramsNode, duration: 5, aspect_ratio: "9:16", resolution: "1080p", seed: null } :
            type === "seedance.video" ? { label: labels.videoNode, model: "seedance-2.0-pro" } :
              type === "video.merge" ? { label: labels.mergeNode } :
                { label: labels.outputNode }
    setNodes((items) => [...items, { id, type: "canvas", position: { x: 180 + items.length * 24, y: 120 + items.length * 16 }, data: { ...data, node_type: type } }])
    setSelectedId(id)
  }

  const toWorkflowJSON = useCallback((): WorkflowJSON => ({
    name,
    model: seedanceModel(nodes),
    nodes: nodes.map((n) => ({
      id: n.id,
      type: String(n.data.node_type) as CanvasNodeType,
      position: n.position,
      data: stripRuntimeData(n.data),
    })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  }), [edges, name, nodes])

  const validateClient = (json: WorkflowJSON): string | null => {
    const seedance = json.nodes.filter((n) => n.type === "seedance.video")
    if (seedance.length < 1) return labels.errorSeedanceRequired
    for (const video of seedance) {
      const upstream = json.edges.filter((edge) => edge.target === video.id).map((edge) => edge.source)
      if (!json.nodes.some((n) => upstream.includes(n.id) && n.type === "prompt.input" && String(n.data.prompt || "").trim())) {
        return labels.errorPromptRequired
      }
    }
    return null
  }

  const save = async () => {
    const json = toWorkflowJSON()
    const err = validateClient(json)
    if (err) {
      toast.error(err)
      return null
    }
    setSaving(true)
    try {
      const saved = workflow
        ? await updateWorkflow(workflow.id, { name, workflow_json: json })
        : await createWorkflow({ name, workflow_json: json })
      setWorkflow(saved)
      toast.success(labels.saved)
      return saved
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : labels.saveFailed)
      return null
    } finally {
      setSaving(false)
    }
  }

  const refreshVideo = useCallback(async (id: string) => {
    const video = await apiFetch(`/v1/videos/${id}`) as CurrentVideo
    setCurrentVideo(video)
    const url = video.output?.url || video.output?.video_url
    const nodeStatus = taskStatusToNodeStatus(video.status)
    setNodes((items) => items.map((item) => {
      const nodeType = String(item.data.node_type)
      if (nodeType === "seedance.video") {
        return { ...item, data: { ...item.data, node_status: nodeStatus, error_message: video.error_message } }
      }
      if (nodeType === "output.preview" && url) {
        return { ...item, data: { ...item.data, node_status: "success", video_url: url } }
      }
      return item
    }))
    return video
  }, [setNodes])

  useEffect(() => {
    if (!currentVideo?.id || !ACTIVE_STATUSES.has(currentVideo.status)) return
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = setTimeout(() => {
      void refreshVideo(currentVideo.id).catch(() => undefined)
    }, 4000)
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [currentVideo?.id, currentVideo?.status, refreshVideo])

  const run = async () => {
    if (running) return
    setRunning(true)
    try {
      const saved = workflow ?? await save()
      if (!saved) return
      setNodes((items) => items.map((item) => String(item.data.node_type) === "seedance.video" ? { ...item, data: { ...item.data, node_status: "running", error_message: undefined } } : item))
      const result = await runWorkflow(saved.id)
      toast.success(labels.runCreated)
      setCurrentVideo({ id: result.task_id, status: result.status })
      void refreshVideo(result.task_id).catch(() => undefined)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : labels.runFailed)
      setNodes((items) => items.map((item) => String(item.data.node_type) === "seedance.video" ? { ...item, data: { ...item.data, node_status: "failed" } } : item))
    } finally {
      setRunning(false)
    }
  }

  const saveTemplate = async () => {
    setTemplateSaving(true)
    try {
      const saved = workflow ?? await save()
      if (!saved) return
      await saveWorkflowAsTemplate(saved.id, { name, category: "canvas" })
      toast.success(labels.templateSaved)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : labels.templateSaveFailed)
    } finally {
      setTemplateSaving(false)
    }
  }

  const exportAPI = async () => {
    setExporting(true)
    try {
      const saved = workflow ?? await save()
      if (!saved) return
      const result = await exportWorkflowAPI(saved.id)
      setExportResult(result)
      toast.success(labels.exportReady)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : labels.exportFailed)
    } finally {
      setExporting(false)
    }
  }

  const videoURL = currentVideo?.output?.url || currentVideo?.output?.video_url

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[720px] flex-col overflow-hidden rounded-t-[32px] border-t border-white/10 bg-background/25">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-background/52 px-5 py-3 shadow-[0_18px_70px_-58px] shadow-signal backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-2xl border border-white/12 bg-card/55 text-signal shadow-sm backdrop-blur-md">
              <Workflow className="size-4" />
            </span>
            <div>
              <h1 className="text-[18px] font-medium tracking-tight">{labels.title}</h1>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{labels.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="hidden rounded-full border border-white/12 bg-card/55 px-3 py-1.5 font-mono text-[11px] text-muted-foreground shadow-sm backdrop-blur-md lg:block">
            {nodes.length} {labels.nodes} · {edges.length} {labels.edges}
          </div>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 w-64 rounded-full border border-white/12 bg-card/55 px-3 text-[13px] shadow-sm backdrop-blur-md focus:border-signal/45 focus:outline-none"
          />
          <button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-card/55 px-4 text-[12.5px] shadow-sm backdrop-blur-md hover:border-signal/35 disabled:opacity-60">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {labels.save}
          </button>
          <button type="button" onClick={saveTemplate} disabled={templateSaving} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-card/55 px-4 text-[12.5px] shadow-sm backdrop-blur-md hover:border-signal/35 disabled:opacity-60">
            {templateSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {labels.saveTemplate}
          </button>
          <button type="button" onClick={exportAPI} disabled={exporting} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-card/55 px-4 text-[12.5px] shadow-sm backdrop-blur-md hover:border-signal/35 disabled:opacity-60">
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Code2 className="size-3.5" />}
            {labels.exportApi}
          </button>
          <button type="button" onClick={run} disabled={running} className="premium-button inline-flex h-9 items-center gap-2 rounded-full border border-white/20 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.42),transparent_30%),linear-gradient(110deg,#2563eb_0%,#7c3aed_42%,#db2777_100%)] px-4 text-[12.5px] font-medium text-white disabled:opacity-60">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {labels.run}
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_360px]">
        <aside className="border-r border-white/10 bg-card/30 p-3 backdrop-blur-md">
          <div className="mb-3 rounded-2xl border border-white/10 bg-background/45 px-3 py-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{labels.nodes}</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{labels.nodeLibraryHint}</p>
          </div>
          <NodeButton label={labels.imageNode} onClick={() => addNode("image.input")} />
          <NodeButton label={labels.promptNode} onClick={() => addNode("prompt.input")} />
          <NodeButton label={labels.paramsNode} onClick={() => addNode("video.params")} />
          <NodeButton label={labels.videoNode} onClick={() => addNode("seedance.video")} />
          <NodeButton label={labels.mergeNode} onClick={() => addNode("video.merge")} />
          <NodeButton label={labels.outputNode} onClick={() => addNode("output.preview")} />
        </aside>
        <main className="relative min-h-0 bg-background/18">
          <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-white/12 bg-background/60 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground shadow-sm backdrop-blur-md">
            {labels.canvasRoute}
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, nodeItem) => setSelectedId(nodeItem.id)}
            fitView
          >
            <Background />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </main>
        <aside className="flex min-h-0 flex-col border-l border-white/10 bg-card/30 backdrop-blur-md">
          <NodeInspector node={selectedNode} assets={assets} labels={labels} uploadingImage={uploadingImage} onUploadImage={uploadImageForSelectedNode} onChange={updateSelectedData} />
          <div className="border-t border-white/10 p-4">
            <RunStatusCard currentVideo={currentVideo} videoURL={videoURL} exportResult={exportResult} labels={labels} />
            {exportResult ? (
              <div className="mt-3 rounded-2xl border border-white/12 bg-background/70 p-3">
                <div className="mb-2 text-[12px] font-medium">{labels.exportedApi}</div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-card/70 p-2 font-mono text-[10.5px] text-muted-foreground">
                  {exportResult.curl}
                </pre>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}

function NodeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-2 flex w-full items-center justify-between rounded-2xl border border-white/12 bg-background/55 px-3 py-2 text-left text-[12.5px] shadow-sm backdrop-blur-md hover:border-signal/35 hover:bg-card">
      <span>{label}</span>
      <span className="text-muted-foreground">+</span>
    </button>
  )
}

function RunStatusCard({
  currentVideo,
  videoURL,
  exportResult,
  labels,
}: {
  currentVideo: CurrentVideo | null
  videoURL?: string
  exportResult: ExportAPIResult | null
  labels: ReturnType<typeof useTranslations>["canvas"]
}) {
  const status = currentVideo?.status ?? "idle"
  return (
    <section className="rounded-3xl border border-white/12 bg-background/55 p-3 shadow-sm backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium">{labels.statusTitle}</div>
          <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">{currentVideo?.id ?? labels.noTask}</div>
        </div>
        <NodeStatusBadge status={taskStatusToNodeStatus(status)} />
      </div>
      <div className="mt-3 grid gap-2 text-[12px]">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-card/40 px-3 py-2">
          <span className="text-muted-foreground">{labels.status}</span>
          <span className="font-mono text-foreground">{status}</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-card/40 px-3 py-2">
          <span className="text-muted-foreground">{labels.exportApi}</span>
          <span className={cn("font-mono", exportResult ? "text-status-success" : "text-muted-foreground")}>{exportResult ? labels.exportReady : labels.noTask}</span>
        </div>
      </div>
      {videoURL ? <video src={videoURL} controls className="mt-3 aspect-video w-full rounded-2xl bg-black object-contain" /> : null}
      {currentVideo?.error_code ? <div className="mt-2 rounded-2xl border border-status-failed/30 bg-status-failed/10 px-3 py-2 text-[12px] text-status-failed">{currentVideo.error_code}</div> : null}
    </section>
  )
}

function NodeInspector({
  node: selectedNode,
  assets,
  labels,
  uploadingImage,
  onUploadImage,
  onChange,
}: {
  node: CanvasNode | null
  assets: LibraryAsset[]
  labels: ReturnType<typeof useTranslations>["canvas"]
  uploadingImage: boolean
  onUploadImage: (file: File) => Promise<void>
  onChange: (patch: CanvasNodeData) => void
}) {
  if (!selectedNode) {
    return <div className="p-4 text-[12.5px] text-muted-foreground">{labels.selectNode}</div>
  }
  const type = String(selectedNode.data.node_type) as CanvasNodeType
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-3">
        <div className="text-[12px] font-medium">{labels.inspector}</div>
        <div className="font-mono text-[10.5px] text-muted-foreground">{type}</div>
      </div>
      <label className="mb-3 block">
        <span className="mb-1 block text-[11px] text-muted-foreground">{labels.label}</span>
        <input value={String(selectedNode.data.label || "")} onChange={(e) => onChange({ label: e.target.value })} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[12.5px] focus:outline-none" />
      </label>
      {type === "image.input" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">{labels.imageType}</span>
            <select value={String(selectedNode.data.image_type || "reference")} onChange={(e) => onChange({ image_type: e.target.value as CanvasNodeData["image_type"] })} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[12.5px]">
              <option value="character">{labels.character}</option>
              <option value="scene">{labels.scene}</option>
              <option value="reference">{labels.reference}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">{labels.imageUrl}</span>
            <input value={String(selectedNode.data.image_url || "")} onChange={(e) => onChange({ image_url: e.target.value })} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[11.5px] focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">{labels.imagePrompt}</span>
            <textarea value={String(selectedNode.data.prompt || "")} onChange={(e) => onChange({ prompt: e.target.value })} rows={4} className="w-full resize-none rounded-md border border-border/80 bg-background px-3 py-2 text-[12.5px] focus:outline-none" />
          </label>
          <label className="block rounded-md border border-dashed border-border/80 bg-card/40 px-3 py-2 text-[12px]">
            <span className="block font-medium">{uploadingImage ? `${labels.uploadImage}...` : labels.uploadImage}</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">{labels.uploadImageHint}</span>
            <input type="file" accept="image/*" disabled={uploadingImage} className="mt-2 block w-full text-[11px]" onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onUploadImage(file)
              event.currentTarget.value = ""
            }} />
          </label>
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">{labels.assetLibrary}</div>
            <div className="grid grid-cols-3 gap-2">
              {assets.slice(0, 9).map((asset) => (
                <button key={asset.id} type="button" onClick={() => onChange({ image_url: asset.generation_url || asset.url, preview_url: asset.url, asset_id: asset.id })} className="overflow-hidden rounded-md border border-border/70">
                  {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL */}
                  <img src={asset.url} alt={asset.filename || asset.id} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {type === "prompt.input" ? (
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted-foreground">{labels.prompt}</span>
          <textarea value={String(selectedNode.data.prompt || "")} onChange={(e) => onChange({ prompt: e.target.value })} rows={8} className="w-full resize-none rounded-md border border-border/80 bg-background px-3 py-2 text-[12.5px] focus:outline-none" />
        </label>
      ) : null}
      {type === "video.params" ? (
        <div className="space-y-3">
          <RangeField label={labels.duration} value={Number(selectedNode.data.duration || 5)} min={4} max={15} onChange={(duration) => onChange({ duration })} />
          <Select label={labels.aspectRatio} value={String(selectedNode.data.aspect_ratio || "9:16")} values={RATIOS} onChange={(value) => onChange({ aspect_ratio: value })} />
          <Select label={labels.resolution} value={String(selectedNode.data.resolution || "1080p")} values={RESOLUTIONS} onChange={(value) => onChange({ resolution: value })} />
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">{labels.seed}</span>
            <input value={selectedNode.data.seed == null ? "" : String(selectedNode.data.seed)} onChange={(e) => onChange({ seed: e.target.value.trim() ? Number(e.target.value) : null })} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[12px]" />
          </label>
        </div>
      ) : null}
      {type === "seedance.video" ? (
        <ModelSelect label={labels.model} value={String(selectedNode.data.model || "seedance-2.0-pro")} onChange={(model) => onChange({ model })} category="video" />
      ) : null}
    </div>
  )
}

function RangeField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const safeValue = Math.min(max, Math.max(min, value))
  return (
    <label className="block rounded-lg border border-border/80 bg-background px-3 py-2">
      <span className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-[12px] text-foreground">{safeValue}s</span>
      </span>
      <input type="range" min={min} max={max} value={safeValue} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-signal" />
      <span className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{min}s</span>
        <span>{max}s</span>
      </span>
    </label>
  )
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[12.5px]">
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}

function stripRuntimeData(data: CanvasNodeData): Record<string, unknown> {
  const { node_type: _nodeType, video_url: _videoURL, preview_url: _previewURL, ...rest } = data
  return rest
}

function seedanceModel(nodes: CanvasNode[]): string {
  const seedance = nodes.find((n) => String(n.data.node_type) === "seedance.video")
  return String(seedance?.data.model || "seedance-2.0-pro")
}

function taskStatusToNodeStatus(status: string): NonNullable<CanvasNodeData["node_status"]> {
  if (status === "queued" || status === "submitting") return "waiting"
  if (status === "running" || status === "retrying") return "running"
  if (status === "succeeded") return "success"
  if (status === "failed" || status === "timed_out" || status === "canceled" || status === "cancelled") return "failed"
  return "idle"
}
