import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Check, Circle, Clapperboard, HelpCircle, Image, Link, Rocket, ShoppingBag, Smile, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Pill, Segmented, SelectField, Surface } from "@/components/ui/kit";
import { StructuredPromptBuilder } from "@/components/director/StructuredPromptBuilder";
import { CharacterPanel } from "@/components/director/CharacterPanel";
import { PipelineStepFlow } from "@/components/director/PipelineStepFlow";
import { ORCHESTRATION_AGENTS, ORCHESTRATION_ORDER } from "@/lib/agent-orchestration";
import {
  DIRECTOR_KNOWLEDGE_SOURCES,
  TECHNIQUE_PACKS,
  buildKnowledgeRuleList,
  inferTaskType,
  pickCameraPreset,
  scoreProvidersForTask,
  type KnowledgeSourceId,
  type ProviderRecommendation,
} from "@/lib/director-knowledge";
import { checkHealth, sidecarFetch, SidecarError } from "@/lib/sidecar";
import {
  CAMERA_MOVEMENTS,
  IMAGE_PROMPT_PRESETS,
  LIGHTING_STYLES,
  MANGA_DRAMA_TROPES,
  OPTICS_AND_LENSES,
} from "@/lib/prompt-dictionary";
import { useAppStore } from "@/stores/app-store";
import {
  useDirectorStore,
  type CharacterProfile,
  type PipelineStep,
  type ProductionBible,
  type PromptReviewSummary,
  type QualityScore,
  type ReferenceAsset,
  type SceneOutline,
  type Shot,
  type ShotGenerationCard,
  type StructuredPrompt,
} from "@/stores/director-store";

const PROMPT_LIMIT = 1000;

const workflowModes = [
  {
    id: "quick",
    title: "快速概念",
    subtitle: "一句话先拆成完整提案",
    icon: "rocket",
    workflow: "text_to_video" as const,
    shots: 8,
    duration: 4,
    tags: ["快速", "创意探索", "概念草图"],
  },
  {
    id: "product",
    title: "产品 / 广告",
    subtitle: "卖点、镜头、转化目标优先",
    icon: "bag",
    workflow: "image_to_video" as const,
    shots: 10,
    duration: 5,
    tags: ["转化导向", "卖点突出", "营销"],
  },
  {
    id: "story",
    title: "故事 / 剧情",
    subtitle: "叙事弧线、角色一致性和情绪推进",
    icon: "clapper",
    workflow: "multimodal_story" as const,
    shots: 12,
    duration: 5,
    tags: ["双事驱动", "电影感", "情绪表达"],
  },
  {
    id: "social",
    title: "社交 / UGC",
    subtitle: "前 2 秒钩子和高互动短视频",
    icon: "smile",
    workflow: "text_to_video" as const,
    shots: 6,
    duration: 4,
    tags: ["短平快", "高互动", "社媒优先"],
  },
];

const visualStyles = [
  { id: "natural", label: "写实自然", value: "photorealistic commercial film, clean composition, natural movement" },
  { id: "cinematic", label: "电影质感", value: "cinematic realistic, restrained color grade, production-grade lighting" },
  { id: "cyberpunk", label: "赛博霓虹", value: "neon lighting, cyan and violet reflections, cinematic sci-fi atmosphere" },
  { id: "short_drama", label: "短剧冲突", value: "viral short drama, strong hook, vertical framing, intense emotional beat" },
];

const durations = [
  { label: "15 秒", total: 15 },
  { label: "30 秒", total: 30 },
  { label: "45 秒", total: 45 },
  { label: "60 秒", total: 60 },
];
const shotCounts = ["6-8 个镜头", "10-12 个镜头", "14-18 个镜头"];

const pipelineSteps: Array<{ id: PipelineStep; label: string; doneLabel: string }> = [
  { id: "planning", label: "需求分析与理解", doneLabel: "已理解" },
  { id: "script_review", label: "创意构思中", doneLabel: "脚本完成" },
  { id: "storyboard_review", label: "生成分镜脚本", doneLabel: "分镜完成" },
  { id: "prompt_review", label: "生成镜头清单", doneLabel: "提示词完成" },
  { id: "generating", label: "输出制作建议", doneLabel: "剪辑建议完成" },
];

const agentTeam = ORCHESTRATION_AGENTS;

