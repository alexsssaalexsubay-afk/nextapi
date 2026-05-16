export type KnowledgeSourceId =
  | "massive_prompt_db"
  | "prompt_kb"
  | "camera_presets"
  | "production_bible"
  | "provider_scorer"
  | "vimax_bridge"
  | "short_drama_pack"
  | "prompt_taxonomy";

export interface DirectorKnowledgeSource {
  id: KnowledgeSourceId;
  name: string;
  scope: string;
  status: "local" | "sidecar" | "vendored" | "frontend";
  metric: string;
  value: string;
  rules: string[];
}

export interface DirectorCameraPreset {
  id: string;
  nameZh: string;
  category: "dialogue" | "action" | "establishing" | "product" | "mood" | "transition";
  camera: string;
  motion: string;
  lens: string;
  lighting: string;
  composition: string;
  seedanceTip: string;
}

export interface ProviderProfile {
  id: string;
  label: string;
  strengths: string[];
  baseScores: {
    quality: number;
    control: number;
    reliability: number;
    cost: number;
    latency: number;
    continuity: number;
  };
}

export interface ProviderRecommendation {
  provider: ProviderProfile;
  total: number;
  taskFit: number;
  continuity: number;
  reason: string;
}

export interface TechniquePack {
  id: string;
  label: string;
  description: string;
  promptRule: string;
}

export const DIRECTOR_KNOWLEDGE_SOURCES: DirectorKnowledgeSource[] = [
  {
    id: "massive_prompt_db",
    name: "大规模提示词字典",
    scope: "本地提示词与标签字典",
    status: "sidecar",
    metric: "50,830 条提示词 / 501,586 个标签",
    value: "镜头词、材质词、风格词、开源高分 prompt 模式",
    rules: ["根据用户输入召回细分词汇", "把抽象风格翻译成可生成的视觉实体"],
  },
  {
    id: "prompt_kb",
    name: "提示词知识库",
    scope: "Hunyuan / Seedance / LTX 硬规则",
    status: "sidecar",
    metric: "5 个完整示例 + 硬规则",
    value: "SVO、LAMP 空间轨迹、VidCRAFT3 动作拆解、静态图规则",
    rules: ["所有镜头使用结构化长提示词", "复杂动作按时间顺序拆分"],
  },
  {
    id: "camera_presets",
    name: "运镜预设",
    scope: "专业摄影模板",
    status: "sidecar",
    metric: "10 个运镜模板",
    value: "对话、动作、建立、产品、情绪、转场运镜模板",
    rules: ["按镜头目标自动匹配运镜", "Seedance 提示中加入微运动与曝光变化"],
  },
  {
    id: "production_bible",
    name: "制作约束手册",
    scope: "镜头生成约束",
    status: "sidecar",
    metric: "风格 / 画幅 / 参考优先级",
    value: "统一角色、风格、参考图优先级和渲染检查",
    rules: ["参考素材优先于文字外观描述", "每个 shot 生成可复核的制作卡"],
  },
  {
    id: "provider_scorer",
    name: "生成服务推荐",
    scope: "7 维视频模型选择",
    status: "sidecar",
    metric: "5 个生成服务画像",
    value: "按任务匹配质量、控制、成本、速度、一致性",
    rules: ["多镜头叙事优先一致性", "动作场景优先运动控制"],
  },
  {
    id: "vimax_bridge",
    name: "ViMax 导演链",
    scope: "内置多角色视频创作流程",
    status: "vendored",
    metric: "脚本 / 分镜 / 参考 / 一致性",
    value: "一句话到故事、脚本、角色、分镜、参考图选择和一致性校验",
    rules: ["保持角色和场景连续", "同机位镜头可并行生成提高效率"],
  },
  {
    id: "short_drama_pack",
    name: "短剧模板包",
    scope: "短剧与电商模板",
    status: "local",
    metric: "10 个模板 + 示例清单",
    value: "短剧、情绪特写、电商模特、产品递送、咖啡馆等模板",
    rules: ["前 2 秒必须有可见钩子", "竖屏内容主体占据上中部焦点"],
  },
  {
    id: "prompt_taxonomy",
    name: "提示词分类",
    scope: "镜头 / 镜头焦段 / 灯光 / 风格词库",
    status: "frontend",
    metric: "运镜 / 镜头 / 灯光 / 图片预设",
    value: "UI 侧可即时使用的镜头、光学、灯光、分镜图词库",
    rules: ["把选择器和生成提示词直接联动", "所有标签最终落到镜头卡片"],
  },
];

