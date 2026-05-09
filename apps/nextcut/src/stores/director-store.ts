import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeMediaSrc } from "@/lib/media";
import { TEMPLATE_CATALOG } from "@/lib/template-catalog";

export interface AgentLLMConfig {
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  temperature: number;
}

export interface PipelineConfig {
  default_llm: AgentLLMConfig;
  screenwriter: AgentLLMConfig | null;
  character_extractor: AgentLLMConfig | null;
  storyboard_artist: AgentLLMConfig | null;
  cinematographer: AgentLLMConfig | null;
  audio_director: AgentLLMConfig | null;
  editing_agent: AgentLLMConfig | null;
  consistency_checker: AgentLLMConfig | null;
  prompt_optimizer: AgentLLMConfig | null;
  video_provider: string;
  video_model: string;
  video_api_key: string;
  video_base_url: string;
  video_quality: string;
  generate_audio: boolean;
}

export interface ReferenceAsset {
  id?: string;
  name?: string;
  url: string;
  type: "image" | "video" | "audio";
  role: string;
  description: string;
  priority?: "primary" | "secondary" | "support";
  locked?: boolean;
}

export interface StructuredPrompt {
  subject: string;
  action: string;
  scene: string;
  camera: string;
  motion: string;
  style: string;
  lighting: string;
  constraints: string;
  audio: string;
}

export type SeedanceWorkflow = "text_to_video" | "image_to_video" | "multimodal_story";

export interface WorkflowPreset {
  id: SeedanceWorkflow;
  label: string;
  labelZh: string;
  description: string;
  descriptionZh: string;
  duration: string;
  needsRefImage: boolean;
  needsRefVideo: boolean;
  model: string;
  tips: string[];
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: "text_to_video",
    label: "Quick Concept",
    labelZh: "快速概念稿",
    description: "Text to video. Fast iteration for idea exploration.",
    descriptionZh: "纯文本生成视频，快速验证创意方向",
    duration: "4-10s",
    needsRefImage: false,
    needsRefVideo: false,
    model: "seedance-2.0-fast",
    tips: [
      "Keep prompts under 80 words for best results",
      "Use SVO structure: Subject + Verb + Object",
      "One clear action per shot",
    ],
  },
  {
    id: "image_to_video",
    label: "Product / Ad",
    labelZh: "广告 / 产品展示",
    description: "Image plus text to video. Best for product shots and ads.",
    descriptionZh: "参考图 + 文案生成视频，适合产品和广告",
    duration: "5-10s",
    needsRefImage: true,
    needsRefVideo: false,
    model: "seedance-2.0-pro",
    tips: [
      "Reference image determines 70% of the output",
      "Keep text prompt focused on motion and camera only",
      "Avoid contradicting the reference image in text",
    ],
  },
  {
    id: "multimodal_story",
    label: "Story / Drama",
    labelZh: "高一致性剧情",
    description: "Multi-image + Ref Video + Text. Maximum character consistency.",
    descriptionZh: "多图 + 参考视频 + 文本，角色和风格最大一致性",
    duration: "5-15s",
    needsRefImage: true,
    needsRefVideo: true,
    model: "seedance-2.0-pro",
    tips: [
      "Use character reference images for identity anchoring",
      "Change only ONE variable per shot (action OR camera, not both)",
      "Reference images matter more than prompt sophistication",
      "Keep individual clips under 10s for best quality",
    ],
  },
];

export type PipelineStep =
  | "idle"
  | "planning"
  | "script_review"
  | "storyboard_review"
  | "prompt_review"
  | "generating"
  | "quality_review"
  | "complete";

export interface CharacterProfile {
  id: string;
  name: string;
  appearance: string;
  personality: string;
  voice: string;
  referenceImages: string[];
  assetPack?: CharacterAssetRef[];
  color: string;
  locked: boolean;
}

export interface CharacterAssetRef {
  id: string;
  url: string;
  role: "turnaround" | "expressions" | "outfits" | "poses" | string;
  description: string;
  prompt?: string;
}

export interface SceneOutline {
  id: string;
  title: string;
  description: string;
  characters: string[];
}

export interface QualityScore {
  overall: number;
  characterConsistency: number;
  promptQuality: number;
  styleCoherence: number;
  issues: string[];
}

