import { useState } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore } from "@/stores/director-store";
import { useI18nStore } from "@/stores/i18n-store";

const LLM_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "minimax", label: "MiniMax" },
  { id: "qwen", label: "Qwen" },
  { id: "ollama", label: "Ollama (Local)" },
  { id: "custom", label: "Custom" },
];

const VIDEO_MODELS = [
  { id: "seedance-2.0-pro", label: "Seedance 2.0 Pro (references / multimodal)" },
  { id: "seedance-2.0-fast", label: "Seedance 2.0 Fast" },
  { id: "seedance-1.5-pro", label: "Seedance 1.5 Pro (compat)" },
];

const AGENTS = [
  { key: "screenwriter", label: "Screenwriter" },
  { key: "character_extractor", label: "Characters" },
  { key: "storyboard_artist", label: "Storyboard" },
  { key: "cinematographer", label: "Camera" },
  { key: "audio_director", label: "Audio" },
  { key: "editing_agent", label: "Editing" },
  { key: "consistency_checker", label: "Checker" },
  { key: "prompt_optimizer", label: "Optimizer" },
] as const;

export function SettingsPanel() {
  const { pipeline, setPipeline, setDefaultLLM } = useDirectorStore();
  const llm = pipeline.default_llm;
  const { t } = useI18nStore();
  const [activeTab, setActiveTab] = useState<"llm" | "video" | "agents">("llm");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-nc-bg p-8 lg:p-14">
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-12">
        
        {/* Header & Tabs */}
        <div className="flex flex-col gap-8 pb-4">
          <h2 className="text-3xl font-extrabold tracking-tight text-nc-text">
            Configuration
          </h2>
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("llm")}
              className={cn(
                "pb-2 text-[15px] font-medium transition-all",
                activeTab === "llm" ? "border-b-2 border-nc-text text-nc-text" : "border-b-2 border-transparent text-nc-text-tertiary hover:text-nc-text-secondary"
              )}
            >
              {t("settings.llm")}
            </button>
            <button
              onClick={() => setActiveTab("video")}
              className={cn(
                "pb-2 text-[15px] font-medium transition-all",
                activeTab === "video" ? "border-b-2 border-nc-text text-nc-text" : "border-b-2 border-transparent text-nc-text-tertiary hover:text-nc-text-secondary"
              )}
            >
              {t("settings.videoProvider")}
            </button>
            <button
              onClick={() => setActiveTab("agents")}
              className={cn(
                "pb-2 text-[15px] font-medium transition-all",
                activeTab === "agents" ? "border-b-2 border-nc-text text-nc-text" : "border-b-2 border-transparent text-nc-text-tertiary hover:text-nc-text-secondary"
              )}
            >
              {t("settings.agentOverrides")}
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="flex flex-col">
          
          {/* LLM Tab */}
          {activeTab === "llm" && (
            <div className="flex flex-col gap-10 animate-fade-in">
              <div className="grid gap-8 sm:grid-cols-2">
                <SelectInput label={t("settings.provider")} value={llm.provider} onChange={(v) => setDefaultLLM({ provider: v })} options={LLM_PROVIDERS} />
                <div className="hidden sm:block" /> {/* spacer */}
                
                <TextInput label={t("settings.apiKey")} value={llm.api_key} onChange={(v) => setDefaultLLM({ api_key: v })} type="password" placeholder="sk-..." />
                <TextInput label={t("settings.model")} value={llm.model} onChange={(v) => setDefaultLLM({ model: v })} placeholder="gpt-4o" />
              </div>

              <div className="flex items-center gap-4">
                <button className="h-10 rounded-lg border border-nc-border bg-nc-surface px-6 text-[14px] font-medium text-nc-text hover:bg-nc-panel transition-colors shadow-sm">
                  Test Connection
                </button>
                <button className="h-10 rounded-lg bg-nc-text px-6 text-[14px] font-medium text-nc-surface hover:bg-nc-text-secondary transition-colors shadow-sm">
                  Save
                </button>
              </div>

              <div className="mt-4 pt-8 border-t border-nc-border">
                <h3 className="text-sm font-semibold text-nc-text mb-6">Advanced</h3>
                <div className="grid gap-8 sm:grid-cols-2">
                  <TextInput label={t("settings.baseUrl")} value={llm.base_url} onChange={(v) => setDefaultLLM({ base_url: v })} placeholder={t("settings.emptyDefault")} />
                  <TextInput label={t("settings.temp")} value={String(llm.temperature)} onChange={(v) => setDefaultLLM({ temperature: parseFloat(v) || 0.7 })} type="number" />
                </div>
              </div>
            </div>
          )}

          {/* Video Tab */}
          {activeTab === "video" && (
            <div className="flex flex-col gap-10 animate-fade-in">
              <div className="grid gap-8 sm:grid-cols-2">
                <SelectInput label={t("settings.model")} value={pipeline.video_model} onChange={(v) => setPipeline({ video_model: v })} options={VIDEO_MODELS} />
                <div className="hidden sm:block" /> {/* spacer */}
                
                <TextInput label={t("settings.apiKey")} value={pipeline.video_api_key} onChange={(v) => setPipeline({ video_api_key: v })} type="password" placeholder="sk_live_… or sk_test_…" />
              </div>
              
              <div className="flex items-center gap-4 pt-2">
                <label className="flex cursor-pointer items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <input type="checkbox" checked={pipeline.generate_audio} onChange={(e) => setPipeline({ generate_audio: e.target.checked })} className="peer sr-opacity-0 h-5 w-5 opacity-0 absolute z-10 cursor-pointer" />
                    <div className="h-5 w-5 rounded border border-nc-border-strong bg-nc-surface peer-checked:bg-nc-text peer-checked:border-nc-text transition-all flex items-center justify-center">
                      <svg className="h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 7.5 6 10.5 11 3" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-[14px] font-medium text-nc-text">{t("settings.genAudio")}</span>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <button className="h-10 rounded-lg border border-nc-border bg-nc-surface px-6 text-[14px] font-medium text-nc-text hover:bg-nc-panel transition-colors shadow-sm">
                  Test Connection
                </button>
                <button className="h-10 rounded-lg bg-nc-text px-6 text-[14px] font-medium text-nc-surface hover:bg-nc-text-secondary transition-colors shadow-sm">
                  Save
                </button>
              </div>

              <div className="mt-4 pt-8 border-t border-nc-border">
                <h3 className="text-sm font-semibold text-nc-text mb-6">API & Advanced Config</h3>
                
                <div className="grid gap-8 sm:grid-cols-2 mb-8">
                  <TextInput label={t("settings.baseUrl")} value={pipeline.video_base_url} onChange={(v) => setPipeline({ video_base_url: v })} placeholder="https://api.nextapi.top/v1" />
                  <SelectInput label={t("settings.quality")} value={pipeline.video_quality} onChange={(v) => setPipeline({ video_quality: v })} options={[
                    { id: "480p", label: "480p" },
                    { id: "720p", label: "720p" },
                    { id: "1080p", label: "1080p" },
                  ]} />
                </div>

                <div className="rounded-lg bg-nc-surface p-5 border border-nc-border">
                  <p className="text-[13px] leading-relaxed text-nc-text-secondary">
                    {t("settings.videoDesc1")}<br />
                    <span className="my-2 inline-block rounded bg-nc-panel px-2 py-1 font-mono text-[12px] text-nc-text">POST /v1/videos</span><br />
                    {t("settings.videoDesc2")}<br />
                    <span className="my-2 inline-block rounded bg-nc-panel px-2 py-1 font-mono text-[12px] text-nc-text">Authorization: Bearer sk_live_…</span><br />
                    {t("settings.videoDesc3")}<br />
                    <span className="my-2 inline-block rounded bg-nc-panel px-2 py-1 font-mono text-[12px] text-nc-text">https://api.nextapi.top</span><br />
                    {t("settings.videoDesc4")}<br />
                    <span className="my-2 inline-block rounded bg-nc-panel px-2 py-1 font-mono text-[12px] text-nc-text">…/v1</span><br />
                    {t("settings.videoDesc5")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Agents Tab */}
          {activeTab === "agents" && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="mb-6 text-[15px] text-nc-text-secondary">
                {t("settings.agentDesc")}
              </p>
              {AGENTS.map((a) => {
                const override = pipeline[a.key as keyof typeof pipeline];
                const hasOverride = override !== null && typeof override === "object";
                return (
                  <button
                    key={a.key}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-6 py-5 text-[15px] transition-all",
                      hasOverride
                        ? "border-nc-border-strong bg-nc-surface text-nc-text shadow-sm"
                        : "border-transparent bg-nc-bg text-nc-text-secondary hover:bg-nc-surface hover:text-nc-text"
                    )}
                  >
                    <span className="font-medium">{a.label}</span>
                    <span className={cn(
                      "text-[13px] px-3 py-1 rounded-full",
                      hasOverride ? "bg-nc-panel text-nc-text" : "bg-nc-bg text-nc-text-tertiary"
                    )}>
                      {hasOverride ? t("settings.custom") : t("settings.default")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className="text-[12px] font-bold text-nc-text-secondary uppercase tracking-wider">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-nc-border bg-nc-surface px-4 text-[15px] text-nc-text shadow-sm outline-none transition-all placeholder:text-nc-text-tertiary/60 focus:border-nc-text focus:ring-2 focus:ring-nc-text/10"
      />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className="text-[12px] font-bold text-nc-text-secondary uppercase tracking-wider">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-nc-border bg-nc-surface px-4 pr-10 text-[15px] text-nc-text shadow-sm outline-none transition-all focus:border-nc-text focus:ring-2 focus:ring-nc-text/10"
        >
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-nc-text-tertiary" viewBox="0 0 20 20" fill="none" stroke="currentColor">
          <path d="M5 7l5 5 5-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </label>
  );
}
