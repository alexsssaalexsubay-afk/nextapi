import type { Edge, Node } from "@xyflow/react";
import type { ReferenceAsset, Shot, ShotGenerationCard, StructuredPrompt } from "@/stores/director-store";

export type StoryflowNodeKind =
  | "intent"
  | "prompt"
  | "reference"
  | "camera"
  | "scene"
  | "shot"
  | "output"
  | "review"
  | "version";

export type StoryflowNodeAction = "focus" | "duplicate" | "delete" | "inspect";

export interface StoryflowNodeData extends Record<string, unknown> {
  kind: StoryflowNodeKind;
  title: string;
  eyebrow: string;
  description: string;
  metric?: string;
  shotId?: string;
  sceneId?: string;
  collapsed?: boolean;
  status?: string;
  thumbnail?: string;
  tags?: string[];
  score?: number;
  onAction?: (action: StoryflowNodeAction, node: StoryflowNodeData) => void;
}

export type StoryflowNode = Node<StoryflowNodeData, "storyflow">;

export interface StoryflowClip {
  id: string;
  shotId: string;
  title: string;
  duration: number;
  start: number;
  thumbnail?: string;
  status: string;
  prompt: string;
  camera: string;
}

const nodeWidthByKind: Record<StoryflowNodeKind, number> = {
  intent: 260,
  prompt: 280,
  reference: 290,
  camera: 290,
  scene: 310,
  shot: 260,
  output: 280,
  review: 260,
  version: 260,
};

function shotStatusText(shot?: Shot) {
  if (!shot) return "待规划";
  if (shot.video_url || shot.status === "succeeded") return "已生成";
  if (shot.status === "queued") return "排队中";
  if (shot.status === "generating" || shot.status === "processing") return "生成中";
  if (shot.status === "failed") return "失败";
  return "已规划";
}