export interface ShotAudio {
  dialogue: string;
  lip_sync: string;
  music: string;
  sfx: string;
}

export interface ShotGenerationParams {
  shot_script?: string;
  constraints?: string;
  audio_cues?: string[];
  reference_instructions?: string[];
  first_frame_desc?: string;
  last_frame_desc?: string;
  motion_desc?: string;
  storyboard_image_url?: string;
  first_frame_image_url?: string;
  last_frame_image_url?: string;
  image_urls?: string[];
  video_urls?: string[];
  audio_urls?: string[];
  identity_locks?: ShotIdentityLock[];
  provider_options?: Record<string, unknown>;
  provider_score?: number;
  provider_reason?: string;
}

export interface ShotIdentityLock {
  character_id: string;
  character_name: string;
  reference_urls: string[];
  asset_roles: string[];
}

export interface Shot {
  id: string;
  scene_id: string;
  index: number;
  title: string;
  duration: number;
  prompt: string;
  negative_prompt: string;
  status: string;
  video_url: string;
  thumbnail_url: string;
  camera: string;
  audio?: ShotAudio;
  generationParams?: ShotGenerationParams;
  qualityScore: QualityScore | null;
}

export interface ProductionBible {
  schema_version: string;
  title: string;
  style_contract: string;
  format_contract: string;
  reference_policy: string;
  prompt_rules: string[];
  render_checks: string[];
}

export interface ShotGenerationCard {
  shot_id: string;
  prompt_role: string;
  motion_contract: string;
  camera_contract: string;
  reference_contract: string;
  risk_flags: string[];
  edit_note: string;
}

export interface PromptReviewSummary {
  critical: number;
  warning: number;
  info: number;
  findings: Array<{
    shot_id: string;
    severity: string;
    code: string;
    message: string;
    suggestion: string;
  }>;
}

export interface AgentProgress {
  agent: string;
  status: string;
  progress: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  nameZh: string;
  category: "system" | "studio" | "account";
  description: string;
  duration: string;
  shotCount: number;
  shotDuration?: number;
  aspectRatio?: string;
  style: string;
  workflow: SeedanceWorkflow;
  prompt: string;
  tags: string[];
  thumbnail?: string;
  difficulty?: "入门" | "进阶" | "专业";
  deliverables?: string[];
  chain?: string[];
  variables?: string[];
}