function Icon({ name, className }: { name: string; className?: string }) {
  const common = cn("h-4 w-4", className);
  if (name === "rocket") return <Rocket className={common} />;
  if (name === "bag") return <ShoppingBag className={common} />;
  if (name === "clapper") return <Clapperboard className={common} />;
  if (name === "smile") return <Smile className={common} />;
  if (name === "spark") return <Sparkles className={common} />;
  return <Circle className={common} />;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferTitle(prompt: string) {
  const text = prompt.trim().replace(/[。！？!?].*$/, "");
  if (!text) return "未命名创意";
  return text.length > 18 ? `${text.slice(0, 18)}...` : text;
}

function compileStructuredIntent(structuredPrompt: StructuredPrompt) {
  return [
    structuredPrompt.subject && `Subject: ${structuredPrompt.subject.trim()}`,
    structuredPrompt.action && `Action: ${structuredPrompt.action.trim()}`,
    structuredPrompt.scene && `Scene: ${structuredPrompt.scene.trim()}`,
    structuredPrompt.camera && `Camera: ${structuredPrompt.camera.trim()}`,
    structuredPrompt.motion && `Motion: ${structuredPrompt.motion.trim()}`,
    structuredPrompt.style && `Style: ${structuredPrompt.style.trim()}`,
    structuredPrompt.lighting && `Lighting: ${structuredPrompt.lighting.trim()}`,
    structuredPrompt.audio && `Audio: ${structuredPrompt.audio.trim()}`,
    structuredPrompt.constraints && `Constraints: ${structuredPrompt.constraints.trim()}`,
  ].filter(Boolean).join(". ");
}

function inferReferenceType(url: string): ReferenceAsset["type"] {
  const lower = url.toLowerCase();
  if (/\.(mp3|wav|m4a|aac|flac)(\?|#|$)/.test(lower)) return "audio";
  if (/\.(mp4|mov|webm|mkv)(\?|#|$)/.test(lower)) return "video";
  return "image";
}

function pickFrom<T>(items: T[], index: number) {
  return items[index % items.length];
}

function durationForTotal(total: number, shotCount: number) {
  return Math.max(4, Math.min(15, Math.round(total / Math.max(1, shotCount))));
}

function makeStoryboardThumb(index: number, prompt = "") {
  const isCoffee = /咖啡|coffee|饮品|杯/.test(prompt);
  const isTravel = /旅行|海岛|酒店|vlog|风景|城市|户外/.test(prompt);
  const isFood = /美食|餐厅|食物|料理/.test(prompt);
  const palettes = [
    ["#84CCF5", "#2563EB", "#0F172A"],
    ["#FDBA74", "#B45309", "#1F1307"],
    ["#5EEAD4", "#0F766E", "#071B1C"],
    ["#FDA4AF", "#BE123C", "#220617"],
    ["#A7F3D0", "#4F46E5", "#0B1120"],
  ];
  const [a, b, c] = pickFrom(palettes, index);
  const coffeeVariant = index % 6;
  const foreground = isCoffee
    ? coffeeVariant === 1
      ? `<ellipse cx="326" cy="274" rx="154" ry="20" fill="#020617" opacity=".26"/><rect x="218" y="154" width="204" height="78" rx="28" fill="#F8FAFC" opacity=".90"/><rect x="242" y="174" width="92" height="38" rx="16" fill="${b}" opacity=".82"/><path d="M426 170h34c18 0 31 12 31 28s-13 28-31 28h-34" fill="none" stroke="#F8FAFC" stroke-width="16" stroke-linecap="round" opacity=".82"/><path d="M208 132c72-28 152-28 238 0" fill="none" stroke="#F8FAFC" stroke-width="9" stroke-linecap="round" opacity=".36"/>`
      : coffeeVariant === 2
      ? `<path d="M0 254c86-42 174-45 266-17 104 32 186 20 374-55v178H0z" fill="#F8FAFC" opacity=".25"/><ellipse cx="338" cy="274" rx="124" ry="18" fill="#020617" opacity=".28"/><rect x="284" y="126" width="108" height="130" rx="24" fill="#F8FAFC" opacity=".92"/><rect x="304" y="158" width="68" height="64" rx="17" fill="${b}" opacity=".82"/><circle cx="492" cy="96" r="42" fill="#FDE68A" opacity=".72"/>`
      : coffeeVariant === 3
      ? `<ellipse cx="320" cy="268" rx="126" ry="18" fill="#020617" opacity=".30"/><rect x="260" y="118" width="120" height="140" rx="32" fill="#F8FAFC" opacity=".92"/><rect x="286" y="146" width="68" height="82" rx="18" fill="${b}" opacity=".88"/><path d="M190 130c50 34 96 48 138 42" fill="none" stroke="#F8FAFC" stroke-width="14" stroke-linecap="round" opacity=".30"/><path d="M388 166h30c18 0 31 13 31 31s-13 31-31 31h-30" fill="none" stroke="#F8FAFC" stroke-width="18" stroke-linecap="round" opacity=".82"/>`
      : coffeeVariant === 4
      ? `<ellipse cx="318" cy="276" rx="156" ry="18" fill="#020617" opacity=".26"/><rect x="238" y="124" width="164" height="126" rx="26" fill="#F8FAFC" opacity=".88"/><rect x="270" y="156" width="98" height="60" rx="18" fill="${b}" opacity=".80"/><path d="M192 108h256" stroke="#F8FAFC" stroke-width="10" stroke-linecap="round" opacity=".26"/><path d="M212 132h216" stroke="#F8FAFC" stroke-width="8" stroke-linecap="round" opacity=".22"/>`
      : coffeeVariant === 5
      ? `<ellipse cx="330" cy="272" rx="136" ry="18" fill="#020617" opacity=".30"/><rect x="264" y="110" width="132" height="150" rx="38" fill="#F8FAFC" opacity=".90"/><circle cx="330" cy="176" r="40" fill="${b}" opacity=".82"/><path d="M406 154h30c18 0 30 14 30 32s-12 32-30 32h-30" fill="none" stroke="#F8FAFC" stroke-width="18" stroke-linecap="round" opacity=".76"/><path d="M292 82c-10-22 14-30 4-50M350 82c-10-22 14-30 4-50" fill="none" stroke="#F8FAFC" stroke-width="8" stroke-linecap="round" opacity=".36"/>`
      : `<ellipse cx="320" cy="270" rx="122" ry="18" fill="#020617" opacity=".30"/><rect x="266" y="126" width="108" height="134" rx="24" fill="#F8FAFC" opacity=".94"/><rect x="286" y="156" width="68" height="74" rx="18" fill="${b}" opacity=".88"/><path d="M374 166h28c18 0 30 13 30 31s-12 31-30 31h-28" fill="none" stroke="#F8FAFC" stroke-width="18" stroke-linecap="round" opacity=".82"/><path d="M292 101c-12-23 15-32 3-54M334 101c-11-22 15-34 3-54" fill="none" stroke="#F8FAFC" stroke-width="8" stroke-linecap="round" opacity=".42"/>`
    : isTravel
    ? `<path d="M0 246c92-42 174-48 266-20 98 31 182 18 374-54v188H0z" fill="#F8FAFC" opacity=".30"/><path d="M0 286c134-34 250-36 360-6 96 26 174 24 280-18v98H0z" fill="#FFFFFF" opacity=".35"/><circle cx="470" cy="104" r="42" fill="#FDE68A" opacity=".82"/>`
    : isFood
    ? `<ellipse cx="320" cy="240" rx="160" ry="54" fill="#FFF7ED" opacity=".92"/><ellipse cx="320" cy="228" rx="118" ry="34" fill="#92400E" opacity=".70"/><circle cx="288" cy="218" r="18" fill="#FED7AA" opacity=".86"/><circle cx="348" cy="224" r="22" fill="#F97316" opacity=".76"/><path d="M212 170c60 30 126 34 210 6" fill="none" stroke="#F8FAFC" stroke-width="10" stroke-linecap="round" opacity=".55"/>`
    : `<ellipse cx="320" cy="274" rx="150" ry="18" fill="#020617" opacity=".28"/><rect x="260" y="104" width="120" height="170" rx="42" fill="#F8FAFC" opacity=".90"/><circle cx="320" cy="78" r="44" fill="#F8FAFC" opacity=".86"/><path d="M210 178c74-40 150-38 220 6" fill="none" stroke="#F8FAFC" stroke-width="10" stroke-linecap="round" opacity=".42"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${a}"/><stop offset=".56" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="r" cx=".22" cy=".20" r=".78"><stop stop-color="#FFFFFF" stop-opacity=".34"/><stop offset=".55" stop-color="#FFFFFF" stop-opacity=".06"/><stop offset="1" stop-color="#000000" stop-opacity=".14"/></radialGradient><filter id="soft"><feGaussianBlur stdDeviation="22"/></filter></defs><rect width="640" height="360" fill="url(#g)"/><rect width="640" height="360" fill="url(#r)"/><circle cx="${92 + index * 38}" cy="82" r="96" fill="#fff" opacity=".12" filter="url(#soft)"/><circle cx="520" cy="62" r="96" fill="#fff" opacity=".08" filter="url(#soft)"/>${foreground}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface BuildPlanOptions {
  shotCount: number;
  durationPerShot: number;
  motionTone: string;
  activeKnowledgeIds: KnowledgeSourceId[];
  activeTechniqueIds: string[];
  source: "engine" | "local";
}

interface SidecarPlanResult {
  status: string;
  error?: string;
  shots?: Array<{
    id: string;
    scene_id: string;
    index: number;
    title: string;
    duration: number;
    prompt: string;
    negative_prompt?: string;
    status: string;
    video_url?: string;
    thumbnail_url?: string;
    camera?: { camera?: string };
    audio?: Shot["audio"];
    generation_params?: Shot["generationParams"];
  }>;
  scenes?: SceneOutline[];
  characters?: Array<{
    name: string;
    appearance?: string;
    personality?: string;
    voice?: string;
    reference_images?: string[];
  }>;
  quality_scores?: Array<{
    shot_id: string;
    overall: number;
    character_consistency: number;
    prompt_quality: number;
    style_coherence: number;
  }>;
  workbench?: {
    production_bible?: ProductionBible;
    shot_generation_cards?: ShotGenerationCard[];
  };
  metadata?: {
    production_bible?: ProductionBible;
    shot_generation_cards?: ShotGenerationCard[];
    prompt_review?: PromptReviewSummary;
  };
}

function buildLocalPlan(prompt: string, modeId: string, aspectRatio: string, styleId: string, options: BuildPlanOptions) {
  const mode = workflowModes.find((item) => item.id === modeId) || workflowModes[0];
  const style = visualStyles.find((item) => item.id === styleId) || visualStyles[1];
  const title = inferTitle(prompt);
  const taskType = inferTaskType(prompt, mode.id);
  const knowledgeRules = buildKnowledgeRuleList(options.activeKnowledgeIds, options.activeTechniqueIds);
  const enabledSourceNames = DIRECTOR_KNOWLEDGE_SOURCES.filter((source) => options.activeKnowledgeIds.includes(source.id)).map((source) => source.name);
  const isProduct = mode.id === "product" || /产品|广告|品牌|发布|商业|口播|卖点/.test(prompt);
  const isTravel = /旅行|海岛|酒店|vlog|风景|城市|户外/.test(prompt);
  const isFood = /美食|餐厅|咖啡|饮品|食物|料理/.test(prompt);
  const isDrama = mode.id === "story" || /剧情|角色|冲突|故事|短剧|情绪/.test(prompt);
  const needsAudio = /口播|对白|音乐|音效|配音|旁白|lip|voice|song/.test(prompt.toLowerCase()) || mode.id === "story";
  const needsLipSync = /口播|对白|说话|台词|lip/.test(prompt.toLowerCase());
  const baseNoun = isProduct ? "主产品" : isTravel ? "旅行者" : isFood ? "主厨" : isDrama ? "主角" : "主体";
  const theme = isProduct ? "产品价值被看见" : isTravel ? "从抵达到沉浸体验" : isFood ? "味觉记忆被唤醒" : isDrama ? "情绪冲突逐步升级" : "创意从悬念到释然";
  const providerRecommendations = scoreProvidersForTask({
    taskType,
    shotCount: options.shotCount,
    needsAudio,
    needsLipSync,
    localOnly: /本地|离线|local/.test(prompt.toLowerCase()),
    budgetConstrained: /低成本|便宜|预算|快速草稿/.test(prompt),
  });
  const topProvider = providerRecommendations[0];
  const cameras = options.motionTone === "高"
    ? [CAMERA_MOVEMENTS.dynamic[0].value, CAMERA_MOVEMENTS.dynamic[2].value, CAMERA_MOVEMENTS.advanced[6].value, CAMERA_MOVEMENTS.advanced[4].value]
    : options.motionTone === "低"
    ? [CAMERA_MOVEMENTS.basic[0].value, CAMERA_MOVEMENTS.advanced[0].value, CAMERA_MOVEMENTS.advanced[1].value]
    : [CAMERA_MOVEMENTS.advanced[2].value, CAMERA_MOVEMENTS.basic[0].value, CAMERA_MOVEMENTS.advanced[4].value, CAMERA_MOVEMENTS.advanced[6].value, CAMERA_MOVEMENTS.dynamic[2].value];
  const lenses = [OPTICS_AND_LENSES[1].value, OPTICS_AND_LENSES[3].value, OPTICS_AND_LENSES[5].value, OPTICS_AND_LENSES[6].value];
  const lights = [
    LIGHTING_STYLES.environmental[0].value,
    LIGHTING_STYLES.cinematic_setups[3].value,
    LIGHTING_STYLES.stylized[2].value,
    LIGHTING_STYLES.environmental[2].value,
  ];
  const shotLabels = isProduct
    ? ["钩子开场", "质感特写", "场景使用", "卖点验证", "情绪收束", "品牌定格"]
    : isTravel
    ? ["抵达开场", "环境建立", "人物进入", "体验高潮", "日落收束", "记忆定格"]
    : isFood
    ? ["香气开场", "食材特写", "烹饪动作", "出品瞬间", "试吃反应", "品牌收尾"]
    : ["悬念开场", "人物建立", "冲突触发", "关系推进", "转折瞬间", "结尾留白"];
  const count = Math.max(4, Math.min(18, options.shotCount));

  const scenes: SceneOutline[] = [
    {
      id: "scene_01",
      title: "创意理解",
      description: `把「${title}」拆成清晰目标：${theme}。前 2 秒必须给出可见钩子，后续镜头逐步解释价值、情绪和行动。`,
      characters: [baseNoun],
    },
    {
      id: "scene_02",
      title: "视觉推进",
      description: `围绕 ${baseNoun} 建立空间、动作、光线和节奏。每个镜头只改变一个主变量，避免模型在动作和身份上漂移。`,
      characters: [baseNoun, "环境"],
    },
  ];

  const characters: CharacterProfile[] = [
    {
      id: "char_subject",
      name: baseNoun,
      appearance: isProduct ? "清晰轮廓、干净材质、品牌色点缀，始终位于视觉焦点" : "造型统一、面部稳定、动作克制，镜头间保持身份连续",
      personality: isProduct ? "可信、精致、有使用价值" : isDrama ? "有目标、有压力、情绪逐步外露" : "自然、可信、带轻微好奇心",
      voice: "克制、清晰、适合短视频节奏",
      referenceImages: [],
      color: "#6D5EF8",
      locked: true,
    },
    {
      id: "char_environment",
      name: "环境",
      appearance: isTravel ? "海岸、日落、清透空气和高饱和自然色" : isFood ? "温暖桌面、浅景深、食材纹理和蒸汽" : "干净背景、明确前中后景、可读的空间层次",
      personality: "服务主体，不抢夺叙事焦点",
      voice: "环境声与音乐共同支撑节奏",
      referenceImages: [],
      color: "#22C7B8",
      locked: true,
    },
  ];

  const shots: Shot[] = Array.from({ length: count }, (_, i) => {
    const titleForShot = pickFrom(shotLabels, i);
    const preset = options.activeKnowledgeIds.includes("camera_presets") ? pickCameraPreset(`${titleForShot} ${prompt}`, i) : null;
    const camera = preset ? `${preset.camera}; ${preset.motion}` : pickFrom(cameras, i);
    const lens = pickFrom(lenses, i);
    const lighting = pickFrom(lights, i);
    const duration = i === 0 ? Math.max(2, options.durationPerShot - 1) : i === count - 1 ? options.durationPerShot : options.durationPerShot;
    const motionCn = i === 0
      ? `${baseNoun}进入画面，用一个清晰动作制造前两秒钩子`
      : i === count - 1
      ? `${baseNoun}停在可记忆的收束姿态，形成品牌或情绪落点`
      : `${baseNoun}完成一个可读动作，推动「${theme}」继续向前`;
    const promptParts = [
      `[镜头类型] ${i === 0 ? "开场钩子镜头" : i === count - 1 ? "收束记忆点镜头" : "叙事推进镜头"}`,
      `[视觉风格] ${style.label}`,
      `[主体外观] ${baseNoun}在所有镜头中保持一致，参考图优先决定外观`,
      `[主体动作] ${titleForShot}：${motionCn}`,
      `[运镜] ${camera}`,
      `[镜头] ${preset?.lens || lens}`,
      `[光线] ${preset?.lighting || lighting}`,
      `[构图] ${preset?.composition || `${aspectRatio} 画幅，前景、中景、后景层次清晰`}`,
      options.activeTechniqueIds.includes("lamp_spatial") ? "[空间] 主体从前景左侧进入中心，保留 Z 轴纵深，不叠加复杂动作" : "",
      options.activeTechniqueIds.includes("two_second_hook") && i === 0 ? "[钩子] 前两秒出现打破常态的可见动作" : "",
      options.activeTechniqueIds.includes("multicam_consistency") ? "Continuity: preserve blocking, wardrobe, gaze direction, and scene geography across adjacent shots" : "",
      preset?.seedanceTip ? `Seedance Tip: ${preset.seedanceTip}` : "",
      "Constraints: one subject action, stable identity, consistent wardrobe, no text overlay, no morphing artifacts",
    ];

    return {
      id: `local_shot_${i + 1}`,
      scene_id: i < Math.ceil(count / 2) ? "scene_01" : "scene_02",
      index: i + 1,
      title: titleForShot,
      duration,
      prompt: promptParts.filter(Boolean).join(". "),
      negative_prompt: "low quality, unstable face, inconsistent clothing, extra limbs, watermark, text overlay, flicker, distorted hands",
      status: "planned",
      video_url: "",
        thumbnail_url: makeStoryboardThumb(i, prompt),
      camera,
      audio: {
        dialogue: i === 0 ? "一句短钩子或无对白，用画面先抓住注意力" : "",
        lip_sync: "only when dialogue is visible",
        music: i < count - 2 ? "steady pulse with restrained rise" : "soft resolve and final beat",
        sfx: isFood ? "subtle cooking texture and close-up ASMR" : "natural ambience and clean transition accents",
      },
      generationParams: {
        shot_script: `${titleForShot}。${motionCn}。`,
        constraints: "Use Seedance-style motion-first wording. Keep text focused on motion and camera, do not contradict references.",
        audio_cues: ["前 2 秒钩子", "节奏逐步推进", "结尾留 0.5 秒呼吸"],
        reference_instructions: ["产品/人物参考优先于文字描述", "跨镜头锁定主体、服装、色调"],
        provider_score: Math.max(0.68, topProvider.total - i * 0.01),
        provider_reason: `${topProvider.provider.label}: ${topProvider.reason}; task fit ${Math.round(topProvider.taskFit * 100)}%.`,
      },
      qualityScore: {
        overall: 0.82 + (i % 3) * 0.04,
        characterConsistency: 0.84,
        promptQuality: 0.9,
        styleCoherence: 0.86,
        issues: i === 0 ? ["建议补充一张主参考图，进一步锁定主体外观"] : [],
      },
    };
  });

  const cards: ShotGenerationCard[] = shots.map((shot) => ({
    shot_id: shot.id,
    prompt_role: shot.index === 1 ? "hook_keyframe" : shot.index === shots.length ? "closing_keyframe" : "story_progression",
    motion_contract: shot.generationParams?.shot_script || "one readable action",
    camera_contract: shot.camera,
    reference_contract: options.activeKnowledgeIds.includes("production_bible")
      ? "Use asset-library references first; text only defines motion, camera, lighting, and constraints."
      : "Use asset-library references when available; keep subject identity and wardrobe stable.",
    risk_flags: shot.index === 1
      ? ["前 2 秒钩子不够强时需要重写动作动词", "不要把氛围词当作开场事件"]
      : ["避免同一镜头内同时改变主体动作和镜头方向", "同场景相邻镜头需保持角色站位和视线方向"],
    edit_note: shot.index === 1
      ? "短切开场，0.5 秒内进入主体动作；首镜承担钩子和语境建立。"
      : shot.index === shots.length
      ? "最后一帧保留 12 帧，方便字幕或品牌露出；可作为导出封面。"
      : "按动作峰值切出，转场保持方向一致；同机位可并行生成草稿。",
  }));

  const bible: ProductionBible = {
    schema_version: options.source === "engine" ? "nextcut.sidecar_enriched.v1" : "nextcut.local_fallback.v1",
    title,
    style_contract: `${style.label}。主色克制，画面以主体和动作推进为中心。`,
    format_contract: `${aspectRatio}，${mode.title}，镜头数量 ${count}，单镜头 3-5 秒。`,
    reference_policy: "参考图优先级高于文本。文本只补充运动、镜头、光线和不可见意图。",
    prompt_rules: [
      "每个镜头使用 SVO：主体 + 动作 + 对象。",
      "文本聚焦 motion，不重复描述参考图已经明确的外观。",
      "运镜与主体动作分离，避免同一镜头内同时做多个大变化。",
      "保留负面提示词，防止漂移、闪烁、文字水印和肢体错误。",
      `计划来源：${options.source === "engine" ? "导演引擎 + 界面规则补强" : "本地规划预览"}。`,
      `已启用知识源：${enabledSourceNames.join("、") || "无"}。`,
      ...knowledgeRules.slice(0, 8),
    ],
    render_checks: [
      "首帧主体是否清晰可读",
      "最后一帧是否能自然接下一个镜头",
      "角色/产品外观是否跨镜头稳定",
      "镜头运动是否服务剪辑节奏",
      `模型路由建议是否符合任务：${topProvider.provider.label} / ${Math.round(topProvider.total * 100)} 分`,
    ],
  };

  const quality: QualityScore = {
    overall: 0.88,
    characterConsistency: 0.86,
    promptQuality: 0.92,
    styleCoherence: 0.88,
    issues: ["未上传真实参考图时，角色/产品一致性仍需要生成后复检。"],
  };

  const promptReview: PromptReviewSummary = {
    critical: 0,
    warning: 2,
    info: 4,
    findings: [
      {
        shot_id: "local_shot_1",
        severity: "warning",
        code: "HOOK_STRENGTH",
        message: "开场镜头需要明确可见动作，避免只是氛围描述。",
        suggestion: "加入一个可被观众立即理解的动作或反差。",
      },
      {
        shot_id: "all",
        severity: "info",
        code: "PROVIDER_ROUTE",
        message: `当前任务推荐 ${topProvider.provider.label}，原因：${topProvider.reason}。`,
        suggestion: "如果要低成本快速草稿，可切换到 LTX / Wan 类本地草稿；最终片段再回到高一致性模型。",
      },
      {
        shot_id: "all",
        severity: "info",
        code: "REFERENCE_POLICY",
        message: "如使用 image-to-video，参考图决定主体外观，提示词应主要写运动与镜头。",
        suggestion: "上传产品/角色参考图后锁定跨镜头一致性。",
      },
    ],
  };

  return { mode, title, scenes, characters, shots, cards, bible, quality, promptReview, providerRecommendations };
}

function enrichPromptWithKnowledge(prompt: string, activeKnowledgeIds: KnowledgeSourceId[], activeTechniqueIds: string[]) {
  const rules = buildKnowledgeRuleList(activeKnowledgeIds, activeTechniqueIds).slice(0, 10);
  const sources = DIRECTOR_KNOWLEDGE_SOURCES
    .filter((source) => activeKnowledgeIds.includes(source.id))
    .map((source) => source.name)
    .join(", ");
  if (!rules.length) return prompt;
  return [
    prompt,
    "",
    "NextCut production constraints:",
    `Knowledge sources: ${sources || "none"}.`,
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
  ].join("\n");
}

async function waitForSidecarPlan(planId: string): Promise<SidecarPlanResult> {
  const maxAttempts = 24;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await sidecarFetch<SidecarPlanResult>(`/director/plan/${planId}`, undefined, 0);
    if (result.status === "completed" || result.status === "failed") return result;
    await wait(1200);
  }
  throw new Error("Director engine timed out while planning");
}

function mergeSidecarPlan(
  result: SidecarPlanResult,
  fallback: ReturnType<typeof buildLocalPlan>,
  providerRecommendations: ProviderRecommendation[]
) {
  if (result.status !== "completed" || !result.shots?.length) return fallback;

  const qualityByShot = new Map<string, QualityScore>();
  result.quality_scores?.forEach((score) => {
    qualityByShot.set(score.shot_id, {
      overall: score.overall,
      characterConsistency: score.character_consistency,
      promptQuality: score.prompt_quality,
      styleCoherence: score.style_coherence,
      issues: [],
    });
  });

  const shots: Shot[] = result.shots.map((shot, index) => {
    const fallbackShot = fallback.shots[index % fallback.shots.length];
    const recommendation = providerRecommendations[index % providerRecommendations.length];
    return {
      id: shot.id,
      scene_id: shot.scene_id || fallbackShot.scene_id,
      index: shot.index || index + 1,
      title: shot.title || fallbackShot.title,
      duration: shot.duration || fallbackShot.duration,
      prompt: shot.prompt || fallbackShot.prompt,
      negative_prompt: shot.negative_prompt || fallbackShot.negative_prompt,
      status: shot.status || "planned",
      video_url: shot.video_url || "",
      thumbnail_url: shot.thumbnail_url || fallbackShot.thumbnail_url,
      camera: shot.camera?.camera || fallbackShot.camera,
      audio: shot.audio || fallbackShot.audio,
      generationParams: {
        ...fallbackShot.generationParams,
        ...shot.generation_params,
        provider_score: recommendation.total,
        provider_reason: `${recommendation.provider.label}: ${recommendation.reason}; engine plan enriched with active knowledge rules.`,
      },
      qualityScore: qualityByShot.get(shot.id) || fallbackShot.qualityScore,
    };
  });

  const characters: CharacterProfile[] = result.characters?.length
    ? result.characters.map((character, index) => ({
      id: `engine_character_${index + 1}`,
      name: character.name || `Character ${index + 1}`,
      appearance: character.appearance || "",
      personality: character.personality || "",
      voice: character.voice || "",
      referenceImages: character.reference_images || [],
      color: ["#6D5EF8", "#22C7B8", "#F59E0B", "#22C55E"][index % 4],
      locked: true,
    }))
    : fallback.characters;

  const scenes = result.scenes?.length ? result.scenes : fallback.scenes;
  const cards = result.workbench?.shot_generation_cards || result.metadata?.shot_generation_cards || fallback.cards;
  const bible = result.workbench?.production_bible || result.metadata?.production_bible || fallback.bible;
  const promptReview = result.metadata?.prompt_review || fallback.promptReview;

  return {
    ...fallback,
    scenes,
    characters,
    shots,
    cards,
    bible: {
      ...bible,
      schema_version: "nextcut.sidecar_engine.v1",
      prompt_rules: Array.from(new Set([...bible.prompt_rules, "计划来源：Sidecar Director Engine。"])),
    },
    promptReview,
  };
}

function ModeCard({
  mode,
  active,
  onSelect,
}: {
  mode: (typeof workflowModes)[number];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button onClick={onSelect} className="h-full text-left">
      <Surface selected={active} interactive className={cn("flex h-full min-h-[168px] flex-col p-5", active && "bg-[#FBFAFF]")}>
        <div className="mb-4 flex items-start gap-3">
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]", active ? "bg-nc-accent text-white shadow-md shadow-nc-accent/20" : "bg-[#F5F3FF] text-nc-accent")}>
            <Icon name={mode.icon} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold leading-6 text-nc-text">{mode.title}</div>
            <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-nc-text-secondary">{mode.subtitle}</div>
          </div>
          <span className={cn("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", active ? "border-nc-accent bg-nc-accent text-white" : "border-nc-border bg-white")}>
            {active && <span className="h-2 w-2 rounded-full bg-white" />}
          </span>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {mode.tags.map((tag) => (
            <Pill key={tag} tone="accent" className="min-h-6 px-2.5 py-1">{tag}</Pill>
          ))}
        </div>
      </Surface>
    </button>
  );
}

export function DirectorInput() {
  const {
    prompt,
    setPrompt,
    structuredPrompt,
    useStructuredPrompt,
    aspectRatio,
    setAspectRatio,
    setSelectedWorkflow,
    style,
    setStyle,
    numShots,
    setNumShots,
    duration,
    setDuration,
    references,
    addReference,
    removeReference,
    pipeline,
    pipelineStep,
    setPipelineStep,
    isRunning,
    setIsRunning,
    setPlanId,
    lastError,
    shots,
    setShots,
    setSceneOutlines,
    setCharacters,
    setAgentProgress,
    setOverallQuality,
    setProductionBible,
    setShotGenerationCards,
    setPromptReview,
    setLastError,
  } = useDirectorStore();
  const { setSidebarPage, setWorkspaceView, setSelectedShotId } = useAppStore();
  const [modeId, setModeId] = useState("quick");
  const [styleId, setStyleId] = useState("natural");
  const [tone, setTone] = useState("中");
  const [durationLabel, setDurationLabel] = useState("30 秒");
  const [activeTab, setActiveTab] = useState<"role" | "workflow" | "assets">("workflow");
  const [activeKnowledgeIds, setActiveKnowledgeIds] = useState<KnowledgeSourceId[]>(
    DIRECTOR_KNOWLEDGE_SOURCES.map((source) => source.id)
  );
  const [activeTechniqueIds, setActiveTechniqueIds] = useState<string[]>(
    TECHNIQUE_PACKS.map((pack) => pack.id)
  );
  const [providerRecommendations, setProviderRecommendations] = useState<ProviderRecommendation[]>([]);
  const [planSource, setPlanSource] = useState<"engine" | "local" | "idle">("idle");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceRole, setReferenceRole] = useState("产品外观");
  const [referenceDescription, setReferenceDescription] = useState("");

  const promptLength = prompt.length;
  const activeStepIndex = Math.max(0, pipelineSteps.findIndex((step) => step.id === pipelineStep));
  const compiledStructuredPrompt = compileStructuredIntent(structuredPrompt);

  const smartTips = useMemo(() => {
    const camera = CAMERA_MOVEMENTS.advanced[activeStepIndex % CAMERA_MOVEMENTS.advanced.length];
    const trope = MANGA_DRAMA_TROPES.mangaGenres[(activeStepIndex + 8) % MANGA_DRAMA_TROPES.mangaGenres.length];
    const keyframe = IMAGE_PROMPT_PRESETS.storyboard_keyframes[activeStepIndex % IMAGE_PROMPT_PRESETS.storyboard_keyframes.length];
    return [
      { label: "运镜", value: camera.label },
      { label: "钩子", value: trope.label.replace(/\s*\(.+\)/, "") },
      { label: "分镜图", value: keyframe.label.replace(/\s*\(.+\)/, "") },
      { label: "约束", value: "SVO + 单动作" },
    ];
  }, [activeStepIndex]);

  const liveProviderRecommendations = useMemo(() => {
    const mode = workflowModes.find((item) => item.id === modeId) || workflowModes[0];
    return scoreProvidersForTask({
      taskType: inferTaskType(prompt, mode.id),
      shotCount: numShots || mode.shots,
      needsAudio: /口播|对白|音乐|音效|配音|旁白|lip|voice|song/.test(prompt.toLowerCase()) || mode.id === "story",
      needsLipSync: /口播|对白|说话|台词|lip/.test(prompt.toLowerCase()),
      localOnly: /本地|离线|local/.test(prompt.toLowerCase()),
      budgetConstrained: /低成本|便宜|预算|快速草稿/.test(prompt),
    });
  }, [modeId, numShots, prompt]);

  const visibleProviderRecommendations = providerRecommendations.length > 0 ? providerRecommendations : liveProviderRecommendations;

  const toggleKnowledgeSource = useCallback((id: KnowledgeSourceId) => {
    setActiveKnowledgeIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  }, []);

  const toggleTechnique = useCallback((id: string) => {
    setActiveTechniqueIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  }, []);

  const addReferenceFromDraft = useCallback(() => {
    const trimmed = referenceUrl.trim();
    if (!trimmed) return;
    addReference({
      id: `ref_${Date.now()}`,
      name: referenceRole,
      url: trimmed,
      type: inferReferenceType(trimmed),
      role: referenceRole,
      description: referenceDescription.trim(),
      priority: references.length === 0 ? "primary" : "secondary",
      locked: true,
    });
    setReferenceUrl("");
    setReferenceDescription("");
  }, [addReference, referenceDescription, referenceRole, referenceUrl, references.length]);

  const clearPlanState = useCallback(() => {
    setShots([]);
    setSceneOutlines([]);
    setCharacters([]);
    setShotGenerationCards([]);
    setPromptReview(null);
    setOverallQuality(null);
    setProductionBible(null);
    setPlanId(null);
  }, [
    setCharacters,
    setOverallQuality,
    setPlanId,
    setProductionBible,
    setPromptReview,
    setSceneOutlines,
    setShotGenerationCards,
    setShots,
  ]);

  const applyPlan = useCallback((plan: ReturnType<typeof buildLocalPlan>, source: "engine" | "local") => {
    setSceneOutlines(plan.scenes);
    setCharacters(plan.characters);
    setShots(plan.shots);
    setProductionBible({
      ...plan.bible,
      prompt_rules: Array.from(new Set([
        ...plan.bible.prompt_rules,
        source === "engine" ? "UI 来源标记：导演引擎。" : "UI 来源标记：本地规划预览，需用真实引擎复算后再投产。",
      ])),
    });
    setShotGenerationCards(plan.cards);
    setPromptReview(plan.promptReview);
    setOverallQuality(plan.quality);
    setProviderRecommendations(plan.providerRecommendations);
    setAgentProgress(agentTeam.map((agent) => ({ agent: agent.id, status: "complete", progress: 1 })));
    setPipelineStep("prompt_review");
    setPlanSource(source);
    setSelectedShotId(plan.shots[0]?.id ?? null);
  }, [
    setAgentProgress,
    setCharacters,
    setOverallQuality,
    setPipelineStep,
    setProductionBible,
    setPromptReview,
    setSceneOutlines,
    setSelectedShotId,
    setShotGenerationCards,
    setShots,
  ]);

  const runDirectorPlan = useCallback(async () => {
    const effectivePrompt = useStructuredPrompt && compiledStructuredPrompt ? compiledStructuredPrompt : prompt;
    if (!effectivePrompt.trim() || isRunning) return;
    const mode = workflowModes.find((item) => item.id === modeId) || workflowModes[0];
    const selectedStyle = visualStyles.find((item) => item.id === styleId) || visualStyles[1];
    const fallbackPlan = buildLocalPlan(effectivePrompt, modeId, aspectRatio, styleId, {
      shotCount: numShots || mode.shots,
      durationPerShot: duration || mode.duration,
      motionTone: tone,
      activeKnowledgeIds,
      activeTechniqueIds,
      source: "local",
    });
    setLastError(null);
    setPlanSource("idle");
    clearPlanState();
    setIsRunning(true);
    setSelectedWorkflow(mode.workflow);
    setStyle(selectedStyle.value);

    const progressOrder = ORCHESTRATION_ORDER;

    try {
      for (let i = 0; i < 2; i += 1) {
        setPipelineStep(pipelineSteps[i].id);
        setAgentProgress(progressOrder.slice(0, 5).map((agent, index) => ({
          agent,
          status: index < i + 1 ? "complete" : index === i + 1 ? "running" : "pending",
          progress: index < i + 1 ? 1 : index === i + 1 ? 0.58 : 0,
        })));
        await wait(180);
      }

      const engineReady = await checkHealth();
      if (!engineReady) {
        throw new Error("Director engine health check failed");
      }

      const response = await sidecarFetch<{ id: string; status: string }>("/director/plan", {
        method: "POST",
        body: JSON.stringify({
          prompt: enrichPromptWithKnowledge(effectivePrompt, activeKnowledgeIds, activeTechniqueIds),
          style: selectedStyle.value,
          num_shots: numShots || mode.shots,
          duration: duration || mode.duration,
          aspect_ratio: aspectRatio,
          title: inferTitle(prompt),
          workflow: mode.workflow,
          references,
          pipeline,
        }),
      });
      setPlanId(response.id);
      setPipelineStep("storyboard_review");
      setAgentProgress(progressOrder.map((agent, index) => ({
        agent,
        status: index < 5 ? "complete" : index === 5 ? "running" : "pending",
        progress: index < 5 ? 1 : index === 5 ? 0.64 : 0,
      })));
      const engineResult = await waitForSidecarPlan(response.id);
      const enginePlan = mergeSidecarPlan(engineResult, fallbackPlan, fallbackPlan.providerRecommendations);
      const usedEngine = engineResult.status === "completed" && Boolean(engineResult.shots?.length);
      applyPlan(enginePlan, usedEngine ? "engine" : "local");
      if (!usedEngine) {
        setLastError(engineResult.error || "Director engine returned no completed plan; 已显示本地规划预览。");
      }
    } catch (error) {
      const message = error instanceof SidecarError
        ? `导演引擎暂不可用（${error.status}），已显示本地规划预览。`
        : "导演引擎暂不可用，已显示本地规划预览。";
      setLastError(message);
      for (let i = 2; i < pipelineSteps.length; i += 1) {
        setPipelineStep(pipelineSteps[i].id);
        setAgentProgress(progressOrder.map((agent, index) => ({
          agent,
          status: index < i + 2 ? "complete" : index === i + 2 ? "running" : "pending",
          progress: index < i + 2 ? 1 : index === i + 2 ? 0.62 : 0,
        })));
        await wait(160);
      }
      applyPlan(fallbackPlan, "local");
    } finally {
      setIsRunning(false);
    }
  }, [
    activeKnowledgeIds,
    activeTechniqueIds,
    applyPlan,
    aspectRatio,
    clearPlanState,
    compiledStructuredPrompt,
    duration,
    isRunning,
    modeId,
    numShots,
    pipeline,
    prompt,
    references,
    setAgentProgress,
    setIsRunning,
    setLastError,
    setPipelineStep,
    setPlanId,
    setSelectedWorkflow,
    setStyle,
    styleId,
    tone,
    useStructuredPrompt,
  ]);

  const setDurationFromLabel = useCallback((label: string, shotCount = numShots) => {
    const total = durations.find((item) => item.label === label)?.total || 30;
    setDurationLabel(label);
    setDuration(durationForTotal(total, shotCount));
  }, [numShots, setDuration]);

  const setShotCountFromLabel = useCallback((label: string) => {
    const count = label.startsWith("6") ? 8 : label.startsWith("10") ? 12 : 16;
    setNumShots(count);
    setDurationFromLabel(durationLabel, count);
  }, [durationLabel, setDurationFromLabel, setNumShots]);

  return (
    <div className="flex min-h-0 flex-1 bg-[radial-gradient(circle_at_16%_0%,rgba(109,94,248,0.10),transparent_30%),linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_64%)]">
      <div className="min-w-0 flex-1 overflow-auto px-7">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 pb-44 pt-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <Pill tone="accent" className="mb-2">ViMax 导演链</Pill>
              <h1 className="flex items-center gap-3 text-[30px] font-bold leading-[38px] tracking-tight text-nc-text">
                生成工作流
                <Sparkles className="h-7 w-7 text-nc-accent" />
              </h1>
              <p className="mt-2 text-[14px] leading-6 text-nc-text-secondary">
                输入一句创意，NextCut 会向下推进成需求理解、角色、分镜、运镜、提示词和剪辑建议。
              </p>
            </div>
            <Button size="sm" className="shrink-0"><HelpCircle className="h-4 w-4" />如何选择工作流</Button>
          </div>

          <Surface className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <label htmlFor="director-prompt" className="text-[14px] font-semibold text-nc-text">告诉 AI 你的创意想法</label>
              <span className={cn("text-[12px] tabular-nums", promptLength > PROMPT_LIMIT ? "text-nc-error" : "text-nc-text-tertiary")}>{promptLength} / {PROMPT_LIMIT}</span>
            </div>
            <div className="relative">
              <textarea
                id="director-prompt"
                value={prompt}
                maxLength={PROMPT_LIMIT + 120}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：为我们的新款便携咖啡机制作一支 30 秒产品广告，突出轻便设计与户外场景..."
                className="min-h-[124px] w-full resize-none rounded-[16px] border border-nc-border bg-white px-5 py-[18px] pr-14 text-[15px] leading-7 text-nc-text shadow-xs outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              />
              <div className="absolute right-4 top-4 text-nc-accent">
                <Icon name="spark" className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-semibold text-nc-text-secondary">智能提示：</span>
              {smartTips.map((tip) => (
                <Button
                  key={tip.label}
                  size="sm"
                  variant="secondary"
                  onClick={() => setPrompt(prompt ? `${prompt}，${tip.value}` : tip.value)}
                >
                  {tip.value}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setPrompt("")}>
                清空
              </Button>
            </div>
          </Surface>

          <section className="grid gap-4 xl:grid-cols-4">
            {[
              { title: "Storyboard", value: `${numShots} 个镜头`, note: "镜头数量、时长和叙事节奏直接驱动分镜计划。", active: true },
              { title: "Reference", value: `${references.length} 份参考`, note: "主参考优先于文字外观，锁定主体、风格和空间。", active: references.length > 0 },
              { title: "Camera Motion", value: tone, note: "运镜强度会影响镜头词典、动作节奏和推荐模型。", active: true },
              { title: "Prompt Decomposition", value: useStructuredPrompt ? "已接管" : `${compiledStructuredPrompt ? "可用" : "待补全"}`, note: "把主体、动作、场景、镜头和声音拆成可执行约束。", active: Boolean(compiledStructuredPrompt) },
            ].map((item) => (
              <Surface key={item.title} interactive selected={item.active} className="p-5">
                <div className="text-[12px] font-semibold uppercase leading-4 tracking-[0.08em] text-nc-text-tertiary">{item.title}</div>
                <div className="mt-3 line-clamp-1 text-[22px] font-bold leading-8 text-nc-text">{item.value}</div>
                <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-nc-text-secondary">{item.note}</div>
              </Surface>
            ))}
          </section>

          <PipelineStepFlow />

          <StructuredPromptBuilder />

          <Surface>
            <div className="flex min-h-[64px] items-center justify-between border-b border-nc-border px-5">
              <Segmented
                value={activeTab}
                onChange={setActiveTab}
                options={[
                  { value: "role", label: "角色" },
                  { value: "workflow", label: "工作流" },
                  { value: "assets", label: "参考素材" },
                ]}
              />
            </div>

            <div className="p-5">
              {activeTab === "workflow" && (
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  {workflowModes.map((mode) => (
                    <ModeCard
                      key={mode.id}
                      mode={mode}
                      active={mode.id === modeId}
                      onSelect={() => {
                        setModeId(mode.id);
                        setSelectedWorkflow(mode.workflow);
                        setNumShots(mode.shots);
                        setDuration(mode.duration);
                        setDurationLabel(`${mode.shots * mode.duration <= 20 ? 15 : mode.shots * mode.duration <= 36 ? 30 : mode.shots * mode.duration <= 52 ? 45 : 60} 秒`);
                      }}
                    />
                  ))}
                </div>
              )}
              {activeTab === "role" && (
                <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.95fr)_1.2fr]">
                  <Surface className="p-5">
                    <CharacterPanel />
                  </Surface>
                  <div className="grid grid-cols-2 gap-4">
                    {agentTeam.slice(0, 6).map((agent, index) => (
                      <div key={agent.id} className="rounded-[14px] border border-nc-border bg-nc-bg p-5">
                        <div className="mb-3 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[14px] font-bold text-nc-accent shadow-sm">{agent.initial}</div>
                          <div>
                            <div className="text-[15px] font-semibold leading-6 text-nc-text">{agent.name} · {agent.roleZh}</div>
                            <div className="text-[13px] leading-5 text-nc-text-tertiary">{index === 0 ? "负责起点理解" : `${agent.dependencies.length} 个上游依赖`}</div>
                          </div>
                        </div>
                        <p className="line-clamp-2 text-[14px] leading-6 text-nc-text-secondary">{agent.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === "assets" && (
                <div className="space-y-5">
                  <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                    <Surface className="p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-[16px] font-semibold leading-6 text-nc-text">Reference Stack</h3>
                          <p className="mt-1 text-[13px] leading-5 text-nc-text-secondary">把产品图、角色定妆图、空间氛围图作为一等输入写入导演链。</p>
                        </div>
                        <Pill tone={references.length > 0 ? "accent" : "neutral"}>{references.length} 份</Pill>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-2">
                          <span className="text-[13px] font-semibold leading-5 text-nc-text-secondary">参考链接</span>
                          <input
                            value={referenceUrl}
                            onChange={(event) => setReferenceUrl(event.target.value)}
                            placeholder="https://.../product-reference.jpg"
                            className="min-h-12 rounded-[13px] border border-nc-border bg-white px-4 py-3 text-[14px] leading-6 text-nc-text outline-none transition focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[13px] font-semibold leading-5 text-nc-text-secondary">参考角色</span>
                          <select
                            value={referenceRole}
                            onChange={(event) => setReferenceRole(event.target.value)}
                            className="min-h-12 rounded-[13px] border border-nc-border bg-white px-4 py-3 text-[14px] font-semibold leading-6 text-nc-text outline-none transition focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                          >
                            {["产品外观", "角色身份", "空间氛围", "镜头构图", "材质细节"].map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="mt-3 flex flex-col gap-2">
                        <span className="text-[13px] font-semibold leading-5 text-nc-text-secondary">备注</span>
                        <textarea
                          value={referenceDescription}
                          onChange={(event) => setReferenceDescription(event.target.value)}
                          placeholder="例如：锁定咖啡机的正面轮廓、材质反射和品牌蓝色高光。"
                          rows={3}
                          className="w-full resize-none rounded-[13px] border border-nc-border bg-white px-4 py-3 text-[14px] leading-6 text-nc-text outline-none transition focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                        />
                      </label>
                      <div className="mt-4 flex items-center gap-3">
                        <Button variant="primary" onClick={addReferenceFromDraft} disabled={!referenceUrl.trim()}>
                          <Link className="h-4 w-4" />
                          加入参考链
                        </Button>
                        <span className="text-[12px] leading-5 text-nc-text-tertiary">后续会把素材库拖拽接入这里，现在先支持 URL 与外部素材引用。</span>
                      </div>
                    </Surface>

                    <div className="grid gap-3">
                      {references.length > 0 ? references.map((reference, index) => (
                        <Surface key={reference.id || `${reference.url}-${index}`} className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F5F3FF] text-nc-accent">
                              <Image className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-[14px] font-semibold leading-6 text-nc-text">{reference.name || reference.role}</div>
                                <Pill tone={index === 0 ? "accent" : "neutral"}>{index === 0 ? "主参考" : "补充"}</Pill>
                              </div>
                              <div className="mt-1 truncate text-[12px] leading-5 text-nc-text-tertiary">{reference.url}</div>
                              <div className="mt-2 line-clamp-2 text-[13px] leading-5 text-nc-text-secondary">{reference.description || "未补充说明，将仅作为外观/空间锁定参考。"}</div>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => removeReference(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </Surface>
                      )) : (
                        <Surface className="flex min-h-[240px] items-center justify-center border-dashed p-6 text-center">
                          <div>
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#F5F3FF] text-nc-accent">
                              <Image className="h-5 w-5" />
                            </div>
                            <div className="mt-4 text-[15px] font-semibold leading-6 text-nc-text">先给导演链一张真参考</div>
                            <div className="mt-2 max-w-[280px] text-[13px] leading-6 text-nc-text-secondary">产品、角色、场景三类参考都能直接降低漂移和风格不稳定。</div>
                          </div>
                        </Surface>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-nc-border pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-[15px] font-semibold text-nc-text">创作知识源</h3>
                        <p className="mt-1 text-[12px] text-nc-text-secondary">Cursor 安装的本地字典、sidecar 工具和 ViMax 能力会参与生成规则、运镜和模型路由。</p>
                      </div>
                      <span className="rounded-[10px] bg-[#F5F3FF] px-3 py-1 text-[12px] font-semibold text-nc-accent">{activeKnowledgeIds.length} / {DIRECTOR_KNOWLEDGE_SOURCES.length} 已启用</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {DIRECTOR_KNOWLEDGE_SOURCES.map((source) => {
                        const enabled = activeKnowledgeIds.includes(source.id);
                        return (
                          <button
                            key={source.id}
                            onClick={() => toggleKnowledgeSource(source.id)}
                            className={cn(
                              "min-h-[132px] rounded-[14px] border p-4 text-left transition",
                              enabled ? "border-nc-accent/45 bg-[#FBFAFF]" : "border-nc-border bg-white hover:border-nc-accent/30"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[14px] font-semibold leading-5 text-nc-text">{source.name}</div>
                                <div className="mt-1 text-[12px] uppercase tracking-[0.08em] leading-4 text-nc-text-tertiary">{source.status} · {source.scope}</div>
                              </div>
                              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold", enabled ? "border-nc-accent bg-nc-accent text-white" : "border-nc-border text-nc-text-tertiary")}>{enabled ? <Check className="h-3 w-3" /> : null}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{source.value}</p>
                            <div className="mt-3 text-[12px] font-semibold leading-4 text-nc-accent">{source.metric}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {TECHNIQUE_PACKS.slice(0, 8).map((pack) => {
                      const enabled = activeTechniqueIds.includes(pack.id);
                      return (
                        <button
                          key={pack.id}
                          onClick={() => toggleTechnique(pack.id)}
                          className={cn(
                            "min-h-[108px] rounded-[13px] border p-4 text-left transition",
                            enabled ? "border-nc-accent/45 bg-[#FBFAFF] shadow-sm" : "border-nc-border bg-white hover:border-nc-accent/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 text-[13px] font-semibold leading-5 text-nc-text">{pack.label}</div>
                            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold", enabled ? "border-nc-accent bg-nc-accent text-white" : "border-nc-border text-nc-text-tertiary")}>{enabled ? <Check className="h-3 w-3" /> : null}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-nc-text-tertiary">{pack.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Surface>

            <section className="grid grid-cols-2 gap-4 xl:grid-cols-[1.1fr_1fr_1fr_1.15fr_1.1fr]">
            <ControlBlock title="画面比例">
              <div className="grid grid-cols-4 gap-2">
                {["16:9", "9:16", "1:1", "4:5"].map((ratio) => (
                  <button key={ratio} onClick={() => setAspectRatio(ratio)} className={cn("min-h-10 rounded-[10px] border px-2 text-[14px] font-semibold leading-5", aspectRatio === ratio ? "border-nc-accent bg-nc-accent text-white" : "border-nc-border bg-white text-nc-text-secondary")}>{ratio}</button>
                ))}
              </div>
              <div className="mt-2 text-[12px] text-nc-text-tertiary">横屏（推荐）</div>
            </ControlBlock>
            <ControlBlock title="视觉风格">
              <SelectField
                value={styleId}
                onChange={(event) => {
                  const nextStyleId = event.target.value;
                  setStyleId(nextStyleId);
                  setStyle(visualStyles.find((item) => item.id === nextStyleId)?.value || style);
                }}
              >
                {visualStyles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </SelectField>
            </ControlBlock>
            <ControlBlock title="时长">
              <SelectField value={durationLabel} onChange={(event) => setDurationFromLabel(event.target.value)}>
                {durations.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}
              </SelectField>
              <div className="mt-2 text-[12px] text-nc-text-tertiary">单镜头约 {duration} 秒，总长约 {duration * numShots} 秒</div>
            </ControlBlock>
            <ControlBlock title="镜头数量">
              <SelectField value={numShots <= 8 ? shotCounts[0] : numShots <= 12 ? shotCounts[1] : shotCounts[2]} onChange={(event) => setShotCountFromLabel(event.target.value)}>
                {shotCounts.map((item) => <option key={item}>{item}</option>)}
              </SelectField>
            </ControlBlock>
            <ControlBlock title="镜头运动强度">
              <div className="grid grid-cols-3 rounded-[11px] border border-nc-border bg-white p-1.5">
                {["低", "中", "高"].map((item) => (
                  <button key={item} onClick={() => setTone(item)} className={cn("min-h-10 rounded-[10px] px-3 text-[14px] font-semibold leading-5", tone === item ? "bg-nc-accent text-white" : "text-nc-text-secondary")}>{item}</button>
                ))}
              </div>
              <div className="mt-2 text-[12px] text-nc-text-tertiary">适中节奏，平衡稳定与动态</div>
            </ControlBlock>
          </section>

          {shots.length > 0 && (
            <Surface className="bg-nc-surface">
              <div className="flex items-center justify-between border-b border-nc-border px-5 py-4">
                <div>
                  <h2 className="text-[18px] font-semibold text-nc-text">自动生成的下游计划</h2>
                  <p className="mt-1 text-[13px] text-nc-text-secondary">分镜、运镜、提示词和剪辑建议已经生成，可进入编辑页继续微调。</p>
                  <div className={cn("mt-3 inline-flex min-h-8 items-center rounded-[10px] px-3 py-1.5 text-[13px] font-semibold leading-5", planSource === "engine" ? "bg-[#ECFDF5] text-[#047857]" : "bg-[#FFF7ED] text-[#C2410C]")}>
                    来源：{planSource === "engine" ? "导演引擎" : "本地规划预览"}
                  </div>
                  {lastError && <div className="mt-2 max-w-[620px] text-[12px] leading-5 text-[#C2410C]">{lastError}</div>}
                </div>
                <Button
                  variant="primary"
                  onClick={() => {
                    setSidebarPage("workspace");
                    setWorkspaceView("storyboard");
                  }}
                >
                  打开分镜工作台
                </Button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5 p-5">
                {shots.slice(0, 4).map((shot) => (
                  <button
                    key={shot.id}
                    onClick={() => {
                      setSelectedShotId(shot.id);
                      setSidebarPage("workspace");
                      setWorkspaceView("storyboard");
                    }}
                    className="text-left"
                  >
                    <Surface interactive className="overflow-hidden">
                      <div className="relative aspect-[16/7] overflow-hidden bg-nc-panel">
                        {shot.thumbnail_url && <img src={shot.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                        <Pill tone="accent" className="absolute left-3 top-3 bg-white/95">{shot.index}</Pill>
                        <span className="absolute right-3 top-3 rounded-[10px] bg-black/48 px-2.5 py-1.5 text-[12px] font-semibold leading-4 text-white">00:{String(shot.duration).padStart(2, "0")}</span>
                      </div>
                      <div className="p-5">
                        <div className="truncate text-[16px] font-semibold leading-7 text-nc-text">{shot.title}</div>
                        <div className="mt-2 line-clamp-3 text-[14px] leading-7 text-nc-text-secondary">{shot.generationParams?.shot_script}</div>
                        <div className="mt-4 truncate text-[13px] font-semibold leading-5 text-nc-accent">
                          {planSource === "engine" ? "引擎计划已合并镜头规则" : "本地规划已生成，可进入分镜复核"}
                        </div>
                      </div>
                    </Surface>
                  </button>
                ))}
              </div>
            </Surface>
          )}
        </div>

        <div className="sticky bottom-0 z-20 -mx-7 flex min-h-[72px] items-center justify-between border-t border-nc-border bg-white/95 px-7 backdrop-blur">
          <Button>
            高级选项（音乐风格、色调、受众等）
          </Button>
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-nc-text-secondary">
              启用 {activeKnowledgeIds.length} 个知识源，生成分镜脚本、镜头清单、模型路由和剪辑建议
            </span>
            <Button
              variant="primary"
              size="lg"
              onClick={runDirectorPlan}
              disabled={!prompt.trim() || isRunning}
              className="min-w-[204px]"
            >
              {isRunning ? "生成中..." : "生成规划"}
            </Button>
          </div>
        </div>
      </div>

      <aside className="hidden w-[328px] shrink-0 border-l border-nc-border bg-white/78 p-4 backdrop-blur 2xl:block">
        <div className="rounded-[16px] border border-nc-border bg-white p-5 shadow-sm shadow-slate-200/70">
          <h2 className="mb-5 text-[17px] font-semibold leading-6 text-nc-text">流程状态</h2>
          <div className="space-y-3.5">
            {pipelineSteps.map((step, index) => {
              const current = pipelineStep === step.id;
              const done = shots.length > 0 || (isRunning && index < activeStepIndex);
              return (
                <div key={step.id} className="flex min-h-9 items-center gap-3">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold", done ? "border-nc-success bg-nc-success text-white" : current ? "border-nc-accent text-nc-accent" : "border-nc-border text-nc-text-tertiary")}>{done ? <Check className="h-3 w-3" /> : index + 1}</span>
                  <span className={cn("flex-1 text-[14px] font-medium leading-5", current ? "text-nc-text" : "text-nc-text-secondary")}>{done ? step.doneLabel : step.label}</span>
                  <span className="font-mono text-[12px] text-nc-text-tertiary">{done ? "00:32" : "--:--"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-[16px] border border-nc-border bg-white p-5 shadow-sm shadow-slate-200/70">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold leading-6 text-nc-text">模型路由</h2>
            <span className="flex min-h-8 items-center rounded-[10px] bg-[#ECFEFF] px-3 py-1.5 text-[13px] font-semibold leading-5 text-[#0891B2]">7 维评分</span>
          </div>
          <div className="space-y-3">
            {visibleProviderRecommendations.slice(0, 3).map((item, index) => (
              <div key={item.provider.id} className="rounded-[13px] border border-nc-border bg-nc-bg p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[14px] font-semibold leading-5 text-nc-text">{index + 1}. {item.provider.label}</span>
                  <span className="font-mono text-[12px] font-semibold text-nc-accent">{Math.round(item.total * 100)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-nc-border">
                  <div className="h-full rounded-full bg-nc-accent" style={{ width: `${Math.round(item.total * 100)}%` }} />
                </div>
                <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-nc-text-tertiary">
                  按运动、角色一致性、镜头复杂度和成本进行排序
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-[16px] border border-nc-border bg-white p-5 shadow-sm shadow-slate-200/70">
          <h2 className="mb-5 text-[17px] font-semibold leading-6 text-nc-text">AI 导演组</h2>
          <div className="space-y-2">
            {agentTeam.map((agent, index) => {
              const active = isRunning ? index <= activeStepIndex + 2 : shots.length > 0;
              return (
                <div key={agent.id} className="flex min-h-[56px] items-center gap-3 rounded-[13px] border border-nc-border bg-nc-bg px-4 py-3">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold", active ? "bg-[#F5F3FF] text-nc-accent" : "bg-white text-nc-text-tertiary")}>{agent.initial}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold leading-5 text-nc-text">{agent.name} <span className="text-nc-text-tertiary">{agent.roleZh}</span></span>
                    <span className="block truncate text-[13px] leading-5 text-nc-text-tertiary">{agent.produces.slice(0, 2).join(" / ")}</span>
                  </span>
                  <span className={cn("h-2 w-2 rounded-full", active ? "bg-nc-accent" : "bg-nc-border-strong")} />
                </div>
              );
            })}
          </div>
        </div>
      </aside>

    </div>
  );
}

function ControlBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface className="bg-nc-surface p-4">
      <div className="mb-3.5 text-[14px] font-semibold leading-5 text-nc-text-secondary">{title}</div>
      {children}
    </Surface>
  );
}
