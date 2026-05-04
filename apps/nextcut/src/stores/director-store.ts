import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  url: string;
  type: "image" | "video" | "audio";
  role: string;
  description: string;
}

export interface StructuredPrompt {
  subject: string;
  action: string;
  camera: string;
  style: string;
  constraints: string;
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
    description: "Text → Video. Fast iteration for idea exploration.",
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
    description: "Image + Text → Video. Best for product shots and ads.",
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
  color: string;
  locked: boolean;
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
  qualityScore: QualityScore | null;
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
  style: string;
  workflow: SeedanceWorkflow;
  prompt: string;
  tags: string[];
}

export const BUILTIN_TEMPLATES: WorkflowTemplate[] = [
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
];

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
  camera: "",
  style: "",
  constraints: "",
};

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
      addReference: (r) => set((s) => ({ references: [...s.references, r] })),
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
      setCharacters: (characters) => set({ characters }),
      addCharacter: (c) => set((s) => ({ characters: [...s.characters, c] })),
      updateCharacter: (id, patch) =>
        set((s) => ({
          characters: s.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
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
      setShots: (shots) => set({ shots }),
      updateShot: (id, patch) =>
        set((s) => ({
          shots: s.shots.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)),
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
      partialize: (state) => ({
        pipeline: state.pipeline,
        style: state.style,
        numShots: state.numShots,
        duration: state.duration,
        aspectRatio: state.aspectRatio,
        selectedWorkflow: state.selectedWorkflow,
        useStructuredPrompt: state.useStructuredPrompt,
        savedTemplates: state.savedTemplates,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<DirectorState>;
        const legacy: Record<string, string> = {
          "seedance-2.0-reference-to-video": "seedance-2.0-pro",
          "seedance-2.0-text-to-video": "seedance-2.0-fast",
          "seedance-2.0": "seedance-2.0-pro",
        };
        const vm = p.pipeline?.video_model;
        if (vm && legacy[vm]) {
          return {
            ...current,
            ...p,
            pipeline: { ...current.pipeline, ...p.pipeline, video_model: legacy[vm] },
          };
        }
        return { ...current, ...p };
      },
    }
  )
);