const LEGACY_BUILTIN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tmpl_vertical_drama_30s",
    name: "Vertical Drama 30s",
    nameZh: "竖屏剧情短视频 30s",
    category: "system",
    description: "6-shot vertical drama for social media",
    duration: "30s",
    shotCount: 6,
    style: "cinematic",
    workflow: "multimodal_story",
    prompt: "",
    tags: ["social", "drama", "vertical"],
  },
  {
    id: "tmpl_product_unbox_15s",
    name: "Product Unboxing 15s",
    nameZh: "产品开箱 15s",
    category: "system",
    description: "3-shot product reveal with close-ups",
    duration: "15s",
    shotCount: 3,
    style: "commercial",
    workflow: "image_to_video",
    prompt: "",
    tags: ["product", "commercial", "unboxing"],
  },
  {
    id: "tmpl_cinematic_trailer_60s",
    name: "Cinematic Trailer 60s",
    nameZh: "电影预告片 60s",
    category: "system",
    description: "12-shot cinematic trailer with arc structure",
    duration: "60s",
    shotCount: 12,
    style: "cinematic",
    workflow: "multimodal_story",
    prompt: "",
    tags: ["cinema", "trailer", "epic"],
  },
  {
    id: "tmpl_music_video_45s",
    name: "Music Video 45s",
    nameZh: "音乐 MV 45s",
    category: "system",
    description: "9-shot music video with rhythm-cut editing",
    duration: "45s",
    shotCount: 9,
    style: "music_video",
    workflow: "multimodal_story",
    prompt: "",
    tags: ["music", "mv", "rhythm"],
  },
  {
    id: "tmpl_anime_short_20s",
    name: "Anime Short 20s",
    nameZh: "动漫短片 20s",
    category: "system",
    description: "4-shot anime-style short film",
    duration: "20s",
    shotCount: 4,
    style: "anime",
    workflow: "text_to_video",
    prompt: "",
    tags: ["anime", "short", "stylized"],
  },
  {
    id: "tmpl_food_commercial_10s",
    name: "Food Commercial 10s",
    nameZh: "美食广告 10s",
    category: "system",
    description: "2-shot food close-up with slow motion",
    duration: "10s",
    shotCount: 2,
    style: "commercial",
    workflow: "image_to_video",
    prompt: "",
    tags: ["food", "commercial", "closeup"],
  },
  {
    id: "tmpl_real_estate_flythrough_20s",
    name: "Real Estate Flythrough 20s",
    nameZh: "高端房产漫游 20s",
    category: "system",
    description: "4-shot smooth drone flythrough of a luxury property",
    duration: "20s",
    shotCount: 4,
    style: "architectural",
    workflow: "text_to_video",
    prompt: "Smooth FPV drone flight through a modern luxury villa. Sunset lighting, huge glass windows, minimalist interior. Architectural photography style.",
    tags: ["real-estate", "drone", "luxury"],
  },
  {
    id: "tmpl_automotive_showcase_15s",
    name: "Automotive Showcase 15s",
    nameZh: "汽车大片 15s",
    category: "system",
    description: "3-shot dynamic car commercial with motion blur",
    duration: "15s",
    shotCount: 3,
    style: "commercial",
    workflow: "image_to_video",
    prompt: "Dynamic tracking shot of a sports car driving on a coastal highway at dusk. Motion blur on the wheels, dramatic reflections on the chassis.",
    tags: ["automotive", "car", "commercial"],
  },
  {
    id: "tmpl_ai_influencer_vlog_30s",
    name: "AI Influencer Vlog 30s",
    nameZh: "AI 达人 Vlog 30s",
    category: "system",
    description: "5-shot vertical vlog maintaining strong character consistency",
    duration: "30s",
    shotCount: 5,
    style: "vlog",
    workflow: "multimodal_story",
    prompt: "A trendy fashion influencer walking through a sunny city street, talking to the camera, drinking coffee.",
    tags: ["influencer", "vlog", "vertical", "character-consistency"],
  },
  {
    id: "tmpl_macro_nature_documentary_15s",
    name: "Macro Nature Doc 15s",
    nameZh: "微距自然纪录片 15s",
    category: "system",
    description: "3-shot extreme close-up of nature with depth of field",
    duration: "15s",
    shotCount: 3,
    style: "documentary",
    workflow: "text_to_video",
    prompt: "Extreme macro shot of a dewdrop falling from a bright green fern leaf in a dense rainforest. National Geographic documentary style, shallow depth of field, crisp detail.",
    tags: ["nature", "macro", "documentary"],
  },
  {
    id: "tmpl_cyberpunk_night_20s",
    name: "Cyberpunk Night 20s",
    nameZh: "赛博朋克夜景 20s",
    category: "system",
    description: "4-shot neon lit cyberpunk aesthetic",
    duration: "20s",
    shotCount: 4,
    style: "cyberpunk",
    workflow: "text_to_video",
    prompt: "A rainy night in a futuristic cyberpunk city. Neon lights reflecting in puddles. A mysterious figure in a glowing jacket walks into a noodle bar. Blade Runner 2049 aesthetic.",
    tags: ["cyberpunk", "neon", "sci-fi"],
  },
  {
    id: "tmpl_fashion_lookbook_15s",
    name: "Fashion Lookbook 15s",
    nameZh: "时尚杂志大片 15s",
    category: "system",
    description: "3-shot high-end fashion editorial video",
    duration: "15s",
    shotCount: 3,
    style: "editorial",
    workflow: "image_to_video",
    prompt: "High-end fashion editorial shot. A model posing in an avant-garde outfit against a stark concrete wall. Flash photography lighting, high contrast.",
    tags: ["fashion", "editorial", "apparel"],
  },
  {
    id: "tmpl_kurosawa_samurai_20s",
    name: "Kurosawa Samurai 20s",
    nameZh: "黑泽明武士风格 20s",
    category: "system",
    description: "4-shot high-contrast black & white samurai duel",
    duration: "20s",
    shotCount: 4,
    style: "cinematic",
    workflow: "text_to_video",
    prompt: "Akira Kurosawa style black and white film. Two samurai facing off in a wind-swept grassy field. High contrast lighting, dramatic tension. Sudden quick strike. Film grain.",
    tags: ["kurosawa", "samurai", "b&w", "cinema"],
  },
  {
    id: "tmpl_miyazaki_fantasy_30s",
    name: "Miyazaki Fantasy 30s",
    nameZh: "宫崎骏治愈动画 30s",
    category: "system",
    description: "5-shot Studio Ghibli style lush nature animation",
    duration: "30s",
    shotCount: 5,
    style: "anime",
    workflow: "text_to_video",
    prompt: "Studio Ghibli style animation. A young girl running through a lush, vibrant green field towards a giant ancient tree. Fluffy white clouds in a bright blue sky. Wind blowing through grass.",
    tags: ["miyazaki", "ghibli", "anime", "healing"],
  },
  {
    id: "tmpl_wong_kar_wai_romance_20s",
    name: "Wong Kar-wai Romance 20s",
    nameZh: "王家卫浪漫氛围 20s",
    category: "system",
    description: "4-shot moody, step-printed slow motion romance",
    duration: "20s",
    shotCount: 4,
    style: "cinematic",
    workflow: "text_to_video",
    prompt: "Wong Kar-wai style cinematography. A woman smoking a cigarette in a dimly lit Hong Kong diner. Neon lights outside the window. Step-printed slow motion, heavy red and green color grading, moody atmosphere.",
    tags: ["wong-kar-wai", "moody", "romance", "neon"],
  },
  {
    id: "tmpl_wes_anderson_symmetry_15s",
    name: "Wes Anderson Symmetry 15s",
    nameZh: "韦斯安德森对称美学 15s",
    category: "system",
    description: "3-shot perfect symmetry with pastel colors",
    duration: "15s",
    shotCount: 3,
    style: "cinematic",
    workflow: "text_to_video",
    prompt: "Wes Anderson style. Perfectly symmetrical wide shot of a quirky pastel-colored hotel lobby. A bellboy in a purple uniform walks rigidly across the frame. Flat lighting, highly stylized.",
    tags: ["wes-anderson", "symmetry", "pastel"],
  },
  {
    id: "tmpl_tarantino_dialogue_20s",
    name: "Tarantino Dialogue 20s",
    nameZh: "昆汀式对话张力 20s",
    category: "system",
    description: "4-shot intense low-angle dialogue sequence",
    duration: "20s",
    shotCount: 4,
    style: "cinematic",
    workflow: "text_to_video",
    prompt: "Quentin Tarantino style. Extreme low-angle trunk shot looking up at two men in dark suits. Intense dialogue scene. Retro 1970s color palette, high contrast, gritty film look.",
    tags: ["tarantino", "dialogue", "gritty"],
  },
  {
    id: "tmpl_shinkai_meteor_15s",
    name: "Shinkai Meteor Sky 15s",
    nameZh: "新海诚唯美星空 15s",
    category: "system",
    description: "3-shot breathtaking hyper-realistic anime sky",
    duration: "15s",
    shotCount: 3,
    style: "anime",
    workflow: "text_to_video",
    prompt: "Makoto Shinkai style. A breathtaking, hyper-detailed twilight sky filled with falling meteors and glowing clouds over a modern Japanese cityscape. Lens flares, vivid purple and pink hues.",
    tags: ["shinkai", "anime", "sky", "beautiful"],
  },
  {
    id: "tmpl_fincher_thriller_20s",
    name: "Fincher Thriller 20s",
    nameZh: "大卫芬奇惊悚冷调 20s",
    category: "system",
    description: "4-shot dark, precise, cold-tinted thriller",
    duration: "20s",
    shotCount: 4,
    style: "cinematic",
    workflow: "text_to_video",
    prompt: "David Fincher style thriller. Slow, perfectly precise dolly-in on a dark, cluttered detective's desk. Desaturated yellow-green sickly color palette. Low key lighting, intense shadows, clinical precision.",
    tags: ["fincher", "thriller", "dark", "mystery"],
  },
  {
    id: "tmpl_sci_fi_hologram_15s",
    name: "Sci-Fi Hologram 15s",
    nameZh: "科幻全息投影 15s",
    category: "system",
    description: "3-shot futuristic interface interaction",
    duration: "15s",
    shotCount: 3,
    style: "sci-fi",
    workflow: "text_to_video",
    prompt: "Close up of a scientist interacting with a glowing blue 3D hologram of a DNA helix in a dark, high-tech laboratory. Cinematic sci-fi lighting, lens flares, highly detailed UI elements floating in the air.",
    tags: ["sci-fi", "hologram", "future", "tech"],
  },
  {
    id: "tmpl_vintage_vhs_10s",
    name: "Vintage VHS 10s",
    nameZh: "复古 VHS 录像带 10s",
    category: "system",
    description: "2-shot retro 80s camcorder aesthetic",
    duration: "10s",
    shotCount: 2,
    style: "vintage",
    workflow: "text_to_video",
    prompt: "1980s VHS camcorder footage. Kids riding bikes down a suburban street at golden hour. Heavy VHS tracking glitches, date stamp in the corner, washed-out colors, scanlines.",
    tags: ["vintage", "vhs", "retro", "80s"],
  },
  {
    id: "tmpl_claymation_cute_15s",
    name: "Claymation Cute 15s",
    nameZh: "可爱黏土定格 15s",
    category: "system",
    description: "3-shot stop-motion clay animation",
    duration: "15s",
    shotCount: 3,
    style: "animation",
    workflow: "text_to_video",
    prompt: "Stop-motion claymation style. A cute little clay penguin waddling across a snowy landscape made of cotton. Visible fingerprints on the clay, tactile textures, studio miniature lighting.",
    tags: ["claymation", "stop-motion", "cute", "animation"],
  },
  {
    id: "tmpl_comic_book_action_20s",
    name: "Comic Book Action 20s",
    nameZh: "美漫动作风格 20s",
    category: "system",
    description: "4-shot halftone comic book superhero sequence",
    duration: "20s",
    shotCount: 4,
    style: "stylized",
    workflow: "text_to_video",
    prompt: "Comic book style, halftone dots, cel-shaded. A superhero landing on a rooftop at night. Dynamic action pose, high contrast shading, vibrant primary colors, stylized motion lines.",
    tags: ["comic", "halftone", "superhero", "stylized"],
  },
  {
    id: "tmpl_noir_detective_25s",
    name: "Film Noir Detective 25s",
    nameZh: "黑色电影侦探 25s",
    category: "system",
    description: "5-shot classic film noir mystery",
    duration: "25s",
    shotCount: 5,
    style: "cinematic",
    workflow: "text_to_video",
    prompt: "1940s film noir style. A detective in a trench coat and fedora walks through a foggy alley. Heavy chiaroscuro lighting, venetian blind shadows across his face, black and white, rain-slicked streets.",
    tags: ["noir", "detective", "mystery", "b&w"],
  },
  {
    id: "tmpl_drone_action_chase_15s",
    name: "Drone Action Chase 15s",
    nameZh: "无人机动作追逐 15s",
    category: "system",
    description: "3-shot high-speed FPV drone tracking shot",
    duration: "15s",
    shotCount: 3,
    style: "action",
    workflow: "text_to_video",
    prompt: "High-speed FPV drone shot. Chasing a dirt bike drifting through a dusty desert canyon. Camera banks aggressively. Motion blur, dynamic high-octane action, golden hour lighting.",
    tags: ["drone", "chase", "action", "fpv"],
  }
];

