export type ProviderKind = "text" | "image" | "video"

export type AIProviderPreset = {
  id: string
  label: string
  provider: string
  type: ProviderKind
  baseURL: string
  model: string
  apiStyle: "openai_compatible" | "anthropic" | "native_video"
  tier: "primary" | "advanced" | "economy" | "experimental" | "compat"
  capability: string
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  { id: "openai-gpt-5-5", label: "OpenAI · GPT-5.5", provider: "openai", type: "text", baseURL: "https://api.openai.com/v1", model: "gpt-5.5", apiStyle: "openai_compatible", tier: "advanced", capability: "剧本、分镜、复杂推理" },
  { id: "openai-gpt-5-4", label: "OpenAI · GPT-5.4", provider: "openai", type: "text", baseURL: "https://api.openai.com/v1", model: "gpt-5.4", apiStyle: "openai_compatible", tier: "advanced", capability: "剧本、分镜、复杂推理" },
  { id: "openai-gpt-4-1", label: "OpenAI · GPT-4.1", provider: "openai", type: "text", baseURL: "https://api.openai.com/v1", model: "gpt-4.1", apiStyle: "openai_compatible", tier: "primary", capability: "稳定剧本与提示词" },
  { id: "openai-gpt-4o-mini", label: "OpenAI · GPT-4o mini", provider: "openai", type: "text", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini", apiStyle: "openai_compatible", tier: "economy", capability: "低成本改写、短提示词" },
  { id: "anthropic-claude-opus", label: "Anthropic · Claude Opus 4.5", provider: "anthropic", type: "text", baseURL: "https://api.anthropic.com", model: "claude-opus-4.5", apiStyle: "anthropic", tier: "advanced", capability: "高质量编剧、长文一致性" },
  { id: "anthropic-claude-sonnet", label: "Anthropic · Claude Sonnet 4.5", provider: "anthropic", type: "text", baseURL: "https://api.anthropic.com", model: "claude-sonnet-4.5", apiStyle: "anthropic", tier: "primary", capability: "导演分镜、稳定规划" },
  { id: "google-gemini-pro", label: "Google · Gemini 2.5 Pro", provider: "google", type: "text", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-pro", apiStyle: "openai_compatible", tier: "primary", capability: "长上下文剧情规划" },
  { id: "google-gemini-flash", label: "Google · Gemini 2.5 Flash", provider: "google", type: "text", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", apiStyle: "openai_compatible", tier: "economy", capability: "快速分镜草稿" },
  { id: "byteplus-seed-18", label: "BytePlus · Seed 1.8", provider: "byteplus", type: "text", baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3", model: "seed-1.8", apiStyle: "openai_compatible", tier: "primary", capability: "中文剧本、长上下文" },
  { id: "byteplus-seed-16", label: "BytePlus · Seed 1.6", provider: "byteplus", type: "text", baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3", model: "seed-1.6", apiStyle: "openai_compatible", tier: "economy", capability: "低成本文案和分镜" },
  { id: "deepseek-chat", label: "DeepSeek · Chat", provider: "deepseek", type: "text", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat", apiStyle: "openai_compatible", tier: "economy", capability: "中文脚本、低成本规划" },
  { id: "qwen-plus", label: "Alibaba · Qwen Plus", provider: "qwen", type: "text", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", apiStyle: "openai_compatible", tier: "primary", capability: "中文剧本、商业文案" },
  { id: "qwen-max", label: "Alibaba · Qwen Max", provider: "qwen", type: "text", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-max", apiStyle: "openai_compatible", tier: "advanced", capability: "高质量中文规划" },
  { id: "glm-46", label: "Zhipu · GLM-4.6", provider: "glm", type: "text", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.6", apiStyle: "openai_compatible", tier: "primary", capability: "中文规划、工具调用预留" },
  { id: "kimi-k2", label: "Moonshot · Kimi K2", provider: "kimi", type: "text", baseURL: "https://api.moonshot.cn/v1", model: "kimi-k2", apiStyle: "openai_compatible", tier: "primary", capability: "长上下文资料消化" },
  { id: "minimax-m1", label: "MiniMax · M1", provider: "minimax", type: "text", baseURL: "https://api.minimax.io/v1", model: "MiniMax-M1", apiStyle: "openai_compatible", tier: "primary", capability: "剧本草稿与中文生成" },

  { id: "openai-image-2", label: "OpenAI · GPT Image 2", provider: "openai", type: "image", baseURL: "https://api.openai.com/v1", model: "gpt-image-2", apiStyle: "openai_compatible", tier: "advanced", capability: "高质量分镜图、视觉设定" },
  { id: "openai-image-15", label: "OpenAI · GPT Image 1.5", provider: "openai", type: "image", baseURL: "https://api.openai.com/v1", model: "gpt-image-1.5", apiStyle: "openai_compatible", tier: "primary", capability: "分镜参考图" },
  { id: "google-nano-banana", label: "Google · Nano Banana / Gemini Image", provider: "google", type: "image", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash-image", apiStyle: "openai_compatible", tier: "primary", capability: "快速分镜图和参考图" },
  { id: "byteplus-seedream-45", label: "BytePlus · Seedream 4.5", provider: "byteplus", type: "image", baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3", model: "seedream-4.5", apiStyle: "openai_compatible", tier: "advanced", capability: "高质量参考图" },
  { id: "byteplus-seedream-40", label: "BytePlus · Seedream 4.0", provider: "byteplus", type: "image", baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3", model: "seedream-4.0", apiStyle: "openai_compatible", tier: "primary", capability: "分镜参考图" },
  { id: "qwen-image", label: "Alibaba · Qwen Image", provider: "qwen", type: "image", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-image", apiStyle: "openai_compatible", tier: "primary", capability: "中文视觉提示词参考图" },
  { id: "glm-cogview", label: "Zhipu · CogView 4", provider: "glm", type: "image", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "cogview-4", apiStyle: "openai_compatible", tier: "primary", capability: "参考图生成" },
  { id: "flux-kontext", label: "Black Forest Labs · FLUX Kontext", provider: "black-forest", type: "image", baseURL: "", model: "flux-kontext", apiStyle: "openai_compatible", tier: "primary", capability: "角色/产品一致性参考图" },

  { id: "seedance-2-pro", label: "BytePlus · Seedance 2.0 Pro", provider: "seedance-relay", type: "video", baseURL: "", model: "seedance-2.0-pro", apiStyle: "native_video", tier: "primary", capability: "主力视频生成" },
  { id: "seedance-2-fast", label: "BytePlus · Seedance 2.0 Fast", provider: "seedance-relay", type: "video", baseURL: "", model: "seedance-2.0-fast", apiStyle: "native_video", tier: "economy", capability: "快速视频生成" },
  { id: "kling-video", label: "Kuaishou · Kling Video", provider: "kling", type: "video", baseURL: "", model: "kling-video", apiStyle: "native_video", tier: "experimental", capability: "视频生成预留" },
  { id: "minimax-video", label: "MiniMax · Video-01", provider: "minimax", type: "video", baseURL: "https://api.minimax.io/v1", model: "video-01", apiStyle: "native_video", tier: "experimental", capability: "视频生成预留" },
  { id: "omnihuman-15", label: "BytePlus · OmniHuman 1.5", provider: "byteplus", type: "video", baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3", model: "omnihuman-1.5", apiStyle: "native_video", tier: "experimental", capability: "数字人视频预留" },
]

export function presetsForType(type: string) {
  return AI_PROVIDER_PRESETS.filter((preset) => preset.type === type)
}

export function presetByID(id: string) {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id)
}
