import { useState, memo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore, BUILTIN_TEMPLATES } from "@/stores/director-store";
import { useI18nStore } from "@/stores/i18n-store";
import { useDirector } from "@/hooks/useDirector";
import { cn } from "@/lib/cn";
import { GuidedWizard } from "@/components/director/GuidedWizard";

const EXAMPLE_PROMPTS = [
  "A woman in a flowing red dress walks through a neon-lit Tokyo alley at night. Rain reflects the glow of signs above. She stops, turns, and smiles at the camera.",
  "Product hero shot: a golden watch slowly rotates on a marble pedestal. Dramatic spotlight from above, particles of dust floating in the beam. Ultra close-up detail.",
  "A cat sits on a windowsill watching snowfall. It reaches a paw toward a snowflake, then curls back into sleep. Warm amber interior light, cinematic soft focus.",
  "Anime-style scene: two warriors face each other on a moonlit cliff. Wind blows cherry blossoms between them. The camera slowly circles from a low angle.",
];

export const HomePage = memo(function HomePage() {
  const { setSidebarPage } = useAppStore();
  const { prompt, setPrompt, setStyle, setNumShots, setSelectedWorkflow, setUseStructuredPrompt, isRunning } = useDirectorStore();
  const { runPipeline } = useDirector();
  const { t } = useI18nStore();
  const [localPrompt, setLocalPrompt] = useState(prompt || "");
  const [showWizard, setShowWizard] = useState(false);

  const handleQuickGenerate = async () => {
    setPrompt(localPrompt);
    setSidebarPage("agents");
    await runPipeline();
  };

  const handlePrecisePath = () => {
    if (localPrompt) setPrompt(localPrompt);
    setUseStructuredPrompt(true);
    setSidebarPage("agents");
  };

  const applyExample = (text: string) => {
    setLocalPrompt(text);
    setPrompt(text);
  };

  const applyTemplate = (tmplId: string) => {
    const tmpl = BUILTIN_TEMPLATES.find((t) => t.id === tmplId);
    if (tmpl) {
      setSelectedWorkflow(tmpl.workflow);
      setStyle(tmpl.style);
      setNumShots(tmpl.shotCount);
      setSidebarPage("agents");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-nc-bg">
      {showWizard && <GuidedWizard onClose={() => setShowWizard(false)} />}

      {/* Hero */}
      <div className="flex flex-col items-center px-8 pt-16 pb-10 text-center">
        <div className="mb-4 flex items-center gap-2 rounded-full border border-nc-accent/20 bg-nc-accent-muted px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-nc-accent animate-[glow-pulse_3s_ease-in-out_infinite]" />
          <span className="text-[10px] font-medium text-nc-accent">{t("home.hero.poweredBy")}</span>
        </div>
        <h1 className="mb-3 text-[28px] font-bold leading-tight tracking-tight text-nc-text">
          {t("home.hero.title1")}
          <br />
          <span className="text-nc-accent">{t("home.hero.title2")}</span>
        </h1>
        <p className="max-w-md text-[13px] leading-relaxed text-nc-text-tertiary">
          {t("home.hero.subtitle")}
        </p>
        <button
          onClick={() => setShowWizard(true)}
          className="mt-4 flex items-center gap-2 rounded-xl border border-nc-accent/30 bg-nc-accent/10 px-5 py-2 text-[12px] font-semibold text-nc-accent transition-all hover:bg-nc-accent/20 hover:shadow-md"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 1v12M1 7h12" />
          </svg>
          {t("home.hero.wizard")}
        </button>
      </div>

      {/* Two paths */}
      <div className="mx-auto flex w-full max-w-4xl gap-4 px-8">
        {/* Quick Path */}
        <div className="flex flex-1 flex-col rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-5 transition-all hover:border-nc-border-strong hover:shadow-lg hover:shadow-black/10">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-nc-accent/10">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-nc-accent">
                <path d="M2 8h12M9 4l4 4-4 4" />
              </svg>
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-nc-text">{t("home.quick.title")}</h2>
              <p className="text-[10px] text-nc-text-ghost">{t("home.quick.subtitle")}</p>
            </div>
          </div>

          <textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            placeholder={t("home.quick.placeholder")}
            rows={4}
            className={cn(
              "mb-3 w-full resize-none rounded-[var(--radius-md)] border border-nc-border bg-nc-panel px-3 py-2.5 text-[13px] leading-relaxed text-nc-text",
              "placeholder:text-nc-text-ghost/50 outline-none",
              "focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10"
            )}
          />

          {/* Examples */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button
                key={i}
                onClick={() => applyExample(ex)}
                className="rounded-full border border-nc-border px-2 py-0.5 text-[9px] text-nc-text-ghost transition-colors hover:border-nc-border-strong hover:text-nc-text-tertiary"
              >
                {t("home.quick.example")} {i + 1}
              </button>
            ))}
          </div>

          <button
            onClick={handleQuickGenerate}
            disabled={!localPrompt.trim() || isRunning}
            className={cn(
              "mt-auto flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] text-[13px] font-semibold transition-all",
              localPrompt.trim() && !isRunning
                ? "bg-nc-accent text-nc-bg shadow-lg shadow-nc-accent/15 hover:bg-nc-accent-hover"
                : "bg-nc-panel text-nc-text-ghost cursor-not-allowed"
            )}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,0 12,6 2,12" /></svg>
            {isRunning ? t("home.quick.processing") : t("home.quick.generate")}
          </button>
        </div>

        {/* Precise Path */}
        <div className="flex flex-1 flex-col rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-5 transition-all hover:border-nc-border-strong hover:shadow-lg hover:shadow-black/10">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-nc-info/10">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-nc-info">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="M5 6h6M5 8h4M5 10h5" />
              </svg>
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-nc-text">{t("home.precise.title")}</h2>
              <p className="text-[10px] text-nc-text-ghost">{t("home.precise.subtitle")}</p>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-2">
            <StepPreview number={1} title={t("home.precise.step1.title")} desc={t("home.precise.step1.desc")} />
            <StepPreview number={2} title={t("home.precise.step2.title")} desc={t("home.precise.step2.desc")} />
            <StepPreview number={3} title={t("home.precise.step3.title")} desc={t("home.precise.step3.desc")} />
            <StepPreview number={4} title={t("home.precise.step4.title")} desc={t("home.precise.step4.desc")} />
            <StepPreview number={5} title={t("home.precise.step5.title")} desc={t("home.precise.step5.desc")} />
          </div>

          <button
            onClick={handlePrecisePath}
            className="mt-auto flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-nc-info/30 bg-nc-info/10 text-[13px] font-semibold text-nc-info transition-colors hover:bg-nc-info/20"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="8" height="8" rx="1" />
              <path d="M5 4v4M3 6h4" />
            </svg>
            {t("home.precise.btn")}
          </button>
        </div>
      </div>

      {/* Template quick picks */}
      <div className="mx-auto mt-8 w-full max-w-4xl px-8 pb-12">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[12px] font-semibold text-nc-text">{t("home.templates.title")}</h3>
          <button
            onClick={() => setSidebarPage("templates")}
            className="text-[10px] text-nc-accent hover:text-nc-accent-hover"
          >
            {t("home.templates.viewAll")}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {BUILTIN_TEMPLATES.slice(0, 6).map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => applyTemplate(tmpl.id)}
              className="group rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-3 text-left transition-all hover:border-nc-border-strong hover:shadow-md hover:shadow-black/10"
            >
              <div className="mb-1.5 text-[11px] font-semibold text-nc-text">{tmpl.nameZh}</div>
              <div className="mb-1 text-[9px] text-nc-text-ghost">{tmpl.name}</div>
              <div className="flex items-center gap-2 text-[8px] text-nc-text-ghost">
                <span className="tabular-nums">{tmpl.duration}</span>
                <span>{tmpl.shotCount} {t("home.templates.shots")}</span>
                <span className="capitalize">{tmpl.style}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Seedance tips */}
      <div className="mx-auto w-full max-w-4xl border-t border-nc-border px-8 py-6">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-nc-accent">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 0l1.2 3.8H10l-3 2.2 1.2 3.8L5 7.6 1.8 9.8 3 6 0 3.8h3.8z" />
          </svg>
          {t("home.tips.title")}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <TipCard
            title={t("home.tips.tip1.title")}
            desc={t("home.tips.tip1.desc")}
          />
          <TipCard
            title={t("home.tips.tip2.title")}
            desc={t("home.tips.tip2.desc")}
          />
          <TipCard
            title={t("home.tips.tip3.title")}
            desc={t("home.tips.tip3.desc")}
          />
        </div>
      </div>
    </div>
  );
});

function StepPreview({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-nc-border bg-nc-panel px-3 py-2">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-nc-info/10 text-[9px] font-bold text-nc-info">
        {number}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-nc-text">{title}</div>
        <div className="truncate text-[9px] text-nc-text-ghost">{desc}</div>
      </div>
    </div>
  );
}

function TipCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-nc-accent/10 bg-nc-accent-muted p-3">
      <div className="mb-1 text-[10px] font-semibold text-nc-text">{title}</div>
      <p className="text-[9px] leading-relaxed text-nc-text-ghost">{desc}</p>
    </div>
  );
}
