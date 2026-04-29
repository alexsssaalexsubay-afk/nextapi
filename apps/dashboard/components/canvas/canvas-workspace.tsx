"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ViewportPortal,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import { AlertTriangle, CheckCircle2, Code2, GitBranch, ImageIcon, Loader2, Play, Save, Settings2, Sparkles, Type, Video, Workflow, X } from "lucide-react"
import { toast } from "sonner"
import { ModelSelect } from "@/components/ai/model-select"
import { apiFetch, ApiError } from "@/lib/api"
import { useVideoModelCatalog } from "@/lib/use-video-model-catalog"
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
type VideoNodeContext = {
  promptNode: CanvasNode | null
  paramsNode: CanvasNode | null
}

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
      data-canvas-node-selected={selected ? "true" : "false"}
      className={cn(
        "min-w-56 overflow-hidden rounded-2xl border bg-card/92 shadow-[0_18px_60px_-44px] backdrop-blur transition-all",
        selected
          ? "border-emerald-400 shadow-[0_0_0_1px_rgba(52,211,153,0.55),0_18px_70px_-45px_rgba(52,211,153,0.85)]"
          : "border-white/12",
      )}
    >
      <Handle type="target" position={Position.Left} className={cn("!border-background", selected ? "!size-3 !bg-emerald-400" : "!bg-signal")} />
      <div className={cn("h-1", selected ? "bg-emerald-400" : nodeAccent(nodeType))} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("flex size-8 items-center justify-center rounded-xl border border-white/12 bg-background/60 shadow-sm", selected && "border-emerald-400/50 bg-emerald-400/10")}>
            <Icon className={cn("size-3.5", selected ? "text-emerald-400" : "text-signal")} />
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
      <Handle type="source" position={Position.Right} className={cn("!border-background", selected ? "!size-3 !bg-emerald-400" : "!bg-signal")} />
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
const flowFitViewOptions = { padding: 0.24, maxZoom: 1 }