void LEGACY_BUILTIN_TEMPLATES;

export const BUILTIN_TEMPLATES: WorkflowTemplate[] = TEMPLATE_CATALOG;

interface DirectorState {
  prompt: string;
  setPrompt: (p: string) => void;

  structuredPrompt: StructuredPrompt;
  setStructuredPrompt: (p: Partial<StructuredPrompt>) => void;
  useStructuredPrompt: boolean;
  setUseStructuredPrompt: (v: boolean) => void;

  selectedWorkflow: SeedanceWorkflow;
  setSelectedWorkflow: (w: SeedanceWorkflow) => void;

  style: string;
  setStyle: (s: string) => void;

  numShots: number;
  setNumShots: (n: number) => void;

  duration: number;
  setDuration: (d: number) => void;

  aspectRatio: string;
  setAspectRatio: (ar: string) => void;

  references: ReferenceAsset[];
  addReference: (r: ReferenceAsset) => void;
  removeReference: (index: number) => void;

  pipeline: PipelineConfig;
  setPipeline: (p: Partial<PipelineConfig>) => void;
  setDefaultLLM: (c: Partial<AgentLLMConfig>) => void;
  setAgentLLM: (agent: string, config: AgentLLMConfig | null) => void;

  pipelineStep: PipelineStep;
  setPipelineStep: (s: PipelineStep) => void;

