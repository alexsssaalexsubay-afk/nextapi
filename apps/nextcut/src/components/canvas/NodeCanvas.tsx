import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Camera, Copy, Eye, FileText, Layers3, ListChecks, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { Button, Pill, Surface } from "@/components/ui/kit";
import { sidecarFetch } from "@/lib/sidecar";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore, type Shot, type ShotGenerationCard } from "@/stores/director-store";
import { StatusFlowEdge, type FlowEdgeStatus } from "@/components/storyflow/StatusFlowEdge";

const edgeTypes = { statusFlow: StatusFlowEdge } satisfies EdgeTypes;

const baseNodeStyle = {
  background: "transparent",
  border: "0",
  borderRadius: 18,
  padding: 0,
  boxShadow: "none",
  width: 210,
};

const WORKFLOW_GROUPS = [
  { id: "prompt", title: "Prompt Decomposition", subtitle: "用户意图与结构化拆解", x: 56, y: 156, width: 220 },
  { id: "reference", title: "Reference Stack", subtitle: "品牌、素材、风格参考", x: 328, y: 74, width: 232 },
  { id: "camera", title: "Camera Motion", subtitle: "运镜、构图、运动强度", x: 626, y: 156, width: 240 },
  { id: "storyboard", title: "Storyboard", subtitle: "镜头顺序与叙事节奏", x: 926, y: 70, width: 520 },
  { id: "output", title: "Output", subtitle: "时间线与生成任务", x: 1518, y: 174, width: 248 },
];

function statusCopy(status?: string) {
  if (status === "complete" || status === "succeeded") return "完成";
  if (status === "running" || status === "progress" || status === "generating" || status === "processing") return "运行中";
  if (status === "failed") return "失败";
  if (status === "planned" || status === "pending") return "已规划";
  return "待命";
}

function shotFlowStatus(shot?: Shot, active?: boolean): FlowEdgeStatus {
  if (!shot) return active ? "selected" : "idle";
  if (shot.status === "failed") return "failed";
  if (shot.status === "queued" || shot.status === "generating" || shot.status === "processing") return "running";
  if (shot.video_url || shot.status === "succeeded" || shot.status === "complete") return "complete";
  return active ? "selected" : "idle";
}

function edgeMarker(status: FlowEdgeStatus) {
  const color = status === "failed" ? "#EF4444" : status === "complete" ? "#22C55E" : status === "running" || status === "selected" ? "#6C4DFF" : "#B7C0D2";
  return { type: MarkerType.ArrowClosed, color, width: 18, height: 18 };
}

