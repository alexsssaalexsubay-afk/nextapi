import type { AgentProgress } from "@/stores/director-store";

export type AgentRunStatus = "pending" | "ready" | "running" | "complete" | "failed";

export interface OrchestrationAgent {
  id: string;
  name: string;
  role: string;
  roleZh: string;
  phase: string;
  accent: string;
  initial: string;
  summary: string;
  consumes: string[];
  produces: string[];
  dependencies: string[];
  checkpoints: string[];
}

export const ORCHESTRATION_AGENTS: OrchestrationAgent[] = [
  {
    id: "screenwriter",
    name: "Alex",
    role: "编剧策划",
    roleZh: "编剧策划",
    phase: "需求理解",
    accent: "#6366F1",
    initial: "A",
    summary: "把用户创意拆成可执行的故事结构、场景目标和镜头节奏。",
    consumes: ["用户需求", "风格", "时长"],
    produces: ["故事弧线", "场景目标", "叙事节奏"],
    dependencies: [],
    checkpoints: ["目标清晰", "单镜头动作可读"],
  },
  {
    id: "character_extractor",
    name: "Maya",
    role: "角色设计",
    roleZh: "角色一致性",
    phase: "角色",
    accent: "#EC4899",
    initial: "M",
    summary: "提取角色文字锚点，准备身份锁定和后续角色资产生产。",
    consumes: ["故事弧线", "场景目标"],
    produces: ["角色锚点", "外观约束", "身份锁定建议"],
    dependencies: ["screenwriter"],
    checkpoints: ["角色命名唯一", "外观不互相冲突"],
  },
  {
    id: "storyboard_artist",
    name: "Jin",
    role: "分镜设计",
    roleZh: "分镜设计",
    phase: "分镜",
    accent: "#F59E0B",
    initial: "J",
    summary: "把场景拆成镜头，并输出分镜图、首帧、尾帧所需的关键画面描述。",
    consumes: ["故事弧线", "角色锚点", "参考策略"],
    produces: ["镜头简报", "首尾帧描述", "分镜关键帧"],
    dependencies: ["screenwriter", "character_extractor"],
    checkpoints: ["镜头顺序完整", "缩略图可生成"],
  },
  {
    id: "cinematographer",
    name: "Leo",
    role: "摄影指导",
    roleZh: "摄影指导",
    phase: "运镜",
    accent: "#10B981",
    initial: "L",
    summary: "把镜头转成镜头语言、构图、焦段、运镜强度和相机运动约束。",
    consumes: ["镜头简报", "场景情绪", "角色运动"],
    produces: ["运镜说明", "运动路径", "镜头规则"],
    dependencies: ["storyboard_artist"],
    checkpoints: ["单运镜原则", "运动强度合规"],
  },
  {
    id: "audio_director",
    name: "Aria",
    role: "声音导演",
    roleZh: "声音导演",
    phase: "声音",
    accent: "#3B82F6",
    initial: "R",
    summary: "生成对白、音乐、音效和环境声提示，给视频生成与剪辑节奏做约束。",
    consumes: ["镜头简报", "叙事节奏", "场景情绪"],
    produces: ["声音提示", "对白节奏", "音效建议"],
    dependencies: ["storyboard_artist"],
    checkpoints: ["声画不冲突", "对白长度可控"],
  },
  {
    id: "prompt_optimizer",
    name: "Nova",
    role: "提示词优化",
    roleZh: "提示词工程",
    phase: "提示词",
    accent: "#F97316",
    initial: "N",
    summary: "把文本、参考、镜头和制作约束整理成可提交的生成参数。",
    consumes: ["镜头简报", "运镜说明", "参考素材", "制作约束"],
    produces: ["Seedance 提示词", "参考说明", "生成参数"],
    dependencies: ["storyboard_artist", "cinematographer", "character_extractor"],
    checkpoints: ["SVO 清晰", "垫图传参完整"],
  },
  {
    id: "consistency_checker",
    name: "Kai",
    role: "质量检查",
    roleZh: "质量检查",
    phase: "预检",
    accent: "#8B5CF6",
    initial: "K",
    summary: "执行生成前检查，发现角色漂移、参考缺失、生成服务限制和提示词冲突。",
    consumes: ["生成参数", "身份锁定", "服务限制"],
    produces: ["预检结果", "阻断项", "修复建议"],
    dependencies: ["prompt_optimizer", "character_extractor"],
    checkpoints: ["角色锁已继承", "服务限制通过"],
  },
  {
    id: "editing_agent",
    name: "Sam",
    role: "剪辑师",
    roleZh: "剪辑师",
    phase: "时间线",
    accent: "#14B8A6",
    initial: "S",
    summary: "把可生成镜头转成剪辑节奏、转场、时间线顺序和交付前复核建议。",
    consumes: ["镜头卡片", "质量报告", "音频节奏"],
    produces: ["时间线建议", "转场建议", "交付检查"],
    dependencies: ["consistency_checker", "audio_director"],
    checkpoints: ["总时长匹配", "节奏不跳断"],
  },
];

export const ORCHESTRATION_ORDER = ORCHESTRATION_AGENTS.map((agent) => agent.id);

export function getOrchestrationAgent(id: string) {
  return ORCHESTRATION_AGENTS.find((agent) => agent.id === id);
}

export function getProgressMap(agentProgress: AgentProgress[]) {
  return new Map(agentProgress.map((progress) => [progress.agent, progress]));
}

export function normalizeAgentStatus(status?: string): Exclude<AgentRunStatus, "ready"> {
  if (status === "complete") return "complete";
  if (status === "running" || status === "progress") return "running";
  if (status === "failed" || status === "error") return "failed";
  return "pending";
}

export function getAgentRunStatus(agent: OrchestrationAgent, progressMap: Map<string, AgentProgress>): AgentRunStatus {
  const progressStatus = normalizeAgentStatus(progressMap.get(agent.id)?.status);
  if (progressStatus !== "pending") return progressStatus;
  const dependenciesReady = agent.dependencies.every((dependency) => progressMap.get(dependency)?.status === "complete");
  return dependenciesReady ? "ready" : "pending";
}

export function getDependencySummary(agent: OrchestrationAgent, progressMap: Map<string, AgentProgress>) {
  const complete = agent.dependencies.filter((dependency) => progressMap.get(dependency)?.status === "complete").length;
  return {
    complete,
    total: agent.dependencies.length,
    ready: complete === agent.dependencies.length,
  };
}

export function getAgentProgressPercent(agentId: string, progressMap: Map<string, AgentProgress>) {
  const progress = progressMap.get(agentId);
  return progress ? Math.round(Math.max(0, Math.min(1, progress.progress)) * 100) : 0;
}