export function buildStoryflowGraph(input: {
  prompt: string;
  structuredPrompt: StructuredPrompt;
  references: ReferenceAsset[];
  shots: Shot[];
  cards: ShotGenerationCard[];
}) {
  const { prompt, structuredPrompt, references, shots, cards } = input;
  const totalDuration = shots.reduce((sum, shot) => sum + (Number(shot.duration) || 0), 0);
  const sceneIds = Array.from(new Set(shots.map((shot) => shot.scene_id || "scene_1")));
  const primaryShot = shots[0];
  const selectedCard = cards[0];
  const outputX = Math.max(1844, 1246 + Math.ceil(Math.max(shots.length, 1) / 2) * 286 + 320);

  const nodes: StoryflowNode[] = [
    {
      id: "intent",
      type: "storyflow" as const,
      position: { x: 40, y: 156 },
      data: {
        kind: "intent",
        eyebrow: "Intent Node",
        title: "用户意图 / Brief",
        description: prompt || structuredPrompt.subject || "从 AI 导演输入一句创意，系统会拆解为可执行的镜头计划。",
        metric: `${totalDuration || 30}s`,
        tags: [structuredPrompt.style || "品牌广告", structuredPrompt.action || "创意目标"],
      },
      width: nodeWidthByKind.intent,
    },
    {
      id: "prompt",
      type: "storyflow" as const,
      position: { x: 316, y: 88 },
      data: {
        kind: "prompt",
        eyebrow: "Prompt Strategy",
        title: "提示词策略",
        description: structuredPrompt.scene || selectedCard?.motion_contract || "拆分主体、动作、场景、光线、声音和负面约束。",
        metric: "结构化",
        tags: [structuredPrompt.lighting || "Lighting", structuredPrompt.audio || "Audio Cue"],
      },
      width: nodeWidthByKind.prompt,
    },
    {
      id: "reference",
      type: "storyflow" as const,
      position: { x: 316, y: 330 },
      data: {
        kind: "reference",
        eyebrow: "Reference Stack",
        title: "参考素材栈",
        description: references[0]?.description || selectedCard?.reference_contract || "锁定品牌、主体、材质、色调和镜头参考，避免生成跑偏。",
        metric: `${Math.max(references.length, 3)} refs`,
        thumbnail: references[0]?.url || primaryShot?.thumbnail_url,
        tags: ["品牌", "材质", "风格"],
      },
      width: nodeWidthByKind.reference,
    },
    {
      id: "camera",
      type: "storyflow" as const,
      position: { x: 622, y: 204 },
      data: {
        kind: "camera",
        eyebrow: "Camera Motion",
        title: "镜头语言 / 运镜",
        description: primaryShot?.camera || structuredPrompt.camera || "稳定推进、轻微环绕、主体始终清晰，运动强度中等。",
        metric: "0.65",
        tags: ["推近", "稳定", "浅景深"],
      },
      width: nodeWidthByKind.camera,
    },
    ...sceneIds.map((sceneId, index) => {
      const sceneShots = shots.filter((shot) => (shot.scene_id || "scene_1") === sceneId);
      return {
        id: `scene_${sceneId}`,
        type: "storyflow" as const,
        position: { x: 926, y: 70 + index * 206 },
        data: {
          kind: "scene" as const,
          eyebrow: "Scene Group",
          title: `场景组 ${index + 1}`,
          description: sceneShots.map((shot) => shot.title).join(" / ") || "将相关镜头聚合为一个叙事段落。",
          metric: `${sceneShots.length} shots`,
          sceneId,
          tags: ["可折叠", "可重组"],
        },
        width: nodeWidthByKind.scene,
      } satisfies StoryflowNode;
    }),
    ...shots.map((shot, index) => ({
      id: `shot_${shot.id}`,
      type: "storyflow" as const,
      position: { x: 1246 + (index % 2) * 286, y: 64 + Math.floor(index / 2) * 224 },
      data: {
        kind: "shot" as const,
        eyebrow: `Shot ${String(index + 1).padStart(2, "0")}`,
        title: shot.title,
        description: shot.generationParams?.shot_script || shot.prompt,
        metric: `${shot.duration}s`,
        shotId: shot.id,
        sceneId: shot.scene_id,
        status: shotStatusText(shot),
        thumbnail: shot.thumbnail_url,
        score: shot.qualityScore?.overall,
        tags: [shot.status || "planned", shot.camera?.split(",")[0] || "camera"],
      },
      width: nodeWidthByKind.shot,
    } satisfies StoryflowNode)),
    {
      id: "output",
      type: "storyflow" as const,
      position: { x: outputX, y: 160 },
      data: {
        kind: "output",
        eyebrow: "Output Node",
        title: "时间线 / 输出",
        description: `当前 ${shots.length} 个镜头，总时长 ${totalDuration || 0}s。用于生成、复核、导出和版本归档。`,
        metric: `${shots.length} clips`,
        tags: ["Timeline", "Render", "Export"],
      },
      width: nodeWidthByKind.output,
    },
    {
      id: "review",
      type: "storyflow" as const,
      position: { x: outputX, y: 404 },
      data: {
        kind: "review",
        eyebrow: "Review Node",
        title: "质量检查建议",
        description: "检查镜头连续性、提示词完整度、参考一致性、时长节奏和生成状态。",
        metric: "QA",
        tags: ["连续性", "风险", "版本"],
      },
      width: nodeWidthByKind.review,
    },
    {
      id: "version",
      type: "storyflow" as const,
      position: { x: outputX + 294, y: 286 },
      data: {
        kind: "version",
        eyebrow: "Version Node",
        title: "版本快照",
        description: "保存当前 Storyflow，便于对比、回滚和交付前确认。",
        metric: "v1",
        tags: ["Snapshot", "Rollback"],
      },
      width: nodeWidthByKind.version,
    },
  ];

  const edges: Edge[] = [
    { id: "intent_prompt", source: "intent", target: "prompt", animated: true },
    { id: "intent_reference", source: "intent", target: "reference", animated: true },
    { id: "prompt_camera", source: "prompt", target: "camera" },
    { id: "reference_camera", source: "reference", target: "camera" },
    ...sceneIds.map((sceneId) => ({ id: `camera_scene_${sceneId}`, source: "camera", target: `scene_${sceneId}` })),
    ...shots.map((shot) => ({
      id: `scene_shot_${shot.id}`,
      source: `scene_${shot.scene_id || "scene_1"}`,
      target: `shot_${shot.id}`,
    })),
    ...shots.slice(0, -1).map((shot, index) => ({
      id: `shot_seq_${shot.id}_${shots[index + 1].id}`,
      source: `shot_${shot.id}`,
      target: `shot_${shots[index + 1].id}`,
      animated: true,
    })),
    ...(shots.length ? [{ id: "last_output", source: `shot_${shots[shots.length - 1].id}`, target: "output" }] : []),
    { id: "output_review", source: "output", target: "review" },
    { id: "review_version", source: "review", target: "version" },
  ];

  const clips: StoryflowClip[] = shots.reduce<StoryflowClip[]>((items, shot) => {
    const start = items.reduce((sum, item) => sum + item.duration, 0);
    items.push({
      id: `clip_${shot.id}`,
      shotId: shot.id,
      title: shot.title,
      duration: Number(shot.duration) || 0,
      start,
      thumbnail: shot.thumbnail_url,
      status: shotStatusText(shot),
      prompt: shot.prompt,
      camera: shot.camera,
    });
    return items;
  }, []);

  return { nodes, edges, clips, totalDuration };
}