function ShotNodeLabel({
  shot,
  selected,
  onPreview,
}: {
  shot: Shot;
  selected: boolean;
  onPreview: () => void;
}) {
  return (
    <Surface selected={selected} interactive className="w-[236px] overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-nc-panel">
        {shot.thumbnail_url ? (
          <img src={shot.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[13px] text-nc-text-tertiary">Shot {shot.index}</div>
        )}
        <Pill tone="accent" className="absolute left-3 top-3 bg-white/92">{shot.index}</Pill>
        <span className="absolute right-3 top-3 rounded-[999px] bg-black/55 px-2.5 py-1 font-mono text-[12px] font-semibold text-white">
          {shot.duration}s
        </span>
      </div>
      <div className="p-4">
        <div className="line-clamp-1 text-[15px] font-semibold leading-6 text-nc-text">{shot.title}</div>
        <div className="mt-2 line-clamp-2 min-h-[40px] text-[12px] leading-5 text-nc-text-secondary">
          {shot.generationParams?.shot_script || shot.prompt}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Pill tone={shot.video_url ? "success" : "neutral"}>{shot.video_url ? "已生成" : statusCopy(shot.status)}</Pill>
          <Button
            size="sm"
            variant="ghost"
            className="nodrag relative z-10"
            onClick={(event) => {
              event.stopPropagation();
              onPreview();
            }}
          >
            <Eye className="h-4 w-4" />
            预览
          </Button>
        </div>
      </div>
    </Surface>
  );
}

function WorkflowGroupLabel({
  title,
  subtitle,
  metric,
  children,
}: {
  title: string;
  subtitle: string;
  metric: string;
  children: React.ReactNode;
}) {
  return (
    <Surface className="w-full overflow-hidden border-nc-border/90 bg-white/94 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-1 text-[14px] font-semibold leading-6 text-nc-text">{title}</div>
          <div className="line-clamp-1 text-[12px] leading-5 text-nc-text-tertiary">{subtitle}</div>
        </div>
        <Pill tone="accent" className="shrink-0">{metric}</Pill>
      </div>
      <div className="space-y-3">{children}</div>
    </Surface>
  );
}

export function NodeCanvas() {
  const {
    agentProgress,
    shots,
    shotGenerationCards,
    references,
    structuredPrompt,
    prompt,
    setShots,
    updateShot,
    setShotGenerationCards,
    planId,
  } = useDirectorStore();
  const { selectedShotId, setSelectedShotId } = useAppStore();
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [previewShotId, setPreviewShotId] = useState<string | null>(null);
  const [showAgents, setShowAgents] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);

  const activeShot = shots.find((shot) => shot.id === previewShotId) || shots.find((shot) => shot.id === selectedShotId) || null;
  const previewShot = editorOpen ? activeShot : null;
  const previewCard = previewShot ? shotGenerationCards.find((card) => card.shot_id === previewShot.id) : null;
  const selectedIndex = activeShot ? shots.findIndex((shot) => shot.id === activeShot.id) : -1;
  const totalDuration = shots.reduce((sum, shot) => sum + (Number(shot.duration) || 0), 0);
  const completedShots = shots.filter((shot) => shot.video_url || shot.status === "succeeded").length;

  useEffect(() => {
    if (editorScrollRef.current) editorScrollRef.current.scrollTop = 0;
  }, [previewShot?.id]);

  const syncPlanShot = useCallback((shotId: string, patch: Record<string, unknown>) => {
    if (!planId) return;
    void sidecarFetch(`/director/plan/${planId}/shot/${shotId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }, [planId]);

  const nodes: Node[] = useMemo(() => {
    const runningCount = agentProgress.filter((item) => item.status === "running" || item.status === "progress").length;
    const groupNodes: Node[] = showAgents ? WORKFLOW_GROUPS.map((group) => ({
      id: group.id,
      type: "default",
      position: { x: group.x, y: group.y },
      data: {
        label: group.id === "prompt" ? (
          <WorkflowGroupLabel title={group.title} subtitle={group.subtitle} metric="1 节点">
            <div className="rounded-[14px] border border-nc-border bg-nc-bg p-3">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold leading-5 text-nc-text">
                <FileText className="h-4 w-4 text-nc-accent" />
                用户意图
              </div>
              <p className="line-clamp-4 min-h-[80px] text-[12px] leading-6 text-nc-text-secondary">
                {prompt || structuredPrompt.subject || "描述一句创意想法，系统会拆解主体、动作、场景和风格。"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill tone="accent">{structuredPrompt.action || "产品广告"}</Pill>
                <Pill tone="neutral">{structuredPrompt.style || "30s"}</Pill>
              </div>
            </div>
          </WorkflowGroupLabel>
        ) : group.id === "reference" ? (
          <WorkflowGroupLabel title={group.title} subtitle={group.subtitle} metric={`${Math.max(references.length, 3)} 节点`}>
            {[0, 1, 2].map((slot) => {
              const ref = references[slot];
              const sampleShot = shots[slot] || shots[0];
              return (
                <div key={ref?.id || slot} className="rounded-[14px] border border-nc-border bg-nc-bg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-[13px] font-semibold leading-5 text-nc-text">
                        {ref?.name || ["品牌参考", "竞品参考", "风格参考"][slot]}
                      </div>
                      <div className="line-clamp-1 text-[12px] leading-5 text-nc-text-tertiary">
                        {ref?.description || shotGenerationCards[slot]?.reference_contract || "继承当前项目素材与视觉基调"}
                      </div>
                    </div>
                    <Pill tone="accent">{slot === 0 ? "0.9" : slot === 1 ? "0.7" : "0.6"}</Pill>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((thumb) => (
                      <div key={thumb} className="aspect-video overflow-hidden rounded-[8px] bg-white">
                        {(ref?.type === "image" || ref?.type === "video") && ref.url ? (
                          <img src={ref.url} alt="" className="h-full w-full object-cover" />
                        ) : sampleShot?.thumbnail_url ? (
                          <img src={sampleShot.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full bg-[linear-gradient(135deg,#F5F3FF,#ECFEFF)]" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </WorkflowGroupLabel>
        ) : group.id === "camera" ? (
          <WorkflowGroupLabel title={group.title} subtitle={group.subtitle} metric="2 节点">
            <div className="rounded-[14px] border border-nc-border bg-nc-bg p-3">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold leading-5 text-nc-text">
                <Camera className="h-4 w-4 text-nc-accent" />
                运动风格
              </div>
              <p className="line-clamp-3 text-[12px] leading-6 text-nc-text-secondary">
                {activeShot?.camera || structuredPrompt.camera || "平滑推进、稳定构图、主体始终清晰。"}
              </p>
              <div className="mt-3 h-10 rounded-[12px] border border-nc-border bg-white px-3 py-2">
                <svg viewBox="0 0 160 32" className="h-full w-full text-nc-accent" fill="none">
                  <path d="M4 20 C30 4, 54 28, 80 14 S130 10, 156 20" stroke="currentColor" strokeWidth="2.5" />
                  <circle cx="80" cy="14" r="4" fill="currentColor" />
                </svg>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill tone="accent">强度 0.65</Pill>
              <Pill tone="neutral">稳定</Pill>
              <Pill tone="neutral">节奏感</Pill>
            </div>
          </WorkflowGroupLabel>
        ) : group.id === "storyboard" ? (
          <WorkflowGroupLabel title={group.title} subtitle={group.subtitle} metric={`${shots.length} 节点`}>
            <p className="rounded-[14px] border border-nc-border bg-nc-bg px-3 py-2 text-[12px] leading-6 text-nc-text-secondary">
              选择任意镜头可打开合约编辑器，修改标题、时长、运镜和提示词后会同步到时间线与预览。
            </p>
          </WorkflowGroupLabel>
        ) : (
          <WorkflowGroupLabel title={group.title} subtitle={group.subtitle} metric={`${completedShots}/${shots.length}`}>
            <div className="overflow-hidden rounded-[14px] border border-nc-border bg-nc-bg">
              <div className="relative aspect-video">
                {activeShot?.thumbnail_url ? (
                  <img src={activeShot.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#F5F3FF,#E0F7FA)] text-[12px] text-nc-text-tertiary">
                    Timeline Preview
                  </div>
                )}
                <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/52 text-white shadow-xl">
                  <Eye className="h-5 w-5" />
                </span>
              </div>
              <div className="space-y-2 p-3">
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-nc-accent" style={{ width: `${shots.length ? (completedShots / shots.length) * 100 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-[12px] leading-5 text-nc-text-tertiary">
                  <span>总时长 {totalDuration}s</span>
                  <span>{runningCount ? `${runningCount} 个代理运行` : "准备生成"}</span>
                </div>
              </div>
            </div>
          </WorkflowGroupLabel>
        ),
      },
      style: { ...baseNodeStyle, width: group.width },
      draggable: true,
      zIndex: 1,
    })) : [];

    const shotNodes: Node[] = shots.map((shot, index) => ({
      id: `shot_${shot.id}`,
      type: "default",
      position: showAgents
        ? { x: 948 + (index % 2) * 268, y: 244 + Math.floor(index / 2) * 226 }
        : { x: 72 + (index % 5) * 288, y: 112 + Math.floor(index / 5) * 332 },
      data: {
        shotId: shot.id,
        label: (
          <ShotNodeLabel
            shot={shot}
            selected={selectedShotId === shot.id}
            onPreview={() => {
              setSelectedShotId(shot.id);
              setPreviewShotId(shot.id);
              setEditorOpen(true);
            }}
          />
        ),
      },
      style: { ...baseNodeStyle, width: 236 },
      zIndex: 2,
    }));

    return [...groupNodes, ...shotNodes];
  }, [activeShot?.camera, activeShot?.thumbnail_url, agentProgress, completedShots, prompt, references, selectedShotId, setSelectedShotId, shotGenerationCards, shots, showAgents, structuredPrompt.action, structuredPrompt.camera, structuredPrompt.style, structuredPrompt.subject, totalDuration]);

  const edges: Edge[] = useMemo(() => {
    const sequenceEdges: Edge[] = shots.slice(0, -1).map((shot, index) => ({
      id: `seq_${shot.id}_${shots[index + 1].id}`,
      source: `shot_${shot.id}`,
      target: `shot_${shots[index + 1].id}`,
      type: "statusFlow",
      data: {
        status: shotFlowStatus(shots[index + 1], selectedShotId === shot.id || selectedShotId === shots[index + 1].id),
        label: shotFlowStatus(shots[index + 1]) === "running" ? "生成中" : undefined,
      },
      markerEnd: edgeMarker(shotFlowStatus(shots[index + 1], selectedShotId === shot.id || selectedShotId === shots[index + 1].id)),
    }));
    const activeWorkflow = agentProgress.some((item) => item.status === "running" || item.status === "progress");
    const failedWorkflow = agentProgress.some((item) => item.status === "failed");
    const workflowStatus: FlowEdgeStatus = failedWorkflow ? "failed" : activeWorkflow ? "running" : shots.length ? "complete" : "idle";
    const shotEdges: Edge[] = shots.length ? [
      {
        id: "e_camera_storyboard",
        source: "camera",
        target: `shot_${shots[0].id}`,
        type: "statusFlow",
        data: { status: workflowStatus, label: workflowStatus === "running" ? "导演运行" : undefined },
        markerEnd: edgeMarker(workflowStatus),
      },
      {
        id: `e_storyboard_output_${shots[shots.length - 1].id}`,
        source: `shot_${shots[shots.length - 1].id}`,
        target: "output",
        type: "statusFlow",
        data: { status: shotFlowStatus(shots[shots.length - 1]), label: shotFlowStatus(shots[shots.length - 1]) === "running" ? "输出中" : undefined },
        markerEnd: edgeMarker(shotFlowStatus(shots[shots.length - 1])),
      },
    ] : [];
    const workflowEdges: Edge[] = [
      { id: "flow_prompt_reference", source: "prompt", target: "reference", type: "statusFlow", data: { status: workflowStatus, label: workflowStatus === "running" ? "拆解中" : undefined }, markerEnd: edgeMarker(workflowStatus) },
      { id: "flow_prompt_camera", source: "prompt", target: "camera", type: "statusFlow", data: { status: workflowStatus }, markerEnd: edgeMarker(workflowStatus) },
      { id: "flow_reference_camera", source: "reference", target: "camera", type: "statusFlow", data: { status: workflowStatus }, markerEnd: edgeMarker(workflowStatus) },
    ];
    return showAgents ? [...workflowEdges, ...shotEdges, ...sequenceEdges] : sequenceEdges;
  }, [agentProgress, selectedShotId, shots, showAgents]);

  const onNodesChange = useCallback(
    (changes: Parameters<NonNullable<React.ComponentProps<typeof ReactFlow>["onNodesChange"]>>[0]) => {
      setNodePositions((positions) => {
        const updated = { ...positions };
        for (const change of changes) {
          if (change.type === "position" && change.position) {
            updated[change.id] = change.position;
          }
        }
        return updated;
      });
    },
    []
  );

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const shotId = node.data.shotId;
    if (typeof shotId === "string") {
      setSelectedShotId(shotId);
      setPreviewShotId(shotId);
      setEditorOpen(true);
    }
  }, [setSelectedShotId]);

  const displayNodes = useMemo(
    () => nodes.map((node) => nodePositions[node.id] ? { ...node, position: nodePositions[node.id] } : node),
    [nodes, nodePositions]
  );

  const updateShotCard = useCallback((shotId: string, patch: Partial<ShotGenerationCard>) => {
    const existing = shotGenerationCards.find((card) => card.shot_id === shotId);
    if (!existing) {
      setShotGenerationCards([
        ...shotGenerationCards,
        {
          shot_id: shotId,
          prompt_role: "manual_story_progression",
          motion_contract: "",
          camera_contract: "",
          reference_contract: "",
          risk_flags: [],
          edit_note: "",
          ...patch,
        },
      ]);
      return;
    }
    setShotGenerationCards(shotGenerationCards.map((card) => (
      card.shot_id === shotId ? { ...card, ...patch } : card
    )));
  }, [setShotGenerationCards, shotGenerationCards]);

  const updateShotScript = useCallback((shot: Shot, value: string) => {
    updateShot(shot.id, {
      generationParams: {
        ...shot.generationParams,
        shot_script: value,
      },
    });
    updateShotCard(shot.id, { motion_contract: value });
    syncPlanShot(shot.id, { generationParams: { ...shot.generationParams, shot_script: value } });
  }, [syncPlanShot, updateShot, updateShotCard]);

  const updateShotCamera = useCallback((shot: Shot, value: string) => {
    updateShot(shot.id, { camera: value });
    updateShotCard(shot.id, { camera_contract: value });
    syncPlanShot(shot.id, { camera: value });
  }, [syncPlanShot, updateShot, updateShotCard]);

  const reindexShots = useCallback((items: Shot[]) => items.map((shot, index) => ({ ...shot, index: index + 1 })), []);

  const moveShot = useCallback((shot: Shot, direction: -1 | 1) => {
    const index = shots.findIndex((item) => item.id === shot.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= shots.length) return;
    const nextShots = [...shots];
    const [moved] = nextShots.splice(index, 1);
    nextShots.splice(targetIndex, 0, moved);
    const reindexed = reindexShots(nextShots);
    setShots(reindexed);
    if (planId) {
      void sidecarFetch(`/director/plan/${planId}/reorder`, {
        method: "POST",
        body: JSON.stringify({ shot_ids: reindexed.map((item) => item.id) }),
      });
    }
    setSelectedShotId(shot.id);
    setPreviewShotId(shot.id);
    setEditorOpen(true);
  }, [planId, reindexShots, setSelectedShotId, setShots, shots]);

  const insertShotAfter = useCallback((source?: Shot) => {
    const base = source || activeShot || shots[shots.length - 1];
    const insertAt = base ? Math.max(0, shots.findIndex((shot) => shot.id === base.id)) + 1 : shots.length;
    const id = `manual_shot_${Date.now()}`;
    const newShot: Shot = {
      id,
      scene_id: base?.scene_id || "manual_scene",
      index: insertAt + 1,
      title: "新增镜头",
      duration: base?.duration || 4,
      prompt: base?.prompt || "新增镜头：描述主体、动作、场景和运镜。",
      negative_prompt: base?.negative_prompt || "low quality, watermark, text overlay",
      status: "planned",
      video_url: "",
      thumbnail_url: base?.thumbnail_url || "",
      camera: base?.camera || "medium shot, stable camera movement",
      audio: base?.audio,
      generationParams: {
        ...base?.generationParams,
        shot_script: "新增镜头。补充一个清晰动作，保持主体一致。",
      },
      qualityScore: null,
    };
    const nextShots = [...shots.slice(0, insertAt), newShot, ...shots.slice(insertAt)];
    setShots(reindexShots(nextShots));
    setShotGenerationCards([
      ...shotGenerationCards,
      {
        shot_id: id,
        prompt_role: "manual_story_progression",
        motion_contract: newShot.generationParams?.shot_script || "",
        camera_contract: newShot.camera,
        reference_contract: "继承当前参考策略，保持主体和风格一致。",
        risk_flags: ["新增镜头需要复核动作是否单一", "检查相邻镜头方向是否连续"],
        edit_note: "手动新增镜头，可在画布中继续编辑后进入时间线复核。",
      },
    ]);
    setSelectedShotId(id);
    setPreviewShotId(id);
    setEditorOpen(true);
  }, [activeShot, reindexShots, setSelectedShotId, setShotGenerationCards, setShots, shotGenerationCards, shots]);

  const duplicateShot = useCallback((shot: Shot) => {
    const insertAt = Math.max(0, shots.findIndex((item) => item.id === shot.id)) + 1;
    const id = `duplicate_shot_${Date.now()}`;
    const duplicate: Shot = {
      ...shot,
      id,
      index: insertAt + 1,
      title: `${shot.title} 复制`,
      video_url: "",
      status: "planned",
      qualityScore: null,
    };
    setShots(reindexShots([...shots.slice(0, insertAt), duplicate, ...shots.slice(insertAt)]));
    const sourceCard = shotGenerationCards.find((card) => card.shot_id === shot.id);
    if (sourceCard) {
      setShotGenerationCards([...shotGenerationCards, { ...sourceCard, shot_id: id, edit_note: `${sourceCard.edit_note} 复制后需重新复核节奏。` }]);
    }
    setSelectedShotId(id);
    setPreviewShotId(id);
    setEditorOpen(true);
  }, [reindexShots, setSelectedShotId, setShotGenerationCards, setShots, shotGenerationCards, shots]);

  const deleteShot = useCallback((shot: Shot) => {
    if (shots.length <= 1) return;
    const nextShots = reindexShots(shots.filter((item) => item.id !== shot.id));
    setShots(nextShots);
    setShotGenerationCards(shotGenerationCards.filter((card) => card.shot_id !== shot.id));
    const nextSelected = nextShots[Math.max(0, Math.min(selectedIndex, nextShots.length - 1))]?.id ?? null;
    setSelectedShotId(nextSelected);
    setPreviewShotId(nextSelected);
    setEditorOpen(Boolean(nextSelected));
  }, [reindexShots, selectedIndex, setSelectedShotId, setShotGenerationCards, setShots, shotGenerationCards, shots]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#FFFFFF_0%,#F7F8FC_100%)]">
      <div className="absolute left-6 top-5 z-10 flex flex-wrap gap-3">
        <Pill tone="accent"><Layers3 className="mr-1 h-3.5 w-3.5" />Director Graph</Pill>
        <Pill tone="neutral">{shots.length} 个镜头节点</Pill>
        <Button size="sm" variant="secondary" onClick={() => setNodePositions({})}>
          <RefreshCw className="h-4 w-4" />
          自动布局
        </Button>
        <Button size="sm" variant={showAgents ? "primary" : "secondary"} onClick={() => {
          setShowAgents((value) => !value);
          setNodePositions({});
        }}>
          {showAgents ? "代理区开启" : "只看镜头"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => insertShotAfter(activeShot || undefined)}>
          <Plus className="h-4 w-4" />
          新增镜头
        </Button>
        {activeShot && (
          <Button size="sm" variant={editorOpen ? "primary" : "secondary"} onClick={() => setEditorOpen((value) => !value)}>
            <FileText className="h-4 w-4" />
            {editorOpen ? "收起编辑器" : "编辑镜头"}
          </Button>
        )}
      </div>

      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        defaultViewport={{ x: 28, y: 18, zoom: 0.58 }}
        minZoom={0.42}
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        className="[&_.react-flow__controls]:!rounded-[14px] [&_.react-flow__controls]:!border [&_.react-flow__controls]:!border-[#E8EAF2] [&_.react-flow__controls]:!bg-white [&_.react-flow__controls]:!shadow-[0_4px_12px_rgba(15,23,42,0.08)] [&_.react-flow__controls-button]:!border-[#E8EAF2] [&_.react-flow__controls-button]:!bg-white [&_.react-flow__controls-button]:!text-[#475467] [&_.react-flow__node-default]:!border-0 [&_.react-flow__node-default]:!bg-transparent [&_.react-flow__node-default]:!p-0 [&_.react-flow__node-default]:!shadow-none"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.8} color="#D8DDEA" />
        <Controls />
      </ReactFlow>

      {previewShot && (
        <Surface className="absolute bottom-5 right-5 top-5 z-20 flex w-[420px] flex-col overflow-hidden">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-nc-border bg-white px-5 py-4">
            <div className="min-w-0">
              <div className="line-clamp-1 text-[16px] font-semibold leading-6 text-nc-text">镜头合约编辑器</div>
              <div className="mt-1 text-[12px] leading-5 text-nc-text-tertiary">Shot {previewShot.index} · {previewShot.duration}s</div>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone={previewShot.id === selectedShotId ? "accent" : "neutral"}>已联动</Pill>
              <Button size="icon" variant="ghost" aria-label="关闭镜头编辑器" onClick={() => setEditorOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div ref={editorScrollRef} className="min-h-0 flex-1 space-y-4 overflow-auto px-5 pb-5 pt-4">
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <label className="grid gap-2">
                <span className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">标题</span>
                <input
                  value={previewShot.title}
                onChange={(event) => {
                  updateShot(previewShot.id, { title: event.target.value });
                  syncPlanShot(previewShot.id, { title: event.target.value });
                }}
                  className="min-h-11 rounded-[13px] border border-nc-border bg-white px-4 text-[14px] font-semibold leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">时长</span>
                <input
                  type="number"
                  min={2}
                  max={15}
                  value={previewShot.duration}
                  onChange={(event) => {
                    const duration = Math.max(2, Math.min(15, Number(event.target.value) || 4));
                    updateShot(previewShot.id, { duration });
                    syncPlanShot(previewShot.id, { duration });
                  }}
                  className="min-h-11 rounded-[13px] border border-nc-border bg-white px-4 text-[14px] font-semibold leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                />
              </label>
            </div>

            <div className="grid grid-cols-[1fr_144px] gap-3">
              <label className="grid gap-2">
                <span className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">状态</span>
                <select
                  value={previewShot.status}
                  onChange={(event) => {
                    updateShot(previewShot.id, { status: event.target.value });
                    syncPlanShot(previewShot.id, { status: event.target.value });
                  }}
                  className="min-h-11 rounded-[13px] border border-nc-border bg-white px-4 text-[14px] font-semibold leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                >
                  {[
                    ["planned", "已规划"],
                    ["pending", "待生成"],
                    ["queued", "排队中"],
                    ["generating", "生成中"],
                    ["succeeded", "已生成"],
                    ["failed", "失败"],
                  ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <div className="grid gap-2">
                <span className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">顺序</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label="前移镜头"
                    onClick={() => moveShot(previewShot, -1)}
                    disabled={selectedIndex <= 0}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label="后移镜头"
                    onClick={() => moveShot(previewShot, 1)}
                    disabled={selectedIndex >= shots.length - 1}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <label className="grid gap-2 rounded-[14px] border border-nc-border bg-nc-bg p-4">
              <span className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-nc-text">
                <Camera className="h-4 w-4 text-nc-accent" />
                Camera Motion
              </span>
              <textarea
                value={previewShot.camera || previewCard?.camera_contract || ""}
                onChange={(event) => updateShotCamera(previewShot, event.target.value)}
                rows={3}
                className="w-full resize-none rounded-[12px] border border-nc-border bg-white px-4 py-3 text-[13px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              />
            </label>

            <label className="grid gap-2 rounded-[14px] border border-nc-border bg-nc-bg p-4">
              <span className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-nc-text">
                <FileText className="h-4 w-4 text-nc-accent" />
                Prompt Contract
              </span>
              <textarea
                value={previewShot.generationParams?.shot_script || previewCard?.motion_contract || ""}
                onChange={(event) => updateShotScript(previewShot, event.target.value)}
                rows={4}
                className="w-full resize-none rounded-[12px] border border-nc-border bg-white px-4 py-3 text-[13px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              />
            </label>

            <label className="grid gap-2 rounded-[14px] border border-nc-border bg-nc-bg p-4">
              <span className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-nc-text">
                <Sparkles className="h-4 w-4 text-nc-accent" />
                主提示词
              </span>
              <textarea
                value={previewShot.prompt}
                onChange={(event) => {
                  updateShot(previewShot.id, { prompt: event.target.value });
                  syncPlanShot(previewShot.id, { prompt: event.target.value });
                }}
                rows={4}
                className="w-full resize-none rounded-[12px] border border-nc-border bg-white px-4 py-3 text-[13px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              />
            </label>

            <label className="grid gap-2 rounded-[14px] border border-nc-border bg-nc-bg p-4">
              <span className="text-[13px] font-semibold leading-5 text-nc-text">Reference Contract</span>
              <textarea
                value={previewCard?.reference_contract || ""}
                onChange={(event) => updateShotCard(previewShot.id, { reference_contract: event.target.value })}
                rows={3}
                className="w-full resize-none rounded-[12px] border border-nc-border bg-white px-4 py-3 text-[13px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              />
            </label>

            <label className="grid gap-2 rounded-[14px] border border-nc-border bg-nc-bg p-4">
              <span className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-nc-text">
                <ListChecks className="h-4 w-4 text-nc-accent" />
                风险点
              </span>
              <textarea
                value={(previewCard?.risk_flags || []).join("\n")}
                onChange={(event) => updateShotCard(previewShot.id, { risk_flags: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })}
                rows={3}
                className="w-full resize-none rounded-[12px] border border-nc-border bg-white px-4 py-3 text-[13px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              />
            </label>

            <label className="grid gap-2 rounded-[14px] border border-nc-border bg-nc-bg p-4">
              <span className="text-[13px] font-semibold leading-5 text-nc-text">剪辑备注</span>
              <textarea
                value={previewCard?.edit_note || ""}
                onChange={(event) => updateShotCard(previewShot.id, { edit_note: event.target.value })}
                rows={3}
                className="w-full resize-none rounded-[12px] border border-nc-border bg-white px-4 py-3 text-[13px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => duplicateShot(previewShot)}>
                <Copy className="h-4 w-4" />
                复制
              </Button>
              <Button variant="secondary" onClick={() => insertShotAfter(previewShot)}>
                <Plus className="h-4 w-4" />
                插入
              </Button>
              <Button variant="danger" onClick={() => deleteShot(previewShot)} disabled={shots.length <= 1}>
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
            </div>
          </div>
        </Surface>
      )}
    </div>
  );
}