  characters: CharacterProfile[];
  setCharacters: (c: CharacterProfile[]) => void;
  addCharacter: (c: CharacterProfile) => void;
  updateCharacter: (id: string, patch: Partial<CharacterProfile>) => void;
  removeCharacter: (id: string) => void;

  sceneOutlines: SceneOutline[];
  setSceneOutlines: (s: SceneOutline[]) => void;
  updateSceneOutline: (id: string, patch: Partial<SceneOutline>) => void;

  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  updateShot: (id: string, patch: Partial<Shot>) => void;
  reorderShots: (fromIndex: number, toIndex: number) => void;

  agentProgress: AgentProgress[];
  setAgentProgress: (p: AgentProgress[]) => void;
  updateAgentProgress: (p: AgentProgress) => void;

  isRunning: boolean;
  setIsRunning: (r: boolean) => void;

  planId: string | null;
  setPlanId: (id: string | null) => void;

  lastError: string | null;
  setLastError: (err: string | null) => void;

  overallQuality: QualityScore | null;
  setOverallQuality: (q: QualityScore | null) => void;

  productionBible: ProductionBible | null;
  setProductionBible: (b: ProductionBible | null) => void;
  shotGenerationCards: ShotGenerationCard[];
  setShotGenerationCards: (cards: ShotGenerationCard[]) => void;
  promptReview: PromptReviewSummary | null;
  setPromptReview: (summary: PromptReviewSummary | null) => void;

