import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Edge, ReactFlowInstance } from "@xyflow/react";
import {
  AlertTriangle,
  ArrowRight,
  BoxSelect,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Command,
  EyeOff,
  FileText,
  GitBranch,
  GripVertical,
  Image,
  KeyRound,
  LibraryBig,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { buildGeneratePayload, formatPreflightFindings, runGenerationPreflight } from "@/lib/generation";
import { sidecarFetch } from "@/lib/sidecar";
import { useAppStore, type StoryflowMode } from "@/stores/app-store";
import { useDirectorStore, type Shot, type ShotGenerationCard } from "@/stores/director-store";
import { Button, EmptyState, FieldShell, MediaThumb, Pill, Surface } from "@/components/ui/kit";
import { CanvasToolbar } from "./CanvasToolbar";
import { FloatingModeSwitcher } from "./FloatingModeSwitcher";
import { InspectorDrawer } from "./InspectorDrawer";
import { PreviewDock } from "./PreviewDock";
import { StoryflowCanvas } from "./StoryflowCanvas";
import { TimelineDock } from "./TimelineDock";
import { safeMediaSrc } from "./media";
import { buildStoryflowGraph, type StoryflowNode, type StoryflowNodeAction, type StoryflowNodeData } from "./storyflow-types";

function isTextInput(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

function reindexShots(shots: Shot[]) {
  return shots.map((shot, index) => ({ ...shot, index: index + 1 }));
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function createStoryflowId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeNewShot(after?: Shot): Shot {
  const index = (after?.index ?? 0) + 1;
  return {
    id: createStoryflowId("shot"),
    scene_id: after?.scene_id || "scene_1",
    index,
    title: `新镜头 ${index}`,
    duration: after?.duration || 5,
    prompt: after?.prompt || "描述主体、动作、场景、光线和镜头语言。",
    negative_prompt: after?.negative_prompt || "",
    status: "planned",
    video_url: "",
    thumbnail_url: after?.thumbnail_url || "",
    camera: after?.camera || "平滑推进，主体清晰，运动强度中等。",
    generationParams: {
      shot_script: "新增镜头，等待补充动作拆解。",
      constraints: "",
      audio_cues: [],
      reference_instructions: [],
    },
    qualityScore: null,
  };
}

function makeShotCard(shot: Shot, source?: ShotGenerationCard): ShotGenerationCard {
  return {
    shot_id: shot.id,
    prompt_role: source?.prompt_role || "storyflow.generated",
    motion_contract: source?.motion_contract || shot.generationParams?.shot_script || shot.prompt,
    camera_contract: source?.camera_contract || shot.camera,
    reference_contract: source?.reference_contract || "继承当前参考栈，按镜头语义补充局部参考。",
    risk_flags: source?.risk_flags || [],
    edit_note: source?.edit_note || "通过流程画布新增，建议复核节奏和连续性。",
  };
}

type CanvasRunKey = "new_shot" | "prompt" | "reference" | "camera" | "storyboard" | "preflight" | "generate";
type CanvasRunStatus = "idle" | "running" | "complete" | "failed";

const NODE_LIBRARY: Array<{
  id: CanvasRunKey;
  title: string;
  subtitle: string;
  group: string;
  icon: React.ReactNode;
  primary?: boolean;
}> = [
  {
    id: "new_shot",
    title: "新增镜头",
    subtitle: "新增一个可生成镜头，自动继承当前上下文",
    group: "结构",
    icon: <Plus className="h-4 w-4" />,
    primary: true,
  },
  {
    id: "prompt",
    title: "提示词拆解",
    subtitle: "把当前 brief 注入镜头脚本和提示词结构",
    group: "规划",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    id: "reference",
    title: "参考素材",
    subtitle: "把素材库参考图/视频/音频写入生成参数",
    group: "一致性",
    icon: <Image className="h-4 w-4" />,
  },
  {
    id: "camera",
    title: "运镜设计",
    subtitle: "生成可执行运镜说明，绑定镜头运动",
    group: "镜头语言",
    icon: <Camera className="h-4 w-4" />,
  },
  {
    id: "storyboard",
    title: "分镜关键帧",
    subtitle: "生成分镜图、首帧、尾帧并写回参考图",
    group: "资产生产",
    icon: <WandSparkles className="h-4 w-4" />,
    primary: true,
  },
  {
    id: "preflight",
    title: "生成前检查",
    subtitle: "检查提示词、参考、时长和生成服务限制",
    group: "生成前检查",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  {
    id: "generate",
    title: "生成镜头",
    subtitle: "通过预检后提交视频生成任务",
    group: "生成",
    icon: <Play className="h-4 w-4" />,
    primary: true,
  },
];

function uniqueCompact(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}

function modeTitle(mode: StoryflowMode) {
  const titles: Record<StoryflowMode, string> = {
    storyflow: "流程画布",
    focus: "沉浸画布",
    review: "分屏复核",
    timeline: "时间线精修",
  };
  return titles[mode];
}

export function StoryflowWorkspace() {
  const storyflowMode = useAppStore((s) => s.storyflowMode);
  const setStoryflowMode = useAppStore((s) => s.setStoryflowMode);
  const setWorkspaceCleanMode = useAppStore((s) => s.setWorkspaceCleanMode);
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const selectedShotId = useAppStore((s) => s.selectedShotId);
  const setSelectedShotId = useAppStore((s) => s.setSelectedShotId);

  const prompt = useDirectorStore((s) => s.prompt);
  const structuredPrompt = useDirectorStore((s) => s.structuredPrompt);
  const references = useDirectorStore((s) => s.references);
  const shots = useDirectorStore((s) => s.shots);
  const setShots = useDirectorStore((s) => s.setShots);
  const updateShot = useDirectorStore((s) => s.updateShot);
  const planId = useDirectorStore((s) => s.planId);
  const shotGenerationCards = useDirectorStore((s) => s.shotGenerationCards);
  const setShotGenerationCards = useDirectorStore((s) => s.setShotGenerationCards);
  const isRunning = useDirectorStore((s) => s.isRunning);
  const promptReview = useDirectorStore((s) => s.promptReview);
  const pipeline = useDirectorStore((s) => s.pipeline);
  const aspectRatio = useDirectorStore((s) => s.aspectRatio);
  const selectedWorkflow = useDirectorStore((s) => s.selectedWorkflow);

  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [runState, setRunState] = useState<Record<CanvasRunKey, CanvasRunStatus>>({
    new_shot: "idle",
    prompt: "idle",
    reference: "idle",
    camera: "idle",
    storyboard: "idle",
    preflight: "idle",
    generate: "idle",
  });
  const [runMessage, setRunMessage] = useState("");
  const [syncState, setSyncState] = useState<"local" | "saving" | "saved" | "offline">("local");
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [layoutNonce, setLayoutNonce] = useState(0);
  const flowRef = useRef<ReactFlowInstance<StoryflowNode, Edge> | null>(null);
  const graphNodesRef = useRef<StoryflowNode[]>([]);
  const selectedNodeIdsRef = useRef<string[]>([]);
  const selectedShotIdRef = useRef<string | null>(null);
  const inspectorOpenRef = useRef(false);
  const pendingShotPatchesRef = useRef(new Map<string, Partial<Shot>>());
  const patchTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const graph = useMemo(
    () => buildStoryflowGraph({ prompt, structuredPrompt, references, shots, cards: shotGenerationCards }),
    [prompt, references, shotGenerationCards, shots, structuredPrompt]
  );
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) || null;
  const selectedNode = graph.nodes.find((node) => selectedNodeIds.includes(node.id))?.data || null;
  const selectedCard = selectedShot ? shotGenerationCards.find((card) => card.shot_id === selectedShot.id) : undefined;
  const selectedIndex = selectedShot ? shots.findIndex((shot) => shot.id === selectedShot.id) : -1;
  const modeIsFocus = storyflowMode === "focus";

  useEffect(() => {
    graphNodesRef.current = graph.nodes;
  }, [graph.nodes]);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  useEffect(() => {
    selectedShotIdRef.current = selectedShotId;
  }, [selectedShotId]);

  useEffect(() => {
    inspectorOpenRef.current = inspectorOpen;
  }, [inspectorOpen]);

  useEffect(() => {
    setWorkspaceCleanMode(modeIsFocus);
    return () => setWorkspaceCleanMode(false);
  }, [modeIsFocus, setWorkspaceCleanMode]);

  useEffect(() => () => {
    patchTimersRef.current.forEach((timer) => clearTimeout(timer));
    patchTimersRef.current.clear();
    pendingShotPatchesRef.current.clear();
  }, []);

  useEffect(() => {
    if (selectedShotId || shots.length === 0) return;
    setSelectedShotId(shots[0].id);
    const nextSelection = [`shot_${shots[0].id}`];
    selectedNodeIdsRef.current = nextSelection;
    setSelectedNodeIds(nextSelection);
  }, [selectedShotId, setSelectedShotId, shots]);

  useEffect(() => {
    if (!selectedShotId) return;
    const nodeId = `shot_${selectedShotId}`;
    const current = selectedNodeIdsRef.current;
    if (current.includes(nodeId)) return;
    if (current.length > 0 && current.every((id) => id.startsWith("shot_"))) {
      selectedNodeIdsRef.current = [nodeId];
      setSelectedNodeIds([nodeId]);
    }
  }, [selectedShotId]);

  const runSidecarMutation = useCallback((task: () => Promise<unknown>) => {
    if (!planId) {
      setSyncState("local");
      return;
    }
    setSyncState("saving");
    void task()
      .then(() => setSyncState("saved"))
      .catch(() => setSyncState("offline"));
  }, [planId]);

  const persistShotPatch = useCallback((shotId: string, patch: Partial<Shot>) => {
    if (!planId) return;
    const merged = { ...pendingShotPatchesRef.current.get(shotId), ...patch };
    pendingShotPatchesRef.current.set(shotId, merged);
    const currentTimer = patchTimersRef.current.get(shotId);
    if (currentTimer) clearTimeout(currentTimer);
    setSyncState("saving");
    const timer = setTimeout(() => {
      const nextPatch = pendingShotPatchesRef.current.get(shotId);
      pendingShotPatchesRef.current.delete(shotId);
      patchTimersRef.current.delete(shotId);
      if (!nextPatch) return;
      runSidecarMutation(() => sidecarFetch(`/director/plan/${planId}/shot/${shotId}`, {
        method: "PATCH",
        body: JSON.stringify(nextPatch),
      }, 0));
    }, 450);
    patchTimersRef.current.set(shotId, timer);
  }, [planId, runSidecarMutation]);

  const handleUpdateShot = useCallback((shotId: string, patch: Partial<Shot>) => {
    updateShot(shotId, patch);
    persistShotPatch(shotId, patch);
  }, [persistShotPatch, updateShot]);

  const syncReorder = useCallback((nextShots: Shot[]) => {
    if (!planId) return;
    runSidecarMutation(() => sidecarFetch(`/director/plan/${planId}/reorder`, {
      method: "POST",
      body: JSON.stringify({ shot_ids: nextShots.map((shot) => shot.id) }),
    }, 0));
  }, [planId, runSidecarMutation]);

  const syncCreateShot = useCallback((shot: Shot, card: ShotGenerationCard, afterId?: string) => {
    if (!planId) return;
    runSidecarMutation(() => sidecarFetch(`/director/plan/${planId}/shot`, {
      method: "POST",
      body: JSON.stringify({ shot, card, after_id: afterId ?? null }),
    }, 0));
  }, [planId, runSidecarMutation]);

  const syncDeleteShot = useCallback((shotId: string) => {
    if (!planId) return;
    runSidecarMutation(() => sidecarFetch(`/director/plan/${planId}/shot/${shotId}`, {
      method: "DELETE",
    }, 0));
  }, [planId, runSidecarMutation]);

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const updated = [...shots];
    const [moved] = updated.splice(fromIndex, 1);
    if (!moved) return;
    updated.splice(toIndex, 0, moved);
    const nextShots = reindexShots(updated);
    setShots(nextShots);
    syncReorder(nextShots);
  }, [setShots, shots, syncReorder]);

  const selectShot = useCallback((shotId: string) => {
    setSelectedShotId(shotId);
    const nextSelection = [`shot_${shotId}`];
    selectedShotIdRef.current = shotId;
    selectedNodeIdsRef.current = nextSelection;
    setSelectedNodeIds(nextSelection);
    setInspectorOpen(true);
    inspectorOpenRef.current = true;
    setFocusNodeId(`shot_${shotId}`);
  }, [setSelectedShotId]);

  const inspectNode = useCallback((node: StoryflowNodeData) => {
    setSelectedNodeIds((current) => current.length ? current : ["intent"]);
    if (node.kind === "shot" && node.shotId) setSelectedShotId(node.shotId);
    setInspectorOpen(true);
  }, [setSelectedShotId]);

  const handleSelectionChange = useCallback((nodeIds: string[]) => {
    const nextIds = Array.from(new Set(nodeIds));
    if (!arraysEqual(selectedNodeIdsRef.current, nextIds)) {
      selectedNodeIdsRef.current = nextIds;
      setSelectedNodeIds(nextIds);
    }
    if (nextIds.length === 0) {
      if (selectedShotIdRef.current !== null) {
        selectedShotIdRef.current = null;
        setSelectedShotId(null);
      }
      if (inspectorOpenRef.current) {
        inspectorOpenRef.current = false;
        setInspectorOpen(false);
      }
      return;
    }
    const shotNode = graphNodesRef.current.find((node) => nextIds.includes(node.id) && node.data.kind === "shot");
    if (shotNode?.data.shotId && shotNode.data.shotId !== selectedShotIdRef.current) {
      selectedShotIdRef.current = shotNode.data.shotId;
      setSelectedShotId(shotNode.data.shotId);
    }
  }, [setSelectedShotId]);

  const addShot = useCallback(() => {
    const anchor = selectedShot || shots[shots.length - 1];
    const nextShot = makeNewShot(anchor);
    const insertAt = anchor ? Math.max(0, shots.findIndex((shot) => shot.id === anchor.id) + 1) : shots.length;
    const nextShots = reindexShots([...shots.slice(0, insertAt), nextShot, ...shots.slice(insertAt)]);
    const nextCard = makeShotCard(nextShot, selectedCard);
    setShots(nextShots);
    setShotGenerationCards([...shotGenerationCards, nextCard]);
    selectShot(nextShot.id);
    syncCreateShot(nextShot, nextCard, anchor?.id);
  }, [selectShot, selectedCard, selectedShot, setShotGenerationCards, setShots, shotGenerationCards, shots, syncCreateShot]);

  const setNodeRunStatus = useCallback((key: CanvasRunKey, status: CanvasRunStatus, message?: string) => {
    setRunState((state) => ({ ...state, [key]: status }));
    if (message) setRunMessage(message);
  }, []);

  const applyPromptNode = useCallback((shot: Shot) => {
    const script = uniqueCompact([
      structuredPrompt.subject && `主体：${structuredPrompt.subject}`,
      structuredPrompt.action && `动作：${structuredPrompt.action}`,
      structuredPrompt.scene && `场景：${structuredPrompt.scene}`,
      structuredPrompt.lighting && `光线：${structuredPrompt.lighting}`,
      structuredPrompt.audio && `声音：${structuredPrompt.audio}`,
    ]).join("；");
    const nextPrompt = uniqueCompact([
      shot.prompt,
      structuredPrompt.style && `style: ${structuredPrompt.style}`,
      structuredPrompt.constraints && `constraints: ${structuredPrompt.constraints}`,
    ]).join("\n");
    handleUpdateShot(shot.id, {
      prompt: nextPrompt || shot.prompt,
      generationParams: {
        ...shot.generationParams,
        shot_script: script || shot.generationParams?.shot_script || shot.prompt,
        constraints: structuredPrompt.constraints || shot.generationParams?.constraints,
        audio_cues: uniqueCompact([...(shot.generationParams?.audio_cues || []), structuredPrompt.audio]),
      },
    });
  }, [handleUpdateShot, structuredPrompt]);

  const attachReferenceStack = useCallback((shot: Shot) => {
    const imageUrls = references
      .filter((item) => item.type === "image")
      .map((item) => safeMediaSrc(item.url))
      .filter((url): url is string => Boolean(url));
    const videoUrls = references
      .filter((item) => item.type === "video")
      .map((item) => safeMediaSrc(item.url))
      .filter((url): url is string => Boolean(url));
    const audioUrls = references
      .filter((item) => item.type === "audio")
      .map((item) => safeMediaSrc(item.url))
      .filter((url): url is string => Boolean(url));
    const fallbackImage = safeMediaSrc(shot.thumbnail_url);
    handleUpdateShot(shot.id, {
      generationParams: {
        ...shot.generationParams,
        image_urls: uniqueCompact([...(shot.generationParams?.image_urls || []), ...imageUrls, fallbackImage]).slice(0, 9),
        video_urls: uniqueCompact([...(shot.generationParams?.video_urls || []), ...videoUrls]).slice(0, 4),
        audio_urls: uniqueCompact([...(shot.generationParams?.audio_urls || []), ...audioUrls]).slice(0, 4),
        reference_instructions: uniqueCompact([
          ...(shot.generationParams?.reference_instructions || []),
          "保持已附加参考素材中的身份、材质、色彩和构图。",
          references.length ? `参考素材优先级：${references.map((item) => item.name || item.role).slice(0, 4).join(" > ")}` : "",
        ]),
      },
    });
  }, [handleUpdateShot, references]);

  const applyCameraMotion = useCallback((shot: Shot) => {
    const camera = structuredPrompt.camera || shot.camera || "平滑推进，主体居中，轻微视差，稳定构图，运动强度中等。";
    handleUpdateShot(shot.id, {
      camera,
      generationParams: {
        ...shot.generationParams,
        motion_desc: camera,
        reference_instructions: uniqueCompact([
          ...(shot.generationParams?.reference_instructions || []),
          "遵循镜头语言节点：只保留一个明确运镜，主体稳定，不叠加互相冲突的运动。",
        ]),
      },
    });
  }, [handleUpdateShot, structuredPrompt.camera]);

  const generateStoryboardAssets = useCallback(async (shot: Shot) => {
    const res = await sidecarFetch<{
      status: string;
      assets?: Array<{ url: string; role: string; description: string; prompt: string }>;
    }>("/agents/generate-storyboard-assets", {
      method: "POST",
      body: JSON.stringify({
        shot_id: shot.id,
        title: shot.title,
        prompt: shot.prompt,
        shot_script: shot.generationParams?.shot_script || "",
        first_frame_desc: shot.generationParams?.first_frame_desc || "",
        last_frame_desc: shot.generationParams?.last_frame_desc || "",
        motion_desc: shot.generationParams?.motion_desc || shot.camera,
        aspect_ratio: aspectRatio,
        modes: ["storyboard_keyframe", "first_frame", "last_frame"],
      }),
    });
    const assets = (res.assets || []).filter((asset) => asset.url);
    if (!assets.length) throw new Error("没有返回可用分镜图资产");
    const storyboard = assets.find((asset) => asset.role === "storyboard_keyframe") || assets[0];
    const firstFrame = assets.find((asset) => asset.role === "first_frame");
    const lastFrame = assets.find((asset) => asset.role === "last_frame");
    handleUpdateShot(shot.id, {
      thumbnail_url: storyboard.url || shot.thumbnail_url,
      generationParams: {
        ...shot.generationParams,
        storyboard_image_url: storyboard.url,
        first_frame_image_url: firstFrame?.url || shot.generationParams?.first_frame_image_url,
        last_frame_image_url: lastFrame?.url || shot.generationParams?.last_frame_image_url,
        image_urls: uniqueCompact([...(shot.generationParams?.image_urls || []), ...assets.map((asset) => asset.url)]).slice(0, 9),
        reference_instructions: uniqueCompact([
          ...(shot.generationParams?.reference_instructions || []),
          storyboard?.url ? "使用生成的分镜关键帧锁定构图和主体位置。" : "",
          firstFrame?.url ? "使用生成的首帧作为视频起始参考。" : "",
          lastFrame?.url ? "使用生成的尾帧作为视频收束连续性目标。" : "",
        ]),
      },
    });
  }, [aspectRatio, handleUpdateShot]);

  const runPreflight = useCallback(async (shot: Shot) => {
    const payload = buildGeneratePayload({ shot, pipeline, aspectRatio, workflow: selectedWorkflow });
    const preflight = await runGenerationPreflight([payload], true);
    if (preflight.status === "blocked") {
      const message = formatPreflightFindings(preflight);
      handleUpdateShot(shot.id, { status: "failed" });
      throw new Error(message);
    }
    return payload;
  }, [aspectRatio, handleUpdateShot, pipeline, selectedWorkflow]);

  const submitGenerate = useCallback(async (shot: Shot) => {
    const payload = await runPreflight(shot);
    handleUpdateShot(shot.id, { status: "queued", video_url: "" });
    await sidecarFetch("/generate/submit", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }, [handleUpdateShot, runPreflight]);

  const executeCanvasNode = useCallback(async (key: CanvasRunKey): Promise<boolean> => {
    const shot = selectedShot || (selectedShotId ? shots.find((item) => item.id === selectedShotId) || null : shots[0] || null);
    setNodeRunStatus(key, "running");
    try {
      if (key === "new_shot") {
        addShot();
        setNodeRunStatus(key, "complete", "已新增镜头，并继承当前流程画布上下文。");
        return true;
      }
      if (!shot) throw new Error("请先选择一个镜头节点。");
      if (key === "prompt") {
        applyPromptNode(shot);
        setNodeRunStatus(key, "complete", "提示词拆解已写入当前镜头。");
        return true;
      }
      if (key === "reference") {
        attachReferenceStack(shot);
        setNodeRunStatus(key, "complete", "参考素材已写入图片、视频和音频引用。");
        return true;
      }
      if (key === "camera") {
        applyCameraMotion(shot);
        setNodeRunStatus(key, "complete", "镜头语言已绑定到当前镜头。");
        return true;
      }
      if (key === "storyboard") {
        await generateStoryboardAssets(shot);
        setNodeRunStatus(key, "complete", "分镜图、首帧、尾帧已生成并回写。");
        return true;
      }
      if (key === "preflight") {
        await runPreflight(shot);
        handleUpdateShot(shot.id, { status: shot.video_url ? "succeeded" : "planned" });
        setNodeRunStatus(key, "complete", "生成前检查通过，可以提交生成。");
        return true;
      }
      if (key === "generate") {
        await submitGenerate(shot);
        setNodeRunStatus(key, "complete", "已提交生成任务，镜头进入队列。");
        return true;
      }
    } catch (error) {
      setNodeRunStatus(key, "failed", error instanceof Error ? error.message : "节点运行失败。");
      return false;
    }
    return true;
  }, [addShot, applyCameraMotion, applyPromptNode, attachReferenceStack, generateStoryboardAssets, handleUpdateShot, runPreflight, selectedShot, selectedShotId, setNodeRunStatus, shots, submitGenerate]);

  const runProductionPrepChain = useCallback(async () => {
    const chain: CanvasRunKey[] = ["prompt", "reference", "camera", "storyboard", "preflight"];
    for (const key of chain) {
      const ok = await executeCanvasNode(key);
      if (!ok) return;
    }
  }, [executeCanvasNode]);

  const runSelectedNode = useCallback(() => {
    const node = selectedNodeIds[0] ? graph.nodes.find((item) => item.id === selectedNodeIds[0]) : null;
    if (node?.data.kind === "prompt" || node?.data.kind === "intent") void executeCanvasNode("prompt");
    else if (node?.data.kind === "reference") void executeCanvasNode("reference");
    else if (node?.data.kind === "camera") void executeCanvasNode("camera");
    else if (node?.data.kind === "output") void executeCanvasNode("generate");
    else if (node?.data.kind === "review") void executeCanvasNode("preflight");
    else if (selectedShot && !selectedShot.thumbnail_url) void executeCanvasNode("storyboard");
    else if (selectedShot) void executeCanvasNode("generate");
    else void executeCanvasNode("new_shot");
  }, [executeCanvasNode, graph.nodes, selectedNodeIds, selectedShot]);

  const duplicateShot = useCallback((source: Shot) => {
    if (!source) return;
    const sourceCard = shotGenerationCards.find((card) => card.shot_id === source.id);
    const duplicated: Shot = {
      ...source,
      id: createStoryflowId("shot"),
      title: `${source.title} 副本`,
      index: source.index + 1,
      status: "planned",
      video_url: "",
    };
    const sourceIndex = shots.findIndex((shot) => shot.id === source.id);
    const nextShots = reindexShots([...shots.slice(0, sourceIndex + 1), duplicated, ...shots.slice(sourceIndex + 1)]);
    const nextCard = makeShotCard(duplicated, sourceCard);
    setShots(nextShots);
    setShotGenerationCards([...shotGenerationCards, nextCard]);
    selectShot(duplicated.id);
    syncCreateShot(duplicated, nextCard, source.id);
  }, [selectShot, setShotGenerationCards, setShots, shotGenerationCards, shots, syncCreateShot]);

  const duplicateSelected = useCallback(() => {
    const source = selectedShot || shots.find((shot) => selectedNodeIdsRef.current.includes(`shot_${shot.id}`));
    if (source) duplicateShot(source);
  }, [duplicateShot, selectedShot, shots]);

  const deleteShot = useCallback((target: Shot) => {
    if (!target) return;
    const nextShots = reindexShots(shots.filter((shot) => shot.id !== target.id));
    setShots(nextShots);
    setShotGenerationCards(shotGenerationCards.filter((card) => card.shot_id !== target.id));
    const nextSelection = nextShots[Math.max(0, Math.min(target.index - 1, nextShots.length - 1))];
    if (nextSelection) {
      selectShot(nextSelection.id);
    } else {
      setSelectedShotId(null);
      selectedShotIdRef.current = null;
      selectedNodeIdsRef.current = [];
      setSelectedNodeIds([]);
    }
    syncDeleteShot(target.id);
  }, [selectShot, setSelectedShotId, setShotGenerationCards, setShots, shotGenerationCards, shots, syncDeleteShot]);

  const deleteSelected = useCallback(() => {
    const target = selectedShot || shots.find((shot) => selectedNodeIdsRef.current.includes(`shot_${shot.id}`));
    if (target) deleteShot(target);
  }, [deleteShot, selectedShot, shots]);

  const handleNodeAction = useCallback((action: StoryflowNodeAction, node: StoryflowNodeData) => {
    if (node.shotId) selectShot(node.shotId);
    if (action === "focus") {
      setFocusNodeId(node.shotId ? `shot_${node.shotId}` : graph.nodes.find((item) => item.data.title === node.title)?.id || null);
    }
    if (action === "duplicate") {
      const source = node.shotId ? shots.find((shot) => shot.id === node.shotId) : null;
      if (source) duplicateShot(source);
    }
    if (action === "delete") {
      const target = node.shotId ? shots.find((shot) => shot.id === node.shotId) : null;
      if (target) deleteShot(target);
    }
    if (action === "inspect") setInspectorOpen(true);
  }, [deleteShot, duplicateShot, graph.nodes, selectShot, shots]);

  const focusSelected = useCallback(() => {
    const targetNodeId = selectedNodeIds[0] || (selectedShotId ? `shot_${selectedShotId}` : graph.nodes[0]?.id);
    if (!targetNodeId) return;
    setFocusNodeId(targetNodeId);
  }, [graph.nodes, selectedNodeIds, selectedShotId]);

  const fitView = useCallback(() => setFitNonce((value) => value + 1), []);
  const autoLayout = useCallback(() => setLayoutNonce((value) => value + 1), []);

  const moveSelection = useCallback((direction: -1 | 1) => {
    if (shots.length === 0) return;
    const current = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = Math.max(0, Math.min(shots.length - 1, current + direction));
    selectShot(shots[nextIndex].id);
  }, [selectedIndex, selectShot, shots]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();

      if (key === "p" && !mod) {
        event.preventDefault();
        setStoryflowMode(storyflowMode === "focus" ? "storyflow" : "focus");
        return;
      }
      if (key === "f" && !mod) {
        event.preventDefault();
        focusSelected();
        return;
      }
      if (key === "enter") {
        event.preventDefault();
        setInspectorOpen(true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (inspectorOpen) setInspectorOpen(false);
        else if (storyflowMode === "focus") setStoryflowMode("storyflow");
        else handleSelectionChange([]);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeIds.length > 0) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (mod && key === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && event.key === "0") {
        event.preventDefault();
        fitView();
        return;
      }
      if (mod && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        void flowRef.current?.zoomIn({ duration: 180 });
        return;
      }
      if (mod && event.key === "-") {
        event.preventDefault();
        void flowRef.current?.zoomOut({ duration: 180 });
        return;
      }
      if (event.key === "[") moveSelection(-1);
      if (event.key === "]") moveSelection(1);
      if (event.key === "?") setShortcutsOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, duplicateSelected, fitView, focusSelected, handleSelectionChange, inspectorOpen, moveSelection, selectedNodeIds.length, setStoryflowMode, storyflowMode]);

  if (shots.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-nc-bg">
        <WorkbenchHeader
          mode={storyflowMode}
          isRunning={isRunning}
          syncState={syncState}
          totalShots={0}
          totalDuration={0}
          onModeChange={setStoryflowMode}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            icon={<Sparkles className="h-7 w-7" />}
            title="先从 AI 导演生成一组镜头"
            description="流程画布会把用户意图、参考素材、提示词策略、镜头语言、分镜和时间线串成一个可编辑的创意结构。"
            action={
              <Button variant="primary" onClick={() => setSidebarPage("agents")}>
                去 AI 导演生成
                <ArrowRight className="h-4 w-4" />
              </Button>
            }
            className="w-full max-w-[760px] py-20"
          />
        </div>
        {shortcutsOpen && <ShortcutsPopover onClose={() => setShortcutsOpen(false)} />}
      </div>
    );
  }

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden bg-nc-bg", modeIsFocus && "bg-[#F7F8FC]")}>
      {!modeIsFocus && (
        <WorkbenchHeader
          mode={storyflowMode}
          isRunning={isRunning}
          syncState={syncState}
          totalShots={shots.length}
          totalDuration={graph.totalDuration}
          onModeChange={setStoryflowMode}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
      )}

      {storyflowMode === "storyflow" && (
        <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-5 px-7 py-5">
          <SceneOutline
            open={outlineOpen}
            shots={shots}
            selectedShotId={selectedShotId}
            onToggle={() => setOutlineOpen((open) => !open)}
            onSelectShot={selectShot}
            onAddShot={addShot}
          />
          <div className="relative min-h-0">
            <div className="pointer-events-none absolute left-5 top-5 z-20 flex items-start gap-3">
              <CanvasToolbar
                selectedCount={selectedNodeIds.length}
                onAutoLayout={autoLayout}
                onFit={fitView}
                onToggleInspector={() => setInspectorOpen((open) => !open)}
                onOpenLibrary={() => setNodeLibraryOpen((open) => !open)}
                onRunSelected={runSelectedNode}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
              />
            </div>
            {nodeLibraryOpen && (
              <NodeLibraryDrawer
                runState={runState}
                selectedShot={selectedShot}
                onClose={() => setNodeLibraryOpen(false)}
                onRun={(key) => void executeCanvasNode(key)}
              />
            )}
            <CanvasRunDock
              runState={runState}
              message={runMessage}
              selectedShot={selectedShot}
              storageKey="nextcut.storyflow.runDock.storyflow"
              defaultPlacement="top-right"
              rightInset={inspectorOpen ? 420 : 24}
              onRun={(key) => void executeCanvasNode(key)}
              onRunChain={() => void runProductionPrepChain()}
            />
            <StoryflowCanvas
              baseNodes={graph.nodes}
              baseEdges={graph.edges}
              selectedNodeIds={selectedNodeIds}
              focusNodeId={focusNodeId}
              fitNonce={fitNonce}
              layoutNonce={layoutNonce}
              initialZoom={0.72}
              initialYOffset={130}
              onReady={(instance) => { flowRef.current = instance; }}
              onSelectionChange={handleSelectionChange}
              onInspectNode={inspectNode}
              onNodeAction={handleNodeAction}
            />
            <InspectorDrawer
              node={selectedNode}
              shot={selectedShot}
              card={selectedCard}
              open={inspectorOpen}
              overlay
              onClose={() => setInspectorOpen(false)}
              onUpdateShot={handleUpdateShot}
            />
            <div className={cn("absolute bottom-5 left-5 z-20", inspectorOpen ? "right-[420px]" : "right-5")}>
              <TimelineDock
                shots={shots}
                selectedShotId={selectedShotId}
                variant="mini"
                playbackActive={playbackActive}
                onSelectShot={selectShot}
                onReorder={handleReorder}
                onUpdateDuration={(shotId, duration) => handleUpdateShot(shotId, { duration })}
              />
            </div>
          </div>
        </div>
      )}

      {storyflowMode === "focus" && (
        <div className="relative min-h-0 flex-1 p-4">
          <div className="pointer-events-none absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-3">
            <div className="pointer-events-auto">
              <FloatingModeSwitcher mode={storyflowMode} onChange={setStoryflowMode} compact />
            </div>
            <div className="pointer-events-auto">
              <CanvasToolbar
                selectedCount={selectedNodeIds.length}
                onAutoLayout={autoLayout}
                onFit={fitView}
                onToggleInspector={() => setInspectorOpen((open) => !open)}
                onOpenLibrary={() => setNodeLibraryOpen((open) => !open)}
                onRunSelected={runSelectedNode}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
              />
            </div>
            <Button size="sm" variant="primary" className="pointer-events-auto" onClick={() => setStoryflowMode("storyflow")}>
              <Minimize2 className="h-4 w-4" />
              退出纯净
            </Button>
          </div>
          <StoryflowCanvas
            baseNodes={graph.nodes}
            baseEdges={graph.edges}
            selectedNodeIds={selectedNodeIds}
            focusNodeId={focusNodeId}
            fitNonce={fitNonce}
            layoutNonce={layoutNonce}
            initialZoom={0.82}
            onReady={(instance) => { flowRef.current = instance; }}
            onSelectionChange={handleSelectionChange}
            onInspectNode={inspectNode}
            onNodeAction={handleNodeAction}
          />
          {nodeLibraryOpen && (
            <NodeLibraryDrawer
              runState={runState}
              selectedShot={selectedShot}
              compact
              onClose={() => setNodeLibraryOpen(false)}
              onRun={(key) => void executeCanvasNode(key)}
            />
          )}
          <CanvasRunDock
            runState={runState}
            message={runMessage}
            selectedShot={selectedShot}
            storageKey="nextcut.storyflow.runDock.focus"
            defaultPlacement="top-right"
            rightInset={24}
            onRun={(key) => void executeCanvasNode(key)}
            onRunChain={() => void runProductionPrepChain()}
          />
          <div className="absolute bottom-6 left-6 z-30 flex items-center gap-2 rounded-[18px] border border-nc-border bg-white/92 p-2 shadow-[0_14px_38px_rgba(15,23,42,0.12)] backdrop-blur">
            <Pill tone="accent"><BoxSelect className="mr-1 h-3.5 w-3.5" />Space 拖拽</Pill>
            <Pill tone="neutral">P 纯净</Pill>
            <Pill tone="neutral">F 聚焦</Pill>
            <Pill tone="neutral">⌘0 适配</Pill>
          </div>
          <InspectorDrawer
            node={selectedNode}
            shot={selectedShot}
            card={selectedCard}
            open={inspectorOpen}
            overlay
            onClose={() => setInspectorOpen(false)}
            onUpdateShot={handleUpdateShot}
          />
        </div>
      )}

      {storyflowMode === "review" && (
        <div className="grid min-h-0 flex-1 grid-cols-[330px_minmax(0,1fr)_390px] gap-5 px-7 py-5">
          <ReviewShotRail
            shots={shots}
            selectedShotId={selectedShotId}
            onSelectShot={selectShot}
            onAddShot={addShot}
          />
          <div className="flex min-h-0 flex-col gap-5">
            <Surface className="min-h-0 flex-1 overflow-hidden rounded-[20px] p-3">
              <StoryflowCanvas
                baseNodes={graph.nodes}
                baseEdges={graph.edges}
                selectedNodeIds={selectedNodeIds}
                focusNodeId={focusNodeId}
                fitNonce={fitNonce}
                layoutNonce={layoutNonce}
                initialZoom={0.56}
                onReady={(instance) => { flowRef.current = instance; }}
                onSelectionChange={handleSelectionChange}
                onInspectNode={inspectNode}
                onNodeAction={handleNodeAction}
              />
            </Surface>
            <TimelineDock
              shots={shots}
              selectedShotId={selectedShotId}
              variant="review"
              playbackActive={playbackActive}
              onSelectShot={selectShot}
              onReorder={handleReorder}
              onUpdateDuration={(shotId, duration) => handleUpdateShot(shotId, { duration })}
            />
          </div>
          <div className="flex min-h-0 flex-col gap-5 overflow-hidden">
            <PreviewDock
              shot={selectedShot}
              index={selectedIndex}
              total={shots.length}
              onPrev={() => moveSelection(-1)}
              onNext={() => moveSelection(1)}
              playbackActive={playbackActive}
              onTogglePlayback={() => setPlaybackActive((active) => !active)}
            />
            <div className="min-h-0 flex-1 overflow-hidden rounded-[20px]">
              <InspectorDrawer
                node={selectedNode}
                shot={selectedShot}
                card={selectedCard}
                open
                onClose={() => setStoryflowMode("storyflow")}
                onUpdateShot={handleUpdateShot}
              />
            </div>
          </div>
        </div>
      )}

      {storyflowMode === "timeline" && (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_390px] gap-5 px-7 py-5">
          <div className="flex min-h-0 flex-col gap-5">
            <TimelineEditHero selectedShot={selectedShot} total={graph.totalDuration} onAddShot={addShot} />
            <TimelineDock
              shots={shots}
              selectedShotId={selectedShotId}
              variant="edit"
              playbackActive={playbackActive}
              onSelectShot={selectShot}
              onReorder={handleReorder}
              onUpdateDuration={(shotId, duration) => handleUpdateShot(shotId, { duration })}
            />
          </div>
          <div className="flex min-h-0 flex-col gap-5 overflow-hidden">
            <PreviewDock
              shot={selectedShot}
              index={selectedIndex}
              total={shots.length}
              onPrev={() => moveSelection(-1)}
              onNext={() => moveSelection(1)}
              playbackActive={playbackActive}
              onTogglePlayback={() => setPlaybackActive((active) => !active)}
            />
            <div className="min-h-0 flex-1 overflow-hidden rounded-[20px]">
              <InspectorDrawer
                node={selectedNode}
                shot={selectedShot}
                card={selectedCard}
                open
                onClose={() => setStoryflowMode("storyflow")}
                onUpdateShot={handleUpdateShot}
              />
            </div>
          </div>
        </div>
      )}

      {shortcutsOpen && <ShortcutsPopover onClose={() => setShortcutsOpen(false)} />}
      <StatusToast promptReviewIssues={promptReview?.warning || 0} syncState={syncState} />
    </div>
  );
}

