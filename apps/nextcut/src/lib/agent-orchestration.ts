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
    role: "Screenwriter",
    roleZh: "编剧策划",
    phase: "Brief",
    accent: "#6366F1",
    initial: "A",
    summary: "把用户创意拆成可执行的故事结构、场景目标和镜头节奏。",
    consumes: ["用户 Brief", "风格", "时长"],
    produces: ["故事弧线", "场景目标", "叙事节奏"],
    dependencies: [],
    checkpoints: ["目标清晰", "单镜头动作可读"],
  },
  {
    id: "character_extractor",
    name: "Maya",
    role: "Identity Designer",
    roleZh: "角色一致性",
    phase: "Character",
    accent: "#EC4899",
    initial: "M",
    summary: "提取角色文字锚点，准备 Identity Lock 和后续角色资产生产。",
    consumes: ["故事弧线", "场景目标"],
    produces: ["角色锚点", "外观约束", "身份锁定建议"],
    dependencies: ["screenwriter"],
    checkpoints: ["角色命名唯一", "外观不互相冲突"],
  },
  {
    id: "storyboard_artist",
    name: "Jin",
    role: "Storyboard Artist",
    roleZh: "分镜设计",
    phase: "Storyboard",
    accent: "#F59E0B",
    initial: "J",
    summary: "把场景拆成 shot，并输出分镜图、首帧、尾帧所需的关键画面描述。",
    consumes: ["故事弧线", "角色锚点", "参考策略"],
    produces: ["Shot Brief", "首尾帧描述", "Storyboard Keyframe"],
    dependencies: ["screenwriter", "character_extractor"],
    checkpoints: ["镜头顺序完整", "缩略图可生成"],
  },
  {
    id: "cinematographer",
    name: "Leo",
    role: "Cinematographer",
    roleZh: "摄影指导",
    phase: "Camera",
    accent: "#10B981",
    initial: "L",
    summary: "把 shot 转成镜头语言、构图、焦段、运镜强度和相机运动约束。",
    consumes: ["Shot Brief", "场景情绪", "角色运动"],
    produces: ["Camera Contract", "Motion Path", "Lens Rules"],
    dependencies: ["storyboard_artist"],
    checkpoints: ["单运镜原则", "运动强度合规"],
  },
  {
    id: "audio_director",
    name: "Aria",
    role: "Audio Director",
    roleZh: "声音导演",
    phase: "Audio",
    accent: "#3B82F6",
    initial: "R",
    summary: "生成对白、音乐、音效和环境声提示，给视频生成与剪辑节奏做约束。",
    consumes: ["Shot Brief", "叙事节奏", "场景情绪"],
    produces: ["Audio Cues", "对白节奏", "SFX 建议"],
    dependencies: ["storyboard_artist"],
    checkpoints: ["声画不冲突", "对白长度可控"],
  },
  {
    id: "prompt_optimizer",
    name: "Nova",
    role: "Prompt Engineer",
    roleZh: "提示词工程",
    phase: "Prompt",
    accent: "#F97316",
    initial: "N",
    summary: "把文本、参考、镜头和 Production Bible 编译成 provider-ready 生成参数。",
    consumes: ["Shot Brief", "Camera Contract", "Reference Stack", "Production Bible"],
    produces: ["Seedance Prompt", "Reference Instructions", "Generation Params"],
    dependencies: ["storyboard_artist", "cinematographer", "character_extractor"],
    checkpoints: ["SVO 清晰", "垫图传参完整"],
  },
  {
    id: "consistency_checker",
    name: "Kai",
    role: "Quality Inspector",
    roleZh: "质量检查",
    phase: "Preflight",
    accent: "#8B5CF6",
    initial: "K",
    summary: "执行生成前检查，发现角色漂移、参考缺失、provider 限制和 prompt 冲突。",
    consumes: ["Generation Params", "Identity Lock", "Provider Limits"],
    produces: ["Preflight Findings", "阻断项", "修复建议"],
    dependencies: ["prompt_optimizer", "character_extractor"],
    checkpoints: ["角色锁已继承", "Provider 限制通过"],
  },
  {
    id: "editing_agent",
    name: "Sam",
    role: "Film Editor",
    roleZh: "剪辑师",
    phase: "Timeline",
    accent: "#14B8A6",
    initial: "S",
    summary: "把可生成镜头转成剪辑节奏、转场、时间线顺序和交付前复核建议。",
    consumes: ["Shot Cards", "质量报告", "音频节奏"],
    produces: ["Timeline Notes", "转场建议", "交付检查"],
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