export function CanvasWorkspace() {
  const t = useTranslations()
  const labels = t.canvas
  const searchParams = useSearchParams()
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(initialEdges)
  const [selectedId, setSelectedId] = useState<string>("node_seedance_1")
  const [inspectorOpen, setInspectorOpen] = useState(true)
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
  const videoCatalog = useVideoModelCatalog()

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId])
  const renderedNodes = useMemo(() => nodes.map((item) => {
    const selected = item.id === selectedId
    return item.selected === selected ? item : { ...item, selected }
  }), [nodes, selectedId])
  const selectedVideoContext = useMemo(() => getVideoNodeContext(selectedNode, nodes, edges), [edges, nodes, selectedNode])
  const activeVideoModel = useMemo(() => {
    const selectedModel = selectedNode?.data.node_type === "seedance.video" ? String(selectedNode.data.model || "") : ""
    if (selectedModel) return selectedModel
    const videoNode = nodes.find((item) => item.data.node_type === "seedance.video")
    return String(videoNode?.data.model || "seedance-2.0-pro")
  }, [nodes, selectedNode])
  const selectedVideoCapability = videoCatalog.modelById[activeVideoModel]
  const durationMin = selectedVideoCapability?.minDurationSeconds ?? 4
  const durationMax = selectedVideoCapability?.maxDurationSeconds ?? 15
  const resolutionOptions = selectedVideoCapability?.supportedResolutions?.length ? selectedVideoCapability.supportedResolutions : RESOLUTIONS
  const ratioOptions = selectedVideoCapability?.supportedAspectRatios?.length ? selectedVideoCapability.supportedAspectRatios : RATIOS
  const attachedInspector = selectedNode ? attachedInspectorFrame(selectedNode) : null

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

  const updateNodeData = useCallback((nodeId: string, patch: CanvasNodeData) => {
    setNodes((items) => items.map((item) => item.id === nodeId ? { ...item, data: { ...item.data, ...patch } } : item))
  }, [setNodes])

  const updateSelectedData = useCallback((patch: CanvasNodeData) => {
    if (!selectedId) return
    updateNodeData(selectedId, patch)
  }, [selectedId, updateNodeData])

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
      const connectedImages = json.nodes.filter((n) => upstream.includes(n.id) && n.type === "image.input")
      if (connectedImages.some((n) => !String(n.data.image_url || "").trim())) {
        return labels.errorImageRequired
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
    <div data-canvas-workspace-mode="immersive" className="relative h-[calc(100vh-2.75rem)] min-h-[680px] overflow-hidden bg-background">
      <ReactFlow
        nodes={renderedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, nodeItem) => {
          setSelectedId(nodeItem.id)
          setInspectorOpen(true)
        }}
        onPaneClick={() => setInspectorOpen(false)}
        fitView
        fitViewOptions={flowFitViewOptions}
        className="bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:22px_22px]"
      >
        <Background color="color-mix(in oklch, var(--border) 55%, transparent)" gap={22} size={1} />
        <MiniMap pannable zoomable position="bottom-left" />
        <Controls position="bottom-left" />
        {selectedNode && inspectorOpen && attachedInspector ? (
          <ViewportPortal>
            <div
              className="nodrag nopan nowheel pointer-events-auto absolute z-40"
              style={{
                transform: `translate(${attachedInspector.x}px, ${attachedInspector.y}px)`,
                width: attachedInspector.width,
                pointerEvents: "auto",
              }}
              data-canvas-attached-inspector={String(selectedNode.data.node_type || "")}
            >
              <NodeInspector
                node={selectedNode}
                videoContext={selectedVideoContext}
                assets={assets}
                labels={labels}
                uploadingImage={uploadingImage}
                durationMin={durationMin}
                durationMax={durationMax}
                resolutionOptions={resolutionOptions}
                ratioOptions={ratioOptions}
                availableModelIds={videoCatalog.modelIds}
                onUploadImage={uploadImageForSelectedNode}
                onChange={updateSelectedData}
                onChangeNode={updateNodeData}
                onClose={() => setInspectorOpen(false)}
              />
            </div>
          </ViewportPortal>
        ) : null}
      </ReactFlow>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card/92 px-2.5 py-2 shadow-sm">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-signal/20 bg-signal/10 text-signal">
            <Workflow className="size-4" />
          </span>
          <div className="min-w-0">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-6 w-48 min-w-0 bg-transparent text-[13px] font-medium tracking-tight focus:outline-none sm:w-60"
              aria-label={labels.title}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{nodes.length} {labels.nodes} · {edges.length} {labels.edges}</p>
          </div>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-card/92 p-1.5 shadow-sm">
          <button type="button" onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-[12px] hover:border-signal/35 disabled:opacity-60">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {labels.save}
          </button>
          <button type="button" onClick={saveTemplate} disabled={templateSaving} className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-[12px] hover:border-signal/35 disabled:opacity-60">
            {templateSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {labels.saveTemplate}
          </button>
          <button type="button" onClick={exportAPI} disabled={exporting} className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-[12px] hover:border-signal/35 disabled:opacity-60">
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Code2 className="size-3.5" />}
            {labels.exportApi}
          </button>
          <button type="button" onClick={run} disabled={running} className="inline-flex h-8 items-center gap-2 rounded-md border border-signal/35 bg-signal px-3 text-[12px] font-medium text-signal-foreground disabled:opacity-60">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {labels.run}
          </button>
        </div>
      </div>

      <aside className="absolute left-3 top-24 z-30 rounded-xl border border-border bg-card/92 p-2 shadow-sm" aria-label={labels.nodeLibraryHint}>
        <NodeButton label={labels.imageNode} icon={<ImageIcon className="size-4" />} onClick={() => addNode("image.input")} />
        <NodeButton label={labels.promptNode} icon={<Type className="size-4" />} onClick={() => addNode("prompt.input")} />
        <NodeButton label={labels.paramsNode} icon={<Settings2 className="size-4" />} onClick={() => addNode("video.params")} />
        <NodeButton label={labels.videoNode} icon={<Sparkles className="size-4" />} onClick={() => addNode("seedance.video")} />
        <NodeButton label={labels.outputNode} icon={<Video className="size-4" />} onClick={() => addNode("output.preview")} />
      </aside>

      {currentVideo?.id || videoURL || exportResult ? (
        <div className="pointer-events-auto absolute bottom-3 right-3 z-10 w-[min(320px,calc(100vw-2rem))]">
          <section className="max-h-[36vh] overflow-y-auto rounded-lg border border-border bg-card/94 p-3 shadow-sm">
            <RunStatusCard currentVideo={currentVideo} videoURL={videoURL} exportResult={exportResult} labels={labels} />
            {exportResult ? (
              <div className="mt-3 rounded-lg border border-border bg-background p-3">
                <div className="mb-2 text-[12px] font-medium">{labels.exportedApi}</div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-[10.5px] text-muted-foreground">
                  {exportResult.curl}
                </pre>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}

function NodeButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="mb-2 grid h-11 w-full place-items-center rounded-lg border border-border bg-background text-muted-foreground shadow-sm transition hover:border-signal/35 hover:bg-accent hover:text-foreground">
      {icon}
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
  if (!currentVideo?.id && !videoURL && !exportResult) {
    return (
      <section className="rounded-lg border border-border bg-background/80 px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[12px] font-medium">{labels.statusTitle}</div>
            <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{labels.noTask}</div>
          </div>
          <NodeStatusBadge status="idle" />
        </div>
      </section>
    )
  }
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
  videoContext,
  assets,
  labels,
  uploadingImage,
  durationMin,
  durationMax,
  resolutionOptions,
  ratioOptions,
  availableModelIds,
  onUploadImage,
  onChange,
  onChangeNode,
  onClose,
}: {
  node: CanvasNode | null
  videoContext: VideoNodeContext
  assets: LibraryAsset[]
  labels: ReturnType<typeof useTranslations>["canvas"]
  uploadingImage: boolean
  durationMin: number
  durationMax: number
  resolutionOptions: string[]
  ratioOptions: string[]
  availableModelIds: string[]
  onUploadImage: (file: File) => Promise<void>
  onChange: (patch: CanvasNodeData) => void
  onChangeNode: (nodeId: string, patch: CanvasNodeData) => void
  onClose: () => void
}) {
  if (!selectedNode) {
    return <div className="p-4 text-[12.5px] text-muted-foreground">{labels.selectNode}</div>
  }
  const type = String(selectedNode.data.node_type) as CanvasNodeType
  return (
    <div className={cn("max-h-[360px] overflow-y-auto rounded-lg border bg-card/96 p-3 shadow-sm", type === "seedance.video" ? "border-emerald-400/55 shadow-[0_0_0_1px_rgba(52,211,153,0.2)]" : "border-border")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium">{type === "seedance.video" ? labels.composer : labels.inspector}</div>
          <div className="font-mono text-[10.5px] text-muted-foreground">{type}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {String(selectedNode.data.label || selectedNode.data.node_type || "node")}
          </span>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            className="grid size-7 place-items-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-emerald-400/45 hover:text-foreground"
            aria-label={labels.closeInspector}
            title={labels.closeInspector}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {type === "seedance.video" ? null : (
        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-muted-foreground">{labels.label}</span>
          <input value={String(selectedNode.data.label || "")} onChange={(e) => onChange({ label: e.target.value })} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[12.5px] focus:outline-none" />
        </label>
      )}
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
          <RangeField label={labels.duration} value={Number(selectedNode.data.duration || durationMin)} min={durationMin} max={durationMax} onChange={(duration) => onChange({ duration })} />
          <Select label={labels.aspectRatio} value={String(selectedNode.data.aspect_ratio || "9:16")} values={withCurrent(ratioOptions, String(selectedNode.data.aspect_ratio || "9:16"))} onChange={(value) => onChange({ aspect_ratio: value })} />
          <Select label={labels.resolution} value={String(selectedNode.data.resolution || "1080p")} values={withCurrent(resolutionOptions, String(selectedNode.data.resolution || "1080p"))} onChange={(value) => onChange({ resolution: value })} />
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">{labels.seed}</span>
            <input value={selectedNode.data.seed == null ? "" : String(selectedNode.data.seed)} onChange={(e) => onChange({ seed: e.target.value.trim() ? Number(e.target.value) : null })} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[12px]" />
          </label>
        </div>
      ) : null}
      {type === "seedance.video" ? (
        <VideoComposer
          node={selectedNode}
          context={videoContext}
          labels={labels}
          durationMin={durationMin}
          durationMax={durationMax}
          resolutionOptions={resolutionOptions}
          ratioOptions={ratioOptions}
          availableModelIds={availableModelIds}
          onChangeVideo={onChange}
          onChangeNode={onChangeNode}
        />
      ) : null}
    </div>
  )
}