function runTone(status: CanvasRunStatus): "neutral" | "accent" | "success" | "danger" {
  if (status === "running") return "accent";
  if (status === "complete") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

function runLabel(status: CanvasRunStatus) {
  if (status === "running") return "运行中";
  if (status === "complete") return "完成";
  if (status === "failed") return "失败";
  return "待命";
}

function NodeLibraryDrawer({
  runState,
  selectedShot,
  compact = false,
  onClose,
  onRun,
}: {
  runState: Record<CanvasRunKey, CanvasRunStatus>;
  selectedShot: Shot | null;
  compact?: boolean;
  onClose: () => void;
  onRun: (key: CanvasRunKey) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = NODE_LIBRARY.filter((node) =>
    `${node.title} ${node.subtitle} ${node.group}`.toLowerCase().includes(query.toLowerCase())
  );
  const groups = Array.from(new Set(filtered.map((node) => node.group)));

  return (
    <aside className={cn(
      "absolute z-40 flex max-h-[calc(100%-116px)] w-[348px] flex-col overflow-hidden rounded-[20px] border border-nc-border bg-white/94 shadow-[0_24px_70px_rgba(15,23,42,0.16)] backdrop-blur",
      compact ? "left-6 top-24" : "left-5 top-[86px]"
    )}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-nc-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#F5F3FF] text-nc-accent">
            <LibraryBig className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold leading-5 text-nc-text">节点库</div>
            <div className="nc-text-safe line-clamp-1 text-[12px] leading-4 text-nc-text-tertiary">
              {selectedShot ? `当前：${selectedShot.title}` : "选择镜头后运行生产节点"}
            </div>
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onClose} aria-label="关闭节点库">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="border-b border-nc-border p-4">
        <FieldShell className="min-h-11">
          <Search className="h-4 w-4 text-nc-text-tertiary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索生产节点..."
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-nc-text-tertiary"
          />
        </FieldShell>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        {groups.map((group) => (
          <section key={group}>
            <div className="mb-2 text-[12px] font-semibold uppercase leading-4 tracking-[0.10em] text-nc-text-tertiary">{group}</div>
            <div className="grid gap-2">
              {filtered.filter((node) => node.group === group).map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onRun(node.id)}
                  className={cn(
                    "nc-card-safe group flex w-full items-start gap-3 rounded-[16px] border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-nc-accent/35 hover:shadow-md",
                    node.primary ? "border-nc-accent/24 bg-[#F5F3FF]/72" : "border-nc-border bg-white"
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white bg-white text-nc-accent shadow-sm">
                    {node.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="nc-text-safe block line-clamp-1 text-[14px] font-semibold leading-5 text-nc-text">{node.title}</span>
                    <span className="nc-text-safe mt-1 block line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{node.subtitle}</span>
                  </span>
                  <Pill tone={runTone(runState[node.id])} className="min-h-6 px-2.5 py-0.5 text-[11px]">{runLabel(runState[node.id])}</Pill>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

type DockPlacement = "top-left" | "top-right";
type DockPosition = { x: number; y: number };

const RUN_DOCK_FULL_SIZE = { width: 338, height: 286 };
const RUN_DOCK_COLLAPSED_SIZE = { width: 286, height: 112 };
const RUN_DOCK_HIDDEN_SIZE = { width: 182, height: 50 };

function clampDockPosition(position: DockPosition, bounds: DOMRect | null, size: { width: number; height: number }): DockPosition {
  const width = bounds?.width || window.innerWidth;
  const height = bounds?.height || window.innerHeight;
  const margin = 12;
  return {
    x: Math.min(Math.max(position.x, margin), Math.max(margin, width - size.width - margin)),
    y: Math.min(Math.max(position.y, margin), Math.max(margin, height - size.height - margin)),
  };
}

function defaultDockPosition(bounds: DOMRect | null, placement: DockPlacement, rightInset: number, size: { width: number; height: number }): DockPosition {
  const width = bounds?.width || window.innerWidth;
  const x = placement === "top-right" ? width - size.width - rightInset : 24;
  return clampDockPosition({ x, y: 24 }, bounds, size);
}

function CanvasRunDock({
  runState,
  message,
  selectedShot,
  storageKey,
  defaultPlacement = "top-right",
  rightInset = 24,
  onRun,
  onRunChain,
}: {
  runState: Record<CanvasRunKey, CanvasRunStatus>;
  message: string;
  selectedShot: Shot | null;
  storageKey: string;
  defaultPlacement?: DockPlacement;
  rightInset?: number;
  onRun: (key: CanvasRunKey) => void;
  onRunChain: () => void;
}) {
  const chain: CanvasRunKey[] = ["prompt", "reference", "camera", "storyboard", "preflight", "generate"];
  const active = chain.find((key) => runState[key] === "running");
  const failed = chain.find((key) => runState[key] === "failed");
  const completed = chain.filter((key) => runState[key] === "complete").length;
  const dockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [position, setPosition] = useState<DockPosition>({ x: 24, y: 24 });
  const currentSize = hidden ? RUN_DOCK_HIDDEN_SIZE : collapsed ? RUN_DOCK_COLLAPSED_SIZE : RUN_DOCK_FULL_SIZE;

  useEffect(() => {
    const parentBounds = dockRef.current?.parentElement?.getBoundingClientRect() ?? null;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<{ position: DockPosition; collapsed: boolean; hidden: boolean }>;
        const nextCollapsed = Boolean(parsed.collapsed);
        const nextHidden = Boolean(parsed.hidden);
        const nextSize = nextHidden ? RUN_DOCK_HIDDEN_SIZE : nextCollapsed ? RUN_DOCK_COLLAPSED_SIZE : RUN_DOCK_FULL_SIZE;
        setCollapsed(nextCollapsed);
        setHidden(nextHidden);
        setPosition(clampDockPosition(parsed.position || defaultDockPosition(parentBounds, defaultPlacement, rightInset, nextSize), parentBounds, nextSize));
      } else {
        setPosition(defaultDockPosition(parentBounds, defaultPlacement, rightInset, RUN_DOCK_FULL_SIZE));
      }
    } catch {
      setPosition(defaultDockPosition(parentBounds, defaultPlacement, rightInset, RUN_DOCK_FULL_SIZE));
    }
    setInitialized(true);
  }, [defaultPlacement, rightInset, storageKey]);

  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem(storageKey, JSON.stringify({ position, collapsed, hidden }));
  }, [collapsed, hidden, initialized, position, storageKey]);

  useEffect(() => {
    const handleResize = () => {
      const parentBounds = dockRef.current?.parentElement?.getBoundingClientRect() ?? null;
      setPosition((current) => clampDockPosition(current, parentBounds, currentSize));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentSize]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    const parentBounds = dockRef.current?.parentElement?.getBoundingClientRect() ?? null;
    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPosition(clampDockPosition({
        x: drag.originX + moveEvent.clientX - drag.startX,
        y: drag.originY + moveEvent.clientY - drag.startY,
      }, parentBounds, currentSize));
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const tone = failed ? "danger" : active ? "accent" : completed === chain.length ? "success" : "neutral";
  const statusLabel = failed ? "有阻断" : active ? "运行中" : `${completed}/${chain.length}`;
  const panelStyle = { left: position.x, top: position.y, opacity: initialized ? 1 : 0 };

  if (hidden) {
    return (
      <div ref={dockRef} style={panelStyle} className="absolute z-40 transition-opacity">
        <div className="flex h-12 min-w-[182px] items-center gap-1 rounded-full border border-nc-border bg-white/92 px-2 shadow-[0_14px_38px_rgba(15,23,42,0.12)] backdrop-blur transition-all hover:-translate-y-0.5 hover:border-nc-accent/35">
          <button
            type="button"
            onPointerDown={beginDrag}
            className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-full text-nc-text-tertiary transition hover:bg-nc-bg hover:text-nc-accent active:cursor-grabbing"
            aria-label="拖动生产链路恢复按钮"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setHidden(false)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-1.5 text-left"
            aria-label="显示生产链路浮窗"
          >
          <KeyRound className="h-4 w-4 text-nc-accent" />
          <span className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-nc-text">生产链路</span>
          <Pill tone={tone} className="min-h-6 px-2 py-0.5 text-[11px]">{statusLabel}</Pill>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dockRef}
      style={panelStyle}
      className={cn(
        "pointer-events-auto absolute z-40 rounded-[20px] border border-nc-border bg-white/92 shadow-[0_18px_52px_rgba(15,23,42,0.12)] backdrop-blur transition-[opacity,box-shadow,transform] duration-200",
        collapsed ? "w-[286px] p-3" : "w-[338px] p-4"
      )}
      aria-live="polite"
    >
      <div className={cn("flex items-start justify-between gap-3", collapsed ? "mb-2" : "mb-3")}>
        <button
          type="button"
          onPointerDown={beginDrag}
          className="mt-0.5 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-[10px] border border-nc-border bg-white text-nc-text-tertiary transition hover:border-nc-accent/35 hover:text-nc-accent active:cursor-grabbing"
          aria-label="拖动生产链路浮窗"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[14px] font-semibold leading-5 text-nc-text">
            <KeyRound className="h-4 w-4 text-nc-accent" />
            生产链路
          </div>
          <div className="nc-text-safe mt-1 line-clamp-1 text-[12px] leading-5 text-nc-text-tertiary">
            {selectedShot ? selectedShot.title : "未选择镜头"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill tone={tone} className="min-h-6 px-2.5 py-0.5 text-[11px]">{statusLabel}</Pill>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-nc-border bg-white text-nc-text-tertiary transition hover:border-nc-accent/35 hover:text-nc-accent"
            aria-label={collapsed ? "展开生产链路浮窗" : "缩小生产链路浮窗"}
          >
            {collapsed ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-nc-border bg-white text-nc-text-tertiary transition hover:border-nc-accent/35 hover:text-nc-accent"
            aria-label="隐藏生产链路浮窗"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-1.5">
        {chain.map((key, index) => (
          <div key={key} className="flex min-w-0 flex-1 items-center">
            <button
              type="button"
              onClick={() => onRun(key)}
              title={NODE_LIBRARY.find((node) => node.id === key)?.title}
              className={cn(
                "h-2.5 flex-1 rounded-full transition-all",
                runState[key] === "failed" ? "bg-nc-error" :
                runState[key] === "running" ? "animate-pulse bg-nc-accent" :
                runState[key] === "complete" ? "bg-nc-success" :
                "bg-nc-border"
              )}
            />
            {index < chain.length - 1 && <span className="mx-1 h-px w-3 bg-nc-border" />}
          </div>
        ))}
      </div>
      {collapsed ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onRunChain} className="min-w-0 flex-1 px-3">
            <GitBranch className="h-4 w-4" />
            整链
          </Button>
          <Button size="sm" variant="primary" onClick={() => onRun("generate")} className="min-w-0 flex-1 px-3">
            <Play className="h-4 w-4 fill-current" />
            生成
          </Button>
        </div>
      ) : (
        <>
          {message && (
        <div className={cn(
          "nc-text-safe mb-3 line-clamp-2 rounded-[14px] border px-3 py-2 text-[12px] leading-5",
          failed ? "border-nc-error/20 bg-nc-error/10 text-nc-error" : "border-nc-border bg-nc-bg text-nc-text-secondary"
        )}>
          {message}
        </div>
          )}
          <div className="grid grid-cols-[1.15fr_1fr_1fr] gap-2">
            <Button size="sm" variant="secondary" onClick={onRunChain} className="px-3">
              <GitBranch className="h-4 w-4" />
              整链
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onRun("storyboard")} className="px-3">
              <WandSparkles className="h-4 w-4" />
              分镜
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onRun("preflight")} className="px-3">
              <ShieldCheck className="h-4 w-4" />
              预检
            </Button>
          </div>
          <div className="mt-2">
            <Button size="sm" variant="primary" onClick={() => onRun("generate")} className="px-3">
              <Play className="h-4 w-4 fill-current" />
              提交生成
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function WorkbenchHeader({
  mode,
  isRunning,
  syncState,
  totalShots,
  totalDuration,
  onModeChange,
  onOpenShortcuts,
}: {
  mode: StoryflowMode;
  isRunning: boolean;
  syncState: "local" | "saving" | "saved" | "offline";
  totalShots: number;
  totalDuration: number;
  onModeChange: (mode: StoryflowMode) => void;
  onOpenShortcuts: () => void;
}) {
  const syncLabel = isRunning
    ? "AI 运行中"
    : syncState === "saving"
      ? "保存中"
      : syncState === "saved"
        ? "已同步"
        : syncState === "offline"
          ? "本地暂存"
          : "本地编辑";
  const syncTone = (isRunning || syncState === "saving" ? "accent" : syncState === "offline" ? "warning" : syncState === "saved" ? "success" : "neutral") as
    | "accent"
    | "warning"
    | "success"
    | "neutral";

  return (
    <header className="relative z-20 flex min-h-[86px] shrink-0 items-center justify-between gap-6 border-b border-nc-border bg-white/92 px-8 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] backdrop-blur">
      <div className="min-w-[260px] flex-1">
        <div className="flex items-center gap-3">
          <h1 className="whitespace-nowrap text-[25px] font-semibold leading-8 text-nc-text">{modeTitle(mode)}</h1>
          <Pill tone={syncTone}>{syncLabel}</Pill>
        </div>
        <p className="nc-text-safe mt-1 line-clamp-1 max-w-[760px] text-[14px] leading-6 text-nc-text-secondary">
          可视化编排意图、参考、Prompt、镜头语言、分镜、时间线与质检。
        </p>
      </div>
      <FieldShell className="hidden min-w-[300px] max-w-[420px] flex-1 2xl:flex">
        <Search className="h-4 w-4 text-nc-text-tertiary" />
        <span className="flex-1 text-[14px] text-nc-text-tertiary">搜索节点、镜头、参考、模板...</span>
        <span className="rounded-[8px] bg-nc-bg px-2.5 py-1 font-mono text-[12px] font-semibold text-nc-text-tertiary">⌘K</span>
      </FieldShell>
      <div className="flex shrink-0 items-center gap-3">
        <FloatingModeSwitcher mode={mode} onChange={onModeChange} />
        <div className="hidden items-center gap-2 rounded-[16px] border border-nc-border bg-nc-bg px-3 py-2 2xl:flex">
          <Pill tone="neutral">{totalShots} shots</Pill>
          <Pill tone="neutral">{totalDuration || 0}s</Pill>
        </div>
        <Button variant="secondary" onClick={onOpenShortcuts}>
          <Command className="h-4 w-4" />
          快捷键
        </Button>
        <Button variant="primary">
          <Maximize2 className="h-4 w-4" />
          导出
        </Button>
      </div>
    </header>
  );
}

function SceneOutline({
  open,
  shots,
  selectedShotId,
  onToggle,
  onSelectShot,
  onAddShot,
}: {
  open: boolean;
  shots: Shot[];
  selectedShotId: string | null;
  onToggle: () => void;
  onSelectShot: (shotId: string) => void;
  onAddShot: () => void;
}) {
  return (
    <aside className={cn("nc-card-safe min-h-0 overflow-hidden rounded-[20px] border border-nc-border bg-white shadow-[0_14px_42px_rgba(15,23,42,0.08)] transition-all", open ? "w-[292px]" : "w-[56px]")}>
      <div className="flex h-14 items-center justify-between border-b border-nc-border px-4">
        {open && <h2 className="text-[15px] font-semibold leading-6 text-nc-text">Scene Outline</h2>}
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onToggle} title={open ? "折叠大纲" : "展开大纲"}>
          {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
      {open ? (
        <div className="flex h-[calc(100%-56px)] flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {shots.map((shot, index) => {
              const selected = shot.id === selectedShotId;
              return (
                <button
                  key={shot.id}
                  type="button"
                  onClick={() => onSelectShot(shot.id)}
                  className={cn(
                    "nc-card-safe w-full rounded-[16px] border p-3 text-left transition-all",
                    selected ? "border-nc-accent bg-[#F5F3FF] ring-2 ring-nc-accent/12" : "border-nc-border bg-white hover:-translate-y-0.5 hover:border-nc-accent/35 hover:shadow-md"
                  )}
                >
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-nc-accent text-[13px] font-bold text-white">{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="nc-text-safe line-clamp-1 text-[13px] font-semibold leading-5 text-nc-text">{shot.title}</div>
                      <div className="nc-text-safe mt-1 line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{shot.prompt}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill tone={shot.video_url ? "success" : "neutral"} className="min-h-6 px-2.5 py-0.5 text-[11px]">{shot.video_url ? "已生成" : shot.status}</Pill>
                    <Pill tone="neutral" className="min-h-6 px-2.5 py-0.5 text-[11px]">{shot.duration}s</Pill>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-nc-border p-4">
            <Button variant="secondary" className="w-full" onClick={onAddShot}>
              <Plus className="h-4 w-4" />
              添加镜头
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 p-2">
          {shots.slice(0, 8).map((shot, index) => (
            <button key={shot.id} type="button" onClick={() => onSelectShot(shot.id)} className={cn("h-10 rounded-[12px] text-[12px] font-bold", shot.id === selectedShotId ? "bg-nc-accent text-white" : "bg-nc-bg text-nc-text-tertiary")}>
              {index + 1}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function ReviewShotRail({
  shots,
  selectedShotId,
  onSelectShot,
  onAddShot,
}: {
  shots: Shot[];
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onAddShot: () => void;
}) {
  return (
    <aside className="nc-card-safe flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-nc-border bg-white shadow-[0_14px_42px_rgba(15,23,42,0.08)]">
      <div className="flex min-h-16 items-center justify-between border-b border-nc-border px-5">
        <div>
          <h2 className="text-[16px] font-semibold leading-6 text-nc-text">Storyboard</h2>
          <p className="text-[12px] leading-5 text-nc-text-tertiary">点击镜头同步预览和时间线</p>
        </div>
        <Button size="icon" variant="secondary" className="h-10 w-10" onClick={onAddShot}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {shots.map((shot, index) => (
          <button
            key={shot.id}
            type="button"
            onClick={() => onSelectShot(shot.id)}
            className={cn(
              "group nc-card-safe w-full overflow-hidden rounded-[16px] border bg-white text-left transition-all",
              selectedShotId === shot.id ? "border-nc-accent ring-4 ring-nc-accent/12" : "border-nc-border hover:-translate-y-0.5 hover:border-nc-accent/35 hover:shadow-md"
            )}
          >
            <div className="relative aspect-video bg-nc-bg">
              <MediaThumb src={safeMediaSrc(shot.thumbnail_url)} title={shot.title} className="h-full rounded-none border-0 shadow-none" />
              <div className="absolute left-3 top-3 rounded-[10px] bg-nc-accent px-2.5 py-1 text-[12px] font-bold text-white">{index + 1}</div>
              <div className="absolute bottom-3 right-3 rounded-full bg-nc-text/72 px-2.5 py-1 font-mono text-[12px] font-semibold text-white">{shot.duration}s</div>
            </div>
            <div className="space-y-2 p-4">
              <div className="nc-text-safe line-clamp-1 text-[14px] font-semibold leading-5 text-nc-text">{shot.title}</div>
              <div className="nc-text-safe line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{shot.generationParams?.shot_script || shot.prompt}</div>
              <div className="flex flex-wrap gap-2">
                <Pill tone={shot.video_url ? "success" : "neutral"} className="min-h-6 px-2.5 py-0.5 text-[11px]">{shot.video_url ? "已生成" : shot.status}</Pill>
                <Pill tone="accent" className="min-h-6 px-2.5 py-0.5 text-[11px]">{shot.camera?.split("，")[0] || "Camera"}</Pill>
              </div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function TimelineEditHero({
  selectedShot,
  total,
  onAddShot,
}: {
  selectedShot: Shot | null;
  total: number;
  onAddShot: () => void;
}) {
  return (
    <Surface className="nc-card-safe grid min-h-[176px] grid-cols-[minmax(0,1fr)_320px] overflow-hidden rounded-[20px]">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <Pill tone="accent"><GitBranch className="mr-1 h-3.5 w-3.5" />时间线精修</Pill>
          <Pill tone="neutral">{total}s</Pill>
        </div>
        <h2 className="mt-4 text-[24px] font-semibold leading-8 text-nc-text">精修节奏、轨道和交付状态</h2>
        <p className="mt-2 max-w-[680px] text-[14px] leading-6 text-nc-text-secondary">
          时间线会和创作流程节点共享选中状态。拖动镜头块调整顺序，修改时长会即时反馈到节点和检查面板。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onAddShot}><Plus className="h-4 w-4" />添加镜头</Button>
          <Button variant="secondary"><RefreshCw className="h-4 w-4" />批量生成</Button>
          <Button variant="secondary"><Save className="h-4 w-4" />保存版本</Button>
        </div>
      </div>
      <div className="relative overflow-hidden bg-[#0F172A]">
        {safeMediaSrc(selectedShot?.thumbnail_url) && <MediaThumb src={safeMediaSrc(selectedShot?.thumbnail_url)} title={selectedShot?.title} className="absolute inset-0 h-full rounded-none border-0 opacity-75 shadow-none" />}
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(108,77,255,0.50),rgba(0,212,224,0.24))]" />
        <div className="relative flex h-full flex-col justify-end p-5">
          <div className="nc-text-safe line-clamp-1 text-[15px] font-semibold leading-6 text-white">{selectedShot?.title || "选择镜头"}</div>
          <div className="nc-text-safe line-clamp-2 text-[12px] leading-5 text-white/74">{selectedShot?.camera || "镜头预览和当前编辑状态会显示在这里。"}</div>
        </div>
      </div>
    </Surface>
  );
}

function ShortcutsPopover({ onClose }: { onClose: () => void }) {
  const rows = [
    ["P", "切换纯净模式"],
    ["F", "聚焦当前节点"],
    ["Space", "拖动画布"],
    ["⌘/Ctrl + 0", "适配画布"],
    ["⌘/Ctrl + +/-", "缩放画布"],
    ["⌘/Ctrl + D", "复制镜头节点"],
    ["Delete", "删除镜头节点"],
    ["Esc", "关闭抽屉 / 退出纯净"],
    ["Enter", "编辑当前节点"],
    ["[ / ]", "切换上一 / 下一镜头"],
  ];
  return (
    <div className="absolute right-8 top-24 z-50 w-[360px] rounded-[20px] border border-nc-border bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold leading-6 text-nc-text">流程画布快捷键</h2>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} aria-label="关闭快捷键">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-2">
        {rows.map(([key, label]) => (
          <div key={key} className="flex min-h-10 items-center justify-between gap-4 rounded-[12px] bg-nc-bg px-3 py-2">
            <span className="text-[13px] leading-5 text-nc-text-secondary">{label}</span>
            <span className="rounded-[8px] border border-nc-border bg-white px-2.5 py-1 font-mono text-[12px] font-semibold leading-4 text-nc-text">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusToast({
  promptReviewIssues,
  syncState,
}: {
  promptReviewIssues: number;
  syncState: "local" | "saving" | "saved" | "offline";
}) {
  const syncMessage =
    syncState === "saving"
      ? "正在同步到本地引擎"
      : syncState === "offline"
        ? "本地引擎不可用，当前为本地暂存"
        : syncState === "saved"
          ? "画布、时间线、预览已同步"
          : "当前计划尚未连接本地引擎，变更保存在本地状态";

  return (
    <div className="pointer-events-none absolute bottom-5 right-7 z-30 hidden items-center gap-2 rounded-[999px] border border-nc-border bg-white/90 px-3 py-2 text-[12px] font-semibold text-nc-text-secondary shadow-[0_12px_34px_rgba(15,23,42,0.10)] backdrop-blur xl:flex">
      {promptReviewIssues > 0 ? (
        <>
          <AlertTriangle className="h-4 w-4 text-nc-warning" />
          {promptReviewIssues} 条提示词建议待处理
        </>
      ) : (
        <>
          <CheckCircle2 className={cn("h-4 w-4", syncState === "offline" ? "text-nc-warning" : "text-nc-success")} />
          {syncMessage}
        </>
      )}
    </div>
  );
}
