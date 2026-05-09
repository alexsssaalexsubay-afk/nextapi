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

export interface LocalRuntimeStatus {
  sidecar: boolean;
  ffmpeg: boolean;
  ffmpeg_path: string;
  ffmpeg_source: string;
  exports_dir: string;
  exports_writable: boolean;
  packaged_video_tools: boolean;
}

export interface ProductionLineStatus {
  id: string;
  label: string;
  provider: string;
  category: string;
  modalities: string[];
  installed: boolean;
  configured: boolean;
  ready: boolean;
  billing: string;
  key_source: string;
  endpoint: string;
  model_hint: string;
  local_resource: string;
  blockers: string[];
  capabilities: string[];
  notes: string;
}

export interface SetupStatus {
  first_launch: boolean;
  system: SystemInfo;
  runtime: LocalRuntimeStatus;
  ollama: OllamaInfo;
  comfyui: { available: boolean; url: string };
  api_keys: {
    nextapi: boolean;
    openai: boolean;
    anthropic: boolean;
    deepseek: boolean;
    google: boolean;
  };
  production_lines: ProductionLineStatus[];
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

function persistableSetupState(state: SetupState) {
  return {
    setupComplete: state.setupComplete,
    setupStatus: state.setupStatus,
    wizardStep: state.wizardStep,
    savedKeys: {
      nextapi_key: "",
      openai_key: "",
      openai_base_url: state.savedKeys.openai_base_url,
      openai_model: state.savedKeys.openai_model,
    },
  };
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
    {
      name: "nextcut-setup",
      partialize: persistableSetupState,
      onRehydrateStorage: () => (state) => {
        if (!state || typeof localStorage === "undefined") return;
        localStorage.setItem("nextcut-setup", JSON.stringify({ state: persistableSetupState(state), version: 0 }));
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<SetupState>;
        return {
          ...current,
          ...p,
          savedKeys: {
            ...current.savedKeys,
            ...p.savedKeys,
            nextapi_key: "",
            openai_key: "",
          },
        };
      },
    }
  )
);