export const TECHNIQUE_PACKS: TechniquePack[] = [
  {
    id: "svo_hunyuan",
    label: "SVO + Hunyuan",
    description: "主体、动作、对象先行，再补镜头、光线、场景和约束。",
    promptRule: "Use [Shot Type] + [Subject & Appearance] + [Subject Motion] + [Camera Movement] + [Lighting] + [Scene] + [Style] + [Constraints].",
  },
  {
    id: "lamp_spatial",
    label: "LAMP 空间轨迹",
    description: "用 foreground/background、left/right、Z-axis 说明空间路径。",
    promptRule: "Describe spatial trajectory with foreground-left, background-right, center frame, and Z-axis depth cues.",
  },
  {
    id: "vidcraft_motion",
    label: "VidCRAFT3 动作拆解",
    description: "主体动作和镜头运动分离，复杂动作拆为顺序步骤。",
    promptRule: "Decouple subject motion from camera motion. Use First/Then sequence when action has multiple beats.",
  },
  {
    id: "reference_policy",
    label: "参考优先",
    description: "参考图锁定外观，文字只写运动、镜头、光线和不可见意图。",
    promptRule: "Reference images define appearance; text prompt only adds motion, camera, lighting, and constraints.",
  },
  {
    id: "two_second_hook",
    label: "2 秒钩子",
    description: "第一镜头必须发生视觉反差、状态破坏或明确行动。",
    promptRule: "The first two seconds must show a visible hook action or status-quo breaking event.",
  },
  {
    id: "asmr_transform",
    label: "ASMR 转化",
    description: "适合清洁、美食、产品质感，用微距和声音细节制造满足感。",
    promptRule: "Use macro texture, tactile sound cues, and a before-to-after transformation when the prompt is product or food oriented.",
  },
  {
    id: "multicam_consistency",
    label: "多机位一致性",
    description: "来自 ViMax：同一场景里保持角色位置、方向和背景连续。",
    promptRule: "Preserve character blocking, camera direction, wardrobe, and background continuity across adjacent shots.",
  },
];

export const DIRECTOR_CAMERA_PRESETS: DirectorCameraPreset[] = [
  {
    id: "dialogue_ots",
    nameZh: "过肩对话镜头",
    category: "dialogue",
    camera: "over-the-shoulder medium close-up",
    motion: "gentle handheld micro-sway with subtle breathing rhythm",
    lens: "50mm f/1.8 shallow depth of field",
    lighting: "soft key light from 45 degrees, warm fill, natural eye highlights",
    composition: "rule of thirds, speaking subject in clear focus, shoulder frame edge",
    seedanceTip: "Add subtle handheld micro-movement and natural exposure shifts to avoid a mechanical feel.",
  },
  {
    id: "dialogue_closeup",
    nameZh: "亲密特写",
    category: "dialogue",
    camera: "tight close-up on face",
    motion: "imperceptible slow push-in, breathing-like micro-drift",
    lens: "85mm f/1.4 portrait bokeh",
    lighting: "Rembrandt lighting, one side shadow, warm skin tones",
    composition: "centered face, eyes on upper third line, shallow depth",
    seedanceTip: "Describe micro expressions as physical details instead of abstract feelings.",
  },
  {
    id: "action_tracking",
    nameZh: "动作追踪镜头",
    category: "action",
    camera: "medium tracking shot following subject",
    motion: "steady lateral tracking at subject speed, slight forward momentum",
    lens: "35mm anamorphic wide",
    lighting: "dynamic high-contrast, directional hard light with motion blur",
    composition: "subject in left third, movement direction has headroom",
    seedanceTip: "One clear action per shot; describe physical impacts such as dust, fabric, splash, or sparks.",
  },
  {
    id: "action_lowangle",
    nameZh: "仰角力量镜头",
    category: "action",
    camera: "low-angle dramatic upward shot",
    motion: "slow dolly-in from ground level, building tension",
    lens: "24mm wide-angle slight distortion",
    lighting: "strong backlight rim, silhouette edge, dramatic sky",
    composition: "subject dominates frame from below, environment frames edges",
    seedanceTip: "Put the power pose and subject action first because early instructions carry more weight.",
  },
  {
    id: "establishing_wide",
    nameZh: "全景建立镜头",
    category: "establishing",
    camera: "extreme wide shot, full environment reveal",
    motion: "slow crane rise or gentle aerial drift",
    lens: "16mm ultra-wide, deep focus",
    lighting: "golden hour rim light, volumetric atmosphere, natural gradient sky",
    composition: "environment fills frame, small subject figure for scale",
    seedanceTip: "Use environment references and add atmospheric haze for cinematic depth.",
  },
  {
    id: "establishing_orbit",
    nameZh: "环绕揭示镜头",
    category: "establishing",
    camera: "smooth orbital arc around subject, 180 degrees",
    motion: "steady 180-degree orbit at eye level, constant radius",
    lens: "35mm standard, moderate depth of field",
    lighting: "changing light direction as camera orbits, natural shadow play",
    composition: "subject centered, background shifts revealing new context",
    seedanceTip: "Use a single camera move only; do not add zoom or tilt on top.",
  },
  {
    id: "product_hero",
    nameZh: "产品英雄镜头",
    category: "product",
    camera: "close-up product showcase on clean surface",
    motion: "slow 45-degree orbit with gentle rise, highlighting form",
    lens: "100mm macro, razor-sharp focus on product surface",
    lighting: "studio three-point lighting with bright key, soft fill, accent rim",
    composition: "centered product, clean negative space, reflection surface",
    seedanceTip: "Use product photo as image 1 to lock appearance and add material details.",
  },
  {
    id: "mood_slowmo",
    nameZh: "慢动作氛围镜头",
    category: "mood",
    camera: "medium shot, emotional moment captured",
    motion: "extremely slow dolly-in, time feels stretched",
    lens: "85mm f/1.2, dreamy shallow focus",
    lighting: "soft diffused backlight, lens flare edges, warm color temperature",
    composition: "subject in soft focus transitioning to sharp, emotional reveal",
    seedanceTip: "Describe emotions through physical details such as breath, eyes, hands, and posture.",
  },
  {
    id: "transition_pullback",
    nameZh: "拉远揭示镜头",
    category: "transition",
    camera: "starting tight on detail, pulling back to reveal full scene",
    motion: "steady dolly-out accelerating, from close-up to wide",
    lens: "zoom from 85mm to 24mm simulated through camera distance",
    lighting: "detail lighting transitioning to environmental lighting",
    composition: "starts with mystery detail, reveals context and meaning",
    seedanceTip: "Use timecoded sequence: 00:00 detail, 00:02 pull back, 00:05 reveal.",
  },
  {
    id: "transition_matchcut",
    nameZh: "匹配剪辑过渡",
    category: "transition",
    camera: "two matched compositions sharing geometric similarity",
    motion: "minimal motion relying on visual match between shapes",
    lens: "consistent focal length for both sides of cut",
    lighting: "matching light direction across scenes for seamless visual bridge",
    composition: "geometric match: circle to circle, line to line, shape rhyme",
    seedanceTip: "Describe both halves explicitly and match rotation speed and direction.",
  },
];

