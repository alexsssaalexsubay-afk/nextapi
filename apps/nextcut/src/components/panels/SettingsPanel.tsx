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

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      {/* LLM Configuration */}
      <Section title={t("settings.llm")}>
        <div className="flex flex-col gap-3">
          <SelectInput label={t("settings.provider")} value={llm.provider} onChange={(v) => setDefaultLLM({ provider: v })} options={LLM_PROVIDERS} />
          <TextInput label={t("settings.model")} value={llm.model} onChange={(v) => setDefaultLLM({ model: v })} placeholder="gpt-4o" />
          <TextInput label={t("settings.baseUrl")} value={llm.base_url} onChange={(v) => setDefaultLLM({ base_url: v })} placeholder={t("settings.emptyDefault")} />
          <TextInput label={t("settings.apiKey")} value={llm.api_key} onChange={(v) => setDefaultLLM({ api_key: v })} type="password" placeholder="sk-..." />
          <TextInput label={t("settings.temp")} value={String(llm.temperature)} onChange={(v) => setDefaultLLM({ temperature: parseFloat(v) || 0.7 })} type="number" />
        </div>
      </Section>

      {/* Video Provider */}
      <Section title={t("settings.videoProvider")}>
        <p className="mb-1 text-sm leading-relaxed text-nc-text-tertiary">
          {t("settings.videoDesc1")}<span className="font-mono text-xs">POST /v1/videos</span>{t("settings.videoDesc2")}
          <span className="font-mono text-xs">Authorization: Bearer sk_live_…</span>{t("settings.videoDesc3")}
          <span className="font-mono text-xs">https://api.nextapi.top</span>{t("settings.videoDesc4")}
          <span className="font-mono text-xs">…/v1</span>{t("settings.videoDesc5")}
        </p>
        <div className="flex flex-col gap-3">
          <SelectInput label={t("settings.model")} value={pipeline.video_model} onChange={(v) => setPipeline({ video_model: v })} options={VIDEO_MODELS} />
          <TextInput label={t("settings.apiKey")} value={pipeline.video_api_key} onChange={(v) => setPipeline({ video_api_key: v })} type="password" placeholder="sk_live_… or sk_test_…" />
          <TextInput label={t("settings.baseUrl")} value={pipeline.video_base_url} onChange={(v) => setPipeline({ video_base_url: v })} placeholder="https://api.nextapi.top/v1" />
          <SelectInput label={t("settings.quality")} value={pipeline.video_quality} onChange={(v) => setPipeline({ video_quality: v })} options={[
            { id: "480p", label: "480p" },
            { id: "720p", label: "720p" },
            { id: "1080p", label: "1080p" },
          ]} />
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={pipeline.generate_audio} onChange={(e) => setPipeline({ generate_audio: e.target.checked })} className="accent-[#d4a053]" />
            <span className="text-sm text-nc-text-secondary">{t("settings.genAudio")}</span>
          </label>
        </div>
      </Section>

      {/* Per-Agent Override */}
      <Section title={t("settings.agentOverrides")}>
        <p className="mb-3 text-sm text-nc-text-tertiary">
          {t("settings.agentDesc")}
        </p>
        <div className="flex flex-col gap-0.5">
          {AGENTS.map((a) => {
            const override = pipeline[a.key as keyof typeof pipeline];
            const hasOverride = override !== null && typeof override === "object";
            return (
              <button
                key={a.key}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-transparent px-4 py-3 text-sm shadow-sm transition-all hover:border-nc-border hover:bg-nc-panel-hover/80 hover:shadow-md",
                  hasOverride
                    ? "bg-nc-accent-muted text-nc-accent"
                    : "text-nc-text-tertiary hover:bg-nc-panel-hover hover:text-nc-text-secondary"
                )}
              >
                <span>{a.label}</span>
                <span className="font-mono text-xs text-nc-text-tertiary">{hasOverride ? t("settings.custom") : t("settings.default")}</span>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-nc-border-strong bg-nc-surface p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-nc-text-secondary">{title}</h3>
      {children}
    </div>
  );
}

function TextInput({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-nc-text-secondary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg border border-nc-border-strong bg-nc-panel px-3 text-sm text-nc-text shadow-sm outline-none focus:border-nc-accent/50 focus:ring-2 focus:ring-nc-accent/10"
      />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-nc-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 cursor-pointer appearance-none rounded-lg border border-nc-border-strong bg-nc-panel px-3 text-sm text-nc-text shadow-sm outline-none focus:border-nc-accent/50 focus:ring-2 focus:ring-nc-accent/10"
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