  savedTemplates: WorkflowTemplate[];
  addSavedTemplate: (t: WorkflowTemplate) => void;
  removeSavedTemplate: (id: string) => void;

  resetPipeline: () => void;
}

const DEFAULT_LLM: AgentLLMConfig = {
  provider: "openai",
  model: "gpt-4o",
  base_url: "",
  api_key: "",
  temperature: 0.7,
};

const DEFAULT_PIPELINE: PipelineConfig = {
  default_llm: DEFAULT_LLM,
  screenwriter: null,
  character_extractor: null,
  storyboard_artist: null,
  cinematographer: null,
  audio_director: null,
  editing_agent: null,
  consistency_checker: null,
  prompt_optimizer: null,
  video_provider: "seedance",
  video_model: "seedance-2.0-pro",
  video_api_key: "",
  video_base_url: "https://api.nextapi.top/v1",
  video_quality: "720p",
  generate_audio: true,
};

const DEFAULT_STRUCTURED_PROMPT: StructuredPrompt = {
  subject: "",
  action: "",
  scene: "",
  camera: "",
  motion: "",
  style: "",
  lighting: "",
  constraints: "",
  audio: "",
};

function stripAgentSecrets(config: AgentLLMConfig | null): AgentLLMConfig | null {
  return config ? { ...config, api_key: "" } : null;
}

function sanitizePipelineForPersist(pipeline: PipelineConfig): PipelineConfig {
  return {
    ...pipeline,
    default_llm: stripAgentSecrets(pipeline.default_llm) ?? DEFAULT_LLM,
    screenwriter: stripAgentSecrets(pipeline.screenwriter),
    character_extractor: stripAgentSecrets(pipeline.character_extractor),
    storyboard_artist: stripAgentSecrets(pipeline.storyboard_artist),
    cinematographer: stripAgentSecrets(pipeline.cinematographer),
    audio_director: stripAgentSecrets(pipeline.audio_director),
    editing_agent: stripAgentSecrets(pipeline.editing_agent),
    consistency_checker: stripAgentSecrets(pipeline.consistency_checker),
    prompt_optimizer: stripAgentSecrets(pipeline.prompt_optimizer),
    video_api_key: "",
  };
}

function sanitizeMediaList(values?: string[]) {
  if (!Array.isArray(values)) return values;
  return values.map((url) => safeMediaSrc(url)).filter((url): url is string => Boolean(url));
}

function sanitizeReferenceAsset(reference: ReferenceAsset): ReferenceAsset {
  return {
    ...reference,
    url: safeMediaSrc(reference.url) || "",
  };
}

