import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SystemInfo {
  os: string;
  arch: string;
  cpu_count: number;
  ram_gb: number;
  gpu_name: string;
  gpu_vram_gb: number;
  gpu_backend: string;
}

export interface OllamaInfo {
  available: boolean;
  url: string;
  models: Array<{ name: string; size: number; family: string }>;
  recommended_model: string;
}

export interface SetupStatus {
  first_launch: boolean;
  system: SystemInfo;
  ollama: OllamaInfo;
  comfyui: { available: boolean; url: string };
  api_keys: {
    nextapi: boolean;
    openai: boolean;
    anthropic: boolean;
    deepseek: boolean;
    google: boolean;
  };
  ready: boolean;
  issues: string[];
  recommendations: string[];
}

interface SetupState {
  setupComplete: boolean;
  setSetupComplete: (v: boolean) => void;

  setupStatus: SetupStatus | null;
  setSetupStatus: (s: SetupStatus) => void;

  wizardStep: number;
  setWizardStep: (s: number) => void;

  savedKeys: {
    nextapi_key: string;
    openai_key: string;
    openai_base_url: string;
    openai_model: string;
  };
  setSavedKeys: (k: Partial<SetupState["savedKeys"]>) => void;
}

export const useSetupStore = create<SetupState>()(
  persist(
    (set) => ({
      setupComplete: false,
      setSetupComplete: (v) => set({ setupComplete: v }),

      setupStatus: null,
      setSetupStatus: (s) => set({ setupStatus: s }),

      wizardStep: 0,
      setWizardStep: (s) => set({ wizardStep: s }),

      savedKeys: {
        nextapi_key: "",
        openai_key: "",
        openai_base_url: "",
        openai_model: "gpt-4o",
      },
      setSavedKeys: (k) =>
        set((state) => ({
          savedKeys: { ...state.savedKeys, ...k },
        })),
    }),
    { name: "nextcut-setup" }
  )
);