function VideoComposer({
  node,
  context,
  labels,
  durationMin,
  durationMax,
  resolutionOptions,
  ratioOptions,
  availableModelIds,
  onChangeVideo,
  onChangeNode,
}: {
  node: CanvasNode
  context: VideoNodeContext
  labels: ReturnType<typeof useTranslations>["canvas"]
  durationMin: number
  durationMax: number
  resolutionOptions: string[]
  ratioOptions: string[]
  availableModelIds: string[]
  onChangeVideo: (patch: CanvasNodeData) => void
  onChangeNode: (nodeId: string, patch: CanvasNodeData) => void
}) {
  const promptNode = context.promptNode
  const paramsNode = context.paramsNode
  const params = paramsNode?.data

  return (
    <div className="space-y-3">
      <ModelSelect label={labels.model} value={String(node.data.model || "seedance-2.0-pro")} onChange={(model) => onChangeVideo({ model })} category="video" availableModelIds={availableModelIds} />
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted-foreground">{labels.prompt}</span>
        <textarea
          value={String(promptNode?.data.prompt || "")}
          onChange={(event) => {
            if (promptNode) onChangeNode(promptNode.id, { prompt: event.target.value })
          }}
          disabled={!promptNode}
          rows={4}
          className="w-full resize-none rounded-md border border-border/80 bg-background px-3 py-2 text-[12.5px] focus:border-signal/45 focus:outline-none disabled:opacity-55"
          placeholder={promptNode ? labels.promptPlaceholder : labels.errorPromptRequired}
        />
      </label>
      {paramsNode && params ? (
        <div className="grid gap-3 md:grid-cols-2">
          <RangeField label={labels.duration} value={Number(params.duration || durationMin)} min={durationMin} max={durationMax} onChange={(duration) => onChangeNode(paramsNode.id, { duration })} />
          <Select label={labels.aspectRatio} value={String(params.aspect_ratio || "9:16")} values={withCurrent(ratioOptions, String(params.aspect_ratio || "9:16"))} onChange={(value) => onChangeNode(paramsNode.id, { aspect_ratio: value })} />
          <Select label={labels.resolution} value={String(params.resolution || "1080p")} values={withCurrent(resolutionOptions, String(params.resolution || "1080p"))} onChange={(value) => onChangeNode(paramsNode.id, { resolution: value })} />
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">{labels.seed}</span>
            <input value={params.seed == null ? "" : String(params.seed)} onChange={(event) => onChangeNode(paramsNode.id, { seed: event.target.value.trim() ? Number(event.target.value) : null })} className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-[12px] focus:border-signal/45 focus:outline-none" />
          </label>
        </div>
      ) : (
        <div className="rounded-md border border-border/80 bg-background px-3 py-2 text-[12px] text-muted-foreground">{labels.paramsNode}</div>
      )}
    </div>
  )
}