function sanitizeCharacterProfile(character: CharacterProfile): CharacterProfile {
  return {
    ...character,
    referenceImages: sanitizeMediaList(character.referenceImages) || [],
    assetPack: character.assetPack?.map((asset) => ({
      ...asset,
      url: safeMediaSrc(asset.url) || "",
    })).filter((asset) => asset.url),
  };
}

function sanitizeShotMedia(shot: Shot): Shot {
  const params = shot.generationParams;
  return {
    ...shot,
    video_url: safeMediaSrc(shot.video_url) || "",
    thumbnail_url: safeMediaSrc(shot.thumbnail_url) || "",
    generationParams: params
      ? {
          ...params,
          image_urls: sanitizeMediaList(params.image_urls),
          video_urls: sanitizeMediaList(params.video_urls),
          audio_urls: sanitizeMediaList(params.audio_urls),
          identity_locks: params.identity_locks?.map((lock) => ({
            ...lock,
            reference_urls: sanitizeMediaList(lock.reference_urls) || [],
          })),
        }
      : params,
  };
}

function sanitizeShotPatch(patch: Partial<Shot>): Partial<Shot> {
  const sanitized = { ...patch };
  if ("video_url" in sanitized) sanitized.video_url = safeMediaSrc(sanitized.video_url) || "";
  if ("thumbnail_url" in sanitized) sanitized.thumbnail_url = safeMediaSrc(sanitized.thumbnail_url) || "";
  if (sanitized.generationParams) {
    sanitized.generationParams = {
      ...sanitized.generationParams,
      image_urls: sanitizeMediaList(sanitized.generationParams.image_urls),
      video_urls: sanitizeMediaList(sanitized.generationParams.video_urls),
      audio_urls: sanitizeMediaList(sanitized.generationParams.audio_urls),
      identity_locks: sanitized.generationParams.identity_locks?.map((lock) => ({
        ...lock,
        reference_urls: sanitizeMediaList(lock.reference_urls) || [],
      })),
    };
  }
  return sanitized;
}

function persistableDirectorState(state: DirectorState) {
  return {
    pipeline: sanitizePipelineForPersist(state.pipeline),
    style: state.style,
    numShots: state.numShots,
    duration: state.duration,
    aspectRatio: state.aspectRatio,
    selectedWorkflow: state.selectedWorkflow,
    useStructuredPrompt: state.useStructuredPrompt,
    savedTemplates: state.savedTemplates,
  };
}