export const PROVIDER_PROFILES: ProviderProfile[] = [
  {
    id: "seedance-2.0",
    label: "Seedance 2.0",
    strengths: ["multishot_narrative", "audio_sync", "reference_control", "character_consistency", "lip_sync", "multimodal_input"],
    baseScores: { quality: 0.85, control: 0.95, reliability: 0.85, cost: 0.75, latency: 0.8, continuity: 0.9 },
  },
  {
    id: "kling-3.0",
    label: "Kling 3.0",
    strengths: ["motion_control", "physics_precision", "action_scenes", "sharp_detail", "dance_choreography"],
    baseScores: { quality: 0.9, control: 0.8, reliability: 0.8, cost: 0.7, latency: 0.75, continuity: 0.75 },
  },
  {
    id: "sora-2",
    label: "Sora 2",
    strengths: ["cinematic_atmosphere", "camera_language", "hero_shot", "natural_lighting", "emotional_depth"],
    baseScores: { quality: 0.95, control: 0.6, reliability: 0.7, cost: 0.4, latency: 0.5, continuity: 0.65 },
  },
  {
    id: "ltx-2.3",
    label: "LTX 2.3",
    strengths: ["local_generation", "open_source", "comfyui_native", "two_stage_upscale", "fast_iteration"],
    baseScores: { quality: 0.7, control: 0.75, reliability: 0.9, cost: 0.95, latency: 0.85, continuity: 0.6 },
  },
  {
    id: "wan-2.7",
    label: "Wan 2.7",
    strengths: ["local_generation", "small_model", "chinese_prompt", "fast_draft"],
    baseScores: { quality: 0.6, control: 0.65, reliability: 0.85, cost: 0.95, latency: 0.9, continuity: 0.55 },
  },
];