function attachedInspectorFrame(node: CanvasNode) {
  const nodeType = String(node.data.node_type || "")
  const height = node.measured?.height ?? node.height ?? 86
  const nodeWidth = node.measured?.width ?? node.width ?? 256
  const preferredWidth =
    nodeType === "prompt.input" ? 520 :
      nodeType === "image.input" ? 420 :
        nodeType === "video.params" ? 360 :
      nodeType === "seedance.video" ? 480 :
            320
  return {
    x: node.position.x,
    y: node.position.y + height + 16,
    width: Math.max(nodeWidth, preferredWidth),
  }
}

function getVideoNodeContext(node: CanvasNode | null, nodes: CanvasNode[], edges: CanvasEdge[]): VideoNodeContext {
  if (!node || String(node.data.node_type) !== "seedance.video") {
    return { promptNode: null, paramsNode: null }
  }
  const upstreamIds = new Set(edges.filter((edge) => edge.target === node.id).map((edge) => edge.source))
  return {
    promptNode: nodes.find((item) => upstreamIds.has(item.id) && String(item.data.node_type) === "prompt.input") ?? null,
    paramsNode: nodes.find((item) => upstreamIds.has(item.id) && String(item.data.node_type) === "video.params") ?? null,
  }
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

function withCurrent(values: string[], current: string) {
  if (!current || values.includes(current)) return values
  return [current, ...values]
}
