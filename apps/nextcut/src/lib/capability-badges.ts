import type { StoryflowNodeKind } from "@/components/storyflow/storyflow-types";

export type CapabilityKind = "text" | "image" | "video" | "audio" | "preflight" | "local" | "cloud";

export const capabilityMeta: Record<CapabilityKind, {
  label: string;
  shortLabel: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  hint: string;
}> = {
  text: {
    label: "文字 LLM",
    shortLabel: "LLM",
    tone: "info",
    hint: "调用语言模型，产出脚本、分镜、镜头语言、提示词或检查建议。",
  },
  image: {
    label: "图片 / 垫图",
    shortLabel: "图片",
    tone: "warning",
    hint: "读取或生成图片资产，可作为角色、分镜、首帧、尾帧或参考垫图。",
  },
  video: {
    label: "视频生成",
    shortLabel: "视频",
    tone: "accent",
    hint: "调用视频生成 provider，提交 prompt、参考图、参考视频、音频和参数。",
  },
  audio: {
    label: "音频",
    shortLabel: "音频",
    tone: "success",
    hint: "生成或传递对白、音乐、音效、字幕线索。",
  },
  preflight: {
    label: "本地预检",
    shortLabel: "预检",
    tone: "danger",
    hint: "在提交生成前本地检查 provider 限制、垫图缺失和参数冲突。",
  },
  local: {
    label: "本地状态",
    shortLabel: "本地",
    tone: "neutral",
    hint: "仅保存或组织本地工作区状态，不直接调用模型。",
  },
  cloud: {
    label: "云端任务",
    shortLabel: "云端",
    tone: "accent",
    hint: "会向远程 API 或队列提交任务，成本和排队时间取决于 provider。",
  },
};

export function storyflowCapabilityForKind(kind: StoryflowNodeKind): CapabilityKind {
  if (kind === "reference") return "image";
  if (kind === "shot" || kind === "output") return "video";
  if (kind === "review") return "preflight";
  if (kind === "version") return "local";
  return "text";
}

export function workflowCapabilityLabel(workflow: string) {
  if (workflow === "image_to_video") return "图生视频 / 需要垫图";
  if (workflow === "multimodal_story") return "多模态 / 图+视频参考";
  return "文生视频 / 可无垫图";
}
