import { cn } from "@/lib/cn";
import { useDirectorStore } from "@/stores/director-store";

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

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      {/* LLM Configuration */}
      <Section title="Language Model">
        <div className="flex flex-col gap-3">
          <SelectInput label="Provider" value={llm.provider} onChange={(v) => setDefaultLLM({ provider: v })} options={LLM_PROVIDERS} />
          <TextInput label="Model" value={llm.model} onChange={(v) => setDefaultLLM({ model: v })} placeholder="gpt-4o" />
          <TextInput label="Base URL" value={llm.base_url} onChange={(v) => setDefaultLLM({ base_url: v })} placeholder="Leave empty for default" />
          <TextInput label="API Key" value={llm.api_key} onChange={(v) => setDefaultLLM({ api_key: v })} type="password" placeholder="sk-..." />
          <TextInput label="Temperature" value={String(llm.temperature)} onChange={(v) => setDefaultLLM({ temperature: parseFloat(v) || 0.7 })} type="number" />
        </div>
      </Section>

      {/* Video Provider */}
      <Section title="Video Provider">
        <p className="mb-1 text-[11px] leading-relaxed text-nc-text-ghost">
          Uses the same surface as the main API: <span className="font-mono text-[10px]">POST /v1/videos</span> with{" "}
          <span className="font-mono text-[10px]">Authorization: Bearer sk_live_…</span>. Base URL may be{" "}
          <span className="font-mono text-[10px]">https://api.nextapi.top</span> or{" "}
          <span className="font-mono text-[10px]">…/v1</span> — both work.
        </p>
        <div className="flex flex-col gap-3">
          <SelectInput label="Model" value={pipeline.video_model} onChange={(v) => setPipeline({ video_model: v })} options={VIDEO_MODELS} />
          <TextInput label="API Key" value={pipeline.video_api_key} onChange={(v) => setPipeline({ video_api_key: v })} type="password" placeholder="sk_live_… or sk_test_…" />
          <TextInput label="Base URL" value={pipeline.video_base_url} onChange={(v) => setPipeline({ video_base_url: v })} placeholder="https://api.nextapi.top/v1" />
          <SelectInput label="Quality" value={pipeline.video_quality} onChange={(v) => setPipeline({ video_quality: v })} options={[
            { id: "480p", label: "480p" },
            { id: "720p", label: "720p" },
            { id: "1080p", label: "1080p" },
          ]} />
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={pipeline.generate_audio} onChange={(e) => setPipeline({ generate_audio: e.target.checked })} className="accent-[#d4a053]" />
            <span className="text-[12px] text-nc-text-secondary">Generate audio (lip-sync)</span>
          </label>
        </div>
      </Section>

      {/* Per-Agent Override */}
      <Section title="Agent Overrides">
        <p className="mb-3 text-[11px] text-nc-text-ghost">
          Override LLM settings per agent. Defaults to the global language model above.
        </p>
        <div className="flex flex-col gap-0.5">
          {AGENTS.map((a) => {
            const override = pipeline[a.key as keyof typeof pipeline];
            const hasOverride = override !== null && typeof override === "object";
            return (
              <button
                key={a.key}
                className={cn(
                  "flex items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-[12px]",
                  hasOverride
                    ? "bg-nc-accent-muted text-nc-accent"
                    : "text-nc-text-tertiary hover:bg-nc-panel-hover hover:text-nc-text-secondary"
                )}
              >
                <span>{a.label}</span>
                <span className="font-mono text-[9px] text-nc-text-ghost">{hasOverride ? "custom" : "default"}</span>
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
    <div>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-nc-text-secondary">{title}</h3>
      {children}
    </div>
  );
}

function TextInput({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[30px] rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel px-2.5 text-[12px] text-nc-text outline-none focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10"
      />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] cursor-pointer appearance-none rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel px-2.5 text-[12px] text-nc-text outline-none focus:border-nc-accent/40"
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
