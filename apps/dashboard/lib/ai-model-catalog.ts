export type AIModelCategory = "script" | "text" | "image" | "video"

export type AIModelCatalogItem = {
  id: string
  category: AIModelCategory
  name: string
  provider: string
  icon: string
  enabled: boolean
  description: string
}

export const AI_MODEL_CATALOG: AIModelCatalogItem[] = [
  {
    id: "script-director-default",
    category: "script",
    name: "Director Script Planner",
    provider: "NextAPI",
    icon: "S",
    enabled: false,
    description: "Staged script planning model. Operators can enable it after a script provider is configured.",
  },
  {
    id: "deepseek-chat",
    category: "text",
    name: "DeepSeek Chat",
    provider: "DeepSeek",
    icon: "T",
    enabled: false,
    description: "Text/storyboard model placeholder. Configure a default text provider in admin to use AI Director.",
  },
  {
    id: "gpt-4o-mini",
    category: "text",
    name: "GPT-4o mini",
    provider: "OpenAI",
    icon: "T",
    enabled: false,
    description: "OpenAI-compatible text model placeholder.",
  },
  {
    id: "flux-kontext",
    category: "image",
    name: "FLUX Kontext",
    provider: "Black Forest Labs",
    icon: "I",
    enabled: false,
    description: "Reference image generation placeholder. Enable after an image provider key is configured.",
  },
  {
    id: "seedream",
    category: "image",
    name: "Seedream",
    provider: "ByteDance",
    icon: "I",
    enabled: false,
    description: "Image model placeholder for future provider configuration.",
  },
  {
    id: "seedance-2.0-pro",
    category: "video",
    name: "Seedance 2.0 Pro",
    provider: "ByteDance",
    icon: "V",
    enabled: true,
    description: "Live video model routed through the existing NextAPI video task and credit system.",
  },
  {
    id: "kling-video",
    category: "video",
    name: "Kling Video",
    provider: "Kuaishou",
    icon: "V",
    enabled: false,
    description: "Video model placeholder. Not available until an operator configures a live provider.",
  },
]
