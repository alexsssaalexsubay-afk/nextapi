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
        <div className="mb-4 flex items-center gap-2 rounded-full border border-nc-accent/30 bg-nc-accent-muted px-4 py-2 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-nc-accent animate-[glow-pulse_3s_ease-in-out_infinite]" />
          <span className="text-xs font-semibold text-nc-accent">{t("home.hero.poweredBy")}</span>
        </div>
        <h1 className="mb-3 text-3xl font-bold leading-tight tracking-tight text-nc-text">
          {t("home.hero.title1")}
          <br />
          <span className="text-nc-accent">{t("home.hero.title2")}</span>
        </h1>
        <p className="max-w-md text-base leading-relaxed text-nc-text-secondary">
          {t("home.hero.subtitle")}
        </p>
        <button
          onClick={() => setShowWizard(true)}
          className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-nc-accent/35 bg-nc-accent/10 px-5 py-2.5 text-sm font-semibold text-nc-accent shadow-md transition-all hover:bg-nc-accent/20 hover:shadow-lg"
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
        <div className="flex flex-1 flex-col rounded-[var(--radius-lg)] border border-nc-border-strong bg-nc-surface p-5 shadow-md transition-all hover:-translate-y-0.5 hover:border-nc-accent/25 hover:shadow-xl hover:shadow-black/15">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nc-accent/10">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-nc-accent">
                <path d="M2 8h12M9 4l4 4-4 4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-nc-text">{t("home.quick.title")}</h2>
              <p className="text-sm text-nc-text-tertiary">{t("home.quick.subtitle")}</p>
            </div>
          </div>

          <textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            placeholder={t("home.quick.placeholder")}
            rows={4}
            className={cn(
              "mb-3 w-full resize-none rounded-lg border border-nc-border-strong bg-nc-panel px-3 py-2.5 text-base leading-relaxed text-nc-text",
              "placeholder:text-nc-text-tertiary/50 outline-none",
              "focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10"
            )}
          />

          {/* Examples */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button
                key={i}
                onClick={() => applyExample(ex)}
                className="rounded-full border border-nc-border px-3 py-1.5 text-xs text-nc-text-tertiary shadow-sm transition-all hover:border-nc-border-strong hover:text-nc-text-secondary hover:shadow-md"
              >
                {t("home.quick.example")} {i + 1}
              </button>
            ))}
          </div>

          <button
            onClick={handleQuickGenerate}
            disabled={!localPrompt.trim() || isRunning}
            className={cn(
              "mt-auto flex h-11 items-center justify-center gap-2 rounded-lg text-base font-semibold transition-all",
              localPrompt.trim() && !isRunning
                ? "bg-nc-accent text-nc-bg shadow-md shadow-nc-accent/20 hover:bg-nc-accent-hover hover:shadow-lg"
                : "bg-nc-panel text-nc-text-tertiary cursor-not-allowed"
            )}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,0 12,6 2,12" /></svg>
            {isRunning ? t("home.quick.processing") : t("home.quick.generate")}
          </button>
        </div>

        {/* Precise Path */}
        <div className="flex flex-1 flex-col rounded-[var(--radius-lg)] border border-nc-border-strong bg-nc-surface p-5 shadow-md transition-all hover:-translate-y-0.5 hover:border-nc-info/30 hover:shadow-xl hover:shadow-black/15">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nc-info/10">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-nc-info">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="M5 6h6M5 8h4M5 10h5" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-nc-text">{t("home.precise.title")}</h2>
              <p className="text-sm text-nc-text-tertiary">{t("home.precise.subtitle")}</p>
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
            className="mt-auto flex h-11 items-center justify-center gap-2 rounded-lg border border-nc-info/35 bg-nc-info/10 text-base font-semibold text-nc-info shadow-sm transition-all hover:bg-nc-info/20 hover:shadow-md"
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
          <h3 className="text-sm font-semibold text-nc-text">{t("home.templates.title")}</h3>
          <button
            onClick={() => setSidebarPage("templates")}
            className="text-sm font-medium text-nc-accent shadow-sm transition-all hover:text-nc-accent-hover hover:underline"
          >
            {t("home.templates.viewAll")}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {BUILTIN_TEMPLATES.slice(0, 6).map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => applyTemplate(tmpl.id)}
              className="group rounded-[var(--radius-lg)] border border-nc-border-strong bg-nc-surface p-4 text-left shadow-sm transition-all hover:border-nc-accent/30 hover:shadow-lg"
            >
              <div className="mb-1.5 text-sm font-semibold text-nc-text">{tmpl.nameZh}</div>
              <div className="mb-1 text-xs text-nc-text-tertiary">{tmpl.name}</div>
              <div className="flex items-center gap-2 text-[10px] text-nc-text-tertiary">
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
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-nc-accent">
          <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor">
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
    <div className="flex items-center gap-2.5 rounded-lg border border-nc-border bg-nc-panel px-3 py-2.5 shadow-sm">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nc-info/10 text-xs font-bold text-nc-info">
        {number}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-nc-text">{title}</div>
        <div className="truncate text-xs text-nc-text-tertiary">{desc}</div>
      </div>
    </div>
  );
}

function TipCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-nc-accent/25 bg-nc-accent-muted p-4 shadow-sm">
      <div className="mb-1 text-sm font-semibold text-nc-text">{title}</div>
      <p className="text-xs leading-relaxed text-nc-text-tertiary">{desc}</p>
    </div>
  );
}