export function pickCameraPreset(text: string, index: number): DirectorCameraPreset {
  const lower = text.toLowerCase();
  if (/dialogue|conversation|talk|speak|对话|口播|说话/.test(lower)) return DIRECTOR_CAMERA_PRESETS[0];
  if (/action|fight|chase|run|dance|动作|追逐|打斗|奔跑|舞/.test(lower)) return DIRECTOR_CAMERA_PRESETS[2 + (index % 2)];
  if (/product|showcase|display|产品|展示|广告|电商|卖点/.test(lower)) return DIRECTOR_CAMERA_PRESETS[6];
  if (/emotion|mood|feel|slow|情感|氛围|眼神|反应/.test(lower)) return DIRECTOR_CAMERA_PRESETS[7];
  if (/transition|reveal|cut|过渡|揭示|转场|收束/.test(lower)) return DIRECTOR_CAMERA_PRESETS[8 + (index % 2)];
  if (index === 0) return DIRECTOR_CAMERA_PRESETS[4];
  return DIRECTOR_CAMERA_PRESETS[(index + 4) % DIRECTOR_CAMERA_PRESETS.length];
}

export function scoreProvidersForTask(input: {
  taskType: string;
  shotCount: number;
  needsAudio: boolean;
  needsLipSync: boolean;
  localOnly: boolean;
  budgetConstrained: boolean;
}): ProviderRecommendation[] {
  const tasks = [input.taskType];
  if (input.needsAudio) tasks.push("audio_sync");
  if (input.needsLipSync) tasks.push("lip_sync");
  if (input.shotCount > 1) tasks.push("multishot_narrative");
  if (input.localOnly) tasks.push("local_only");
  if (input.budgetConstrained) tasks.push("budget_constrained");

  const taskBoost: Record<string, Record<string, number>> = {
    multishot_narrative: { "seedance-2.0": 0.2, "kling-3.0": -0.05, "sora-2": -0.1 },
    audio_sync: { "seedance-2.0": 0.25 },
    lip_sync: { "seedance-2.0": 0.25 },
    action_scene: { "kling-3.0": 0.2, "seedance-2.0": 0.05 },
    hero_shot: { "sora-2": 0.25, "seedance-2.0": 0.05 },
    product_showcase: { "kling-3.0": 0.15, "seedance-2.0": 0.1 },
    character_consistency: { "seedance-2.0": 0.15 },
    local_only: { "ltx-2.3": 0.3, "wan-2.7": 0.25 },
    budget_constrained: { "ltx-2.3": 0.2, "wan-2.7": 0.2, "seedance-2.0": 0.05 },
  };

  return PROVIDER_PROFILES.map((provider) => {
    let taskFit = 0.5;
    tasks.forEach((task) => {
      taskFit += taskBoost[task]?.[provider.id] ?? 0;
    });
    taskFit = Math.max(0, Math.min(1, taskFit));

    const continuity = Math.max(
      0,
      Math.min(1, provider.baseScores.continuity + (input.shotCount > 3 ? (provider.strengths.includes("character_consistency") ? 0.1 : -0.05) : 0))
    );
    const total =
      0.25 * taskFit +
      0.2 * provider.baseScores.quality +
      0.15 * provider.baseScores.control +
      0.1 * provider.baseScores.reliability +
      0.1 * provider.baseScores.cost +
      0.1 * provider.baseScores.latency +
      0.1 * continuity;
    const matchedStrength = provider.strengths.find((strength) => tasks.some((task) => strength.includes(task) || task.includes(strength)));
    return {
      provider,
      total: Number(total.toFixed(3)),
      taskFit: Number(taskFit.toFixed(3)),
      continuity: Number(continuity.toFixed(3)),
      reason: matchedStrength ? matchedStrength.replace(/_/g, " ") : input.shotCount > 1 ? "multi-shot planning profile" : "general creative generation",
    };
  }).sort((a, b) => b.total - a.total);
}

export function inferTaskType(prompt: string, modeId: string): string {
  if (modeId === "product" || /产品|广告|品牌|电商|发布|卖点|咖啡|护肤|商品/.test(prompt)) return "product_showcase";
  if (/动作|追逐|武打|战斗|dance|fight|run/.test(prompt.toLowerCase())) return "action_scene";
  if (modeId === "story" || /剧情|角色|冲突|故事|短剧|对白|情绪/.test(prompt)) return "character_consistency";
  if (/电影|大片|hero|史诗|氛围/.test(prompt.toLowerCase())) return "hero_shot";
  return modeId === "social" ? "fast_draft" : "multishot_narrative";
}

export function buildKnowledgeRuleList(activeSourceIds: KnowledgeSourceId[], activeTechniqueIds: string[]): string[] {
  const sourceRules = DIRECTOR_KNOWLEDGE_SOURCES
    .filter((source) => activeSourceIds.includes(source.id))
    .flatMap((source) => source.rules);
  const techniqueRules = TECHNIQUE_PACKS
    .filter((pack) => activeTechniqueIds.includes(pack.id))
    .map((pack) => pack.promptRule);
  return Array.from(new Set([...sourceRules, ...techniqueRules]));
}