export const useDirectorStore = create<DirectorState>()(
  persist(
    (set) => ({
      prompt: "",
      setPrompt: (prompt) => set({ prompt }),

      structuredPrompt: DEFAULT_STRUCTURED_PROMPT,
      setStructuredPrompt: (p) =>
        set((s) => ({ structuredPrompt: { ...s.structuredPrompt, ...p } })),
      useStructuredPrompt: false,
      setUseStructuredPrompt: (v) => set({ useStructuredPrompt: v }),

      selectedWorkflow: "text_to_video",
      setSelectedWorkflow: (w) => set({ selectedWorkflow: w }),

      style: "cinematic",
      setStyle: (style) => set({ style }),

      numShots: 6,
      setNumShots: (numShots) => set({ numShots: Math.max(1, Math.min(24, numShots)) }),

      duration: 5,
      setDuration: (duration) => set({ duration: Math.max(4, Math.min(15, duration)) }),

      aspectRatio: "16:9",
      setAspectRatio: (aspectRatio) => set({ aspectRatio }),

      references: [],
      addReference: (r) => set((s) => ({ references: [...s.references, sanitizeReferenceAsset(r)] })),
      removeReference: (i) => set((s) => ({ references: s.references.filter((_, idx) => idx !== i) })),

      pipeline: DEFAULT_PIPELINE,
      setPipeline: (p) => set((s) => ({ pipeline: { ...s.pipeline, ...p } })),
      setDefaultLLM: (c) =>
        set((s) => ({
          pipeline: {
            ...s.pipeline,
            default_llm: { ...s.pipeline.default_llm, ...c },
          },
        })),
      setAgentLLM: (agent, config) =>
        set((s) => ({
          pipeline: { ...s.pipeline, [agent]: config },
        })),

      pipelineStep: "idle",
      setPipelineStep: (s) => set({ pipelineStep: s }),

      characters: [],
      setCharacters: (characters) => set({ characters: characters.map(sanitizeCharacterProfile) }),
      addCharacter: (c) => set((s) => ({ characters: [...s.characters, sanitizeCharacterProfile(c)] })),
      updateCharacter: (id, patch) =>
        set((s) => ({
          characters: s.characters.map((c) => (c.id === id ? sanitizeCharacterProfile({ ...c, ...patch }) : c)),
        })),
      removeCharacter: (id) =>
        set((s) => ({ characters: s.characters.filter((c) => c.id !== id) })),

      sceneOutlines: [],
      setSceneOutlines: (s) => set({ sceneOutlines: s }),
      updateSceneOutline: (id, patch) =>
        set((s) => ({
          sceneOutlines: s.sceneOutlines.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        })),

      shots: [],
      setShots: (shots) => set({ shots: shots.map(sanitizeShotMedia) }),
      updateShot: (id, patch) =>
        set((s) => ({
          shots: s.shots.map((sh) => (sh.id === id ? sanitizeShotMedia({ ...sh, ...sanitizeShotPatch(patch) }) : sh)),
        })),
      reorderShots: (fromIndex, toIndex) =>
        set((s) => {
          const updated = [...s.shots];
          const [moved] = updated.splice(fromIndex, 1);
          updated.splice(toIndex, 0, moved);
          return { shots: updated.map((sh, i) => ({ ...sh, index: i + 1 })) };
        }),

      agentProgress: [],
      setAgentProgress: (agentProgress) => set({ agentProgress }),
      updateAgentProgress: (p) =>
        set((s) => {
          const idx = s.agentProgress.findIndex((a) => a.agent === p.agent);
          if (idx >= 0) {
            const updated = [...s.agentProgress];
            updated[idx] = p;
            return { agentProgress: updated };
          }
          return { agentProgress: [...s.agentProgress, p] };
        }),

      isRunning: false,
      setIsRunning: (isRunning) => set({ isRunning }),

      planId: null,
      setPlanId: (planId) => set({ planId }),

      lastError: null,
      setLastError: (lastError) => set({ lastError }),

      overallQuality: null,
      setOverallQuality: (q) => set({ overallQuality: q }),

      productionBible: null,
      setProductionBible: (productionBible) => set({ productionBible }),
      shotGenerationCards: [],
      setShotGenerationCards: (shotGenerationCards) => set({ shotGenerationCards }),
      promptReview: null,
      setPromptReview: (promptReview) => set({ promptReview }),

      savedTemplates: [],
      addSavedTemplate: (t) =>
        set((s) => ({ savedTemplates: [...s.savedTemplates, t] })),
      removeSavedTemplate: (id) =>
        set((s) => ({ savedTemplates: s.savedTemplates.filter((t) => t.id !== id) })),

      resetPipeline: () =>
        set({
          pipeline: DEFAULT_PIPELINE,
          structuredPrompt: DEFAULT_STRUCTURED_PROMPT,
        }),
    }),
    {
      name: "nextcut-director",
      partialize: persistableDirectorState,
      onRehydrateStorage: () => (state) => {
        if (!state || typeof localStorage === "undefined") return;
        localStorage.setItem("nextcut-director", JSON.stringify({ state: persistableDirectorState(state), version: 0 }));
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<DirectorState>;
        const persistedPipeline = p.pipeline ? sanitizePipelineForPersist(p.pipeline) : undefined;
        const sanitizedPersisted = {
          ...p,
          ...(p.references ? { references: p.references.map(sanitizeReferenceAsset) } : {}),
          ...(p.characters ? { characters: p.characters.map(sanitizeCharacterProfile) } : {}),
          ...(p.shots ? { shots: p.shots.map(sanitizeShotMedia) } : {}),
        };
        const legacy: Record<string, string> = {
          "seedance-2.0-reference-to-video": "seedance-2.0-pro",
          "seedance-2.0-text-to-video": "seedance-2.0-fast",
          "seedance-2.0": "seedance-2.0-pro",
        };
        const vm = persistedPipeline?.video_model;
        if (vm && legacy[vm]) {
          return {
            ...current,
            ...sanitizedPersisted,
            pipeline: { ...current.pipeline, ...persistedPipeline, video_model: legacy[vm] },
          };
        }
        return { ...current, ...sanitizedPersisted, ...(persistedPipeline ? { pipeline: { ...current.pipeline, ...persistedPipeline } } : {}) };
      },
    }
  )
);
