import { memo, useState } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore, type SeedanceWorkflow } from "@/stores/director-store";
import { useAppStore } from "@/stores/app-store";
import { useDirector } from "@/hooks/useDirector";
import { useI18nStore } from "@/stores/i18n-store";

type WizardStep = "goal" | "content" | "style" | "confirm";

interface GoalOption {
  id: string;
  label: string;
  labelZh: string;
  desc: string;
  icon: React.ReactNode;
  workflow: SeedanceWorkflow;
  defaultShots: number;
  defaultDuration: number;
}

const GOALS: GoalOption[] = [
  {
    id: "story",
    label: "Tell a Story",
    labelZh: "讲一个故事",
    desc: "A short narrative with characters and plot",
    icon: <span className="text-xl">📖</span>,
    workflow: "multimodal_story",
    defaultShots: 6,
    defaultDuration: 5,
  },
  {
    id: "product",
    label: "Showcase a Product",
    labelZh: "产品展示",
    desc: "Product reveal, unboxing, or advertisement",
    icon: <span className="text-xl">🎁</span>,
    workflow: "image_to_video",
    defaultShots: 3,
    defaultDuration: 5,
  },
  {
    id: "music",
    label: "Music Video",
    labelZh: "音乐 MV",
    desc: "Visual accompaniment to a song or beat",
    icon: <span className="text-xl">🎵</span>,
    workflow: "multimodal_story",
    defaultShots: 8,
    defaultDuration: 5,
  },
  {
    id: "concept",
    label: "Quick Concept",
    labelZh: "快速创意",
    desc: "Rapidly explore a visual idea or mood",
    icon: <span className="text-xl">💡</span>,
    workflow: "text_to_video",
    defaultShots: 4,
    defaultDuration: 5,
  },
  {
    id: "social",
    label: "Social Media Clip",
    labelZh: "社交媒体短视频",
    desc: "Vertical or square content for TikTok, Reels, Shorts",
    icon: <span className="text-xl">📱</span>,
    workflow: "text_to_video",
    defaultShots: 4,
    defaultDuration: 5,
  },
  {
    id: "trailer",
    label: "Cinematic Trailer",
    labelZh: "电影预告",
    desc: "Epic trailer with dramatic arc and tension",
    icon: <span className="text-xl">🎬</span>,
    workflow: "multimodal_story",
    defaultShots: 12,
    defaultDuration: 5,
  },
];

const STYLE_OPTIONS = [
  { id: "cinematic", label: "Cinematic", emoji: "🎬" },
  { id: "anime", label: "Anime", emoji: "🎨" },
  { id: "documentary", label: "Documentary", emoji: "📹" },
  { id: "commercial", label: "Commercial", emoji: "📺" },
  { id: "dreamy", label: "Dreamy", emoji: "☁️" },
  { id: "noir", label: "Film Noir", emoji: "🌑" },
  { id: "cyberpunk", label: "Cyberpunk", emoji: "🌃" },
  { id: "vintage", label: "Vintage", emoji: "📼" },
];

export const GuidedWizard = memo(function GuidedWizard({
  onClose,
}: {
  onClose: () => void;
}) {
  const {
    setPrompt, setSelectedWorkflow, setStyle, setNumShots, setDuration, setAspectRatio,
  } = useDirectorStore();
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const { runPipeline } = useDirector();
  const { t, lang } = useI18nStore();

  const [step, setStep] = useState<WizardStep>("goal");
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [ideaText, setIdeaText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [ratio, setRatio] = useState("16:9");

  const goal = GOALS.find((g) => g.id === selectedGoal);

  const handleNext = () => {
    if (step === "goal" && selectedGoal) setStep("content");
    else if (step === "content" && ideaText.trim()) setStep("style");
    else if (step === "style") setStep("confirm");
  };

  const handleBack = () => {
    if (step === "content") setStep("goal");
    else if (step === "style") setStep("content");
    else if (step === "confirm") setStep("style");
  };

  const handleGenerate = async () => {
    if (!goal) return;
    setPrompt(ideaText);
    setSelectedWorkflow(goal.workflow);
    setStyle(selectedStyle);
    setNumShots(goal.defaultShots);
    setDuration(goal.defaultDuration);
    setAspectRatio(ratio);
    onClose();
    setSidebarPage("agents");
    await runPipeline();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nc-text/20 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-[640px] rounded-2xl border border-nc-border bg-nc-surface p-8 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-nc-text-tertiary transition-colors hover:bg-nc-panel hover:text-nc-text"
        >
          <svg width="12" height="12" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>

        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-3">
          {(["goal", "content", "style", "confirm"] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              {i > 0 && <div className={cn("h-px w-8 transition-colors duration-300", step === s || (["goal", "content", "style", "confirm"].indexOf(step) > i) ? "bg-nc-text" : "bg-nc-border-strong")} />}
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition-all duration-300",
                step === s ? "bg-nc-text text-nc-surface shadow-sm" :
                (["goal", "content", "style", "confirm"].indexOf(step) > i) ? "bg-nc-success text-white" :
                "bg-nc-panel text-nc-text-tertiary border border-nc-border"
              )}>
                {(["goal", "content", "style", "confirm"].indexOf(step) > i) ? (
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5l2 2 4-4" /></svg>
                ) : i + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Step: Goal */}
        {step === "goal" && (
          <div className="animate-fade-in">
            <h2 className="mb-2 text-center text-xl font-bold text-nc-text">{t("wizard.step1Title")}</h2>
            <p className="mb-8 text-center text-[14px] text-nc-text-secondary">{t("wizard.step1Desc")}</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGoal(g.id)}
                  className={cn(
                    "flex flex-col items-center gap-3 rounded-xl border p-5 text-center transition-all duration-200",
                    selectedGoal === g.id
                      ? "border-nc-text bg-nc-surface shadow-sm ring-1 ring-nc-text/20 scale-[1.02]"
                      : "border-nc-border bg-nc-bg hover:border-nc-border-strong hover:bg-nc-surface hover:shadow-sm"
                  )}
                >
                  <div className="text-3xl mb-1">{g.icon}</div>
                  <div>
                    <div className="text-[14px] font-bold text-nc-text leading-tight">{lang === "zh" ? g.labelZh : g.label}</div>
                    <div className="text-[12px] font-medium text-nc-text-tertiary mt-1">{lang === "zh" ? g.label : g.labelZh}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Content */}
        {step === "content" && (
          <div className="animate-fade-in">
            <h2 className="mb-2 text-center text-xl font-bold text-nc-text">{t("wizard.step2Title")}</h2>
            <p className="mb-8 text-center text-[14px] text-nc-text-secondary">
              {t("wizard.step2Desc")}
            </p>
            <div className="relative">
              <textarea
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder={
                  goal?.id === "product" ? "Describe your product and the vibe you want. e.g. 'A sleek matte-black wireless earbuds case slowly opens to reveal glowing LED inside. Premium, minimal, Apple-style.'"
                  : goal?.id === "story" ? "What's your story? e.g. 'A detective in 1940s Shanghai discovers a mysterious letter that leads her through rain-soaked alleys to confront her past.'"
                  : goal?.id === "music" ? "Describe the visual mood. e.g. 'Abstract neon shapes pulse to the beat. A silhouette dances in slow motion against shifting color gradients.'"
                  : "Describe what you want to see. The more specific, the better."
                }
                rows={6}
                className="w-full resize-none rounded-xl border border-nc-border bg-nc-bg p-5 text-[15px] leading-relaxed text-nc-text outline-none placeholder:text-nc-text-tertiary/60 focus:border-nc-text focus:ring-2 focus:ring-nc-text/10 transition-shadow"
                autoFocus
              />
              <div className="absolute bottom-4 right-4 flex items-center justify-between text-[12px] font-medium text-nc-text-tertiary bg-nc-bg/90 px-2 py-1 rounded backdrop-blur">
                <span>{ideaText.trim().split(/\s+/).filter(Boolean).length} {t("wizard.words")}</span>
              </div>
            </div>
            <div className="mt-3 text-center text-[13px] text-nc-text-tertiary">
              {t("wizard.anyLang")}
            </div>
          </div>
        )}

        {/* Step: Style */}
        {step === "style" && (
          <div className="animate-fade-in">
            <h2 className="mb-2 text-center text-xl font-bold text-nc-text">{t("wizard.step3Title")}</h2>
            <p className="mb-8 text-center text-[14px] text-nc-text-secondary">{t("wizard.step3Desc")}</p>
            
            <div className="mb-8">
              <label className="mb-3 block text-[13px] font-bold text-nc-text-secondary">VISUAL STYLE</label>
              <div className="grid grid-cols-4 gap-3">
                {STYLE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStyle(s.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border py-4 transition-all duration-200",
                      selectedStyle === s.id
                        ? "border-nc-text bg-nc-surface shadow-sm ring-1 ring-nc-text/20 scale-[1.02]"
                        : "border-nc-border bg-nc-bg hover:border-nc-border-strong hover:bg-nc-surface hover:shadow-sm"
                    )}
                  >
                    <span className="text-2xl">{s.emoji}</span>
                    <span className="text-[13px] font-semibold text-nc-text">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-3 block text-[13px] font-bold text-nc-text-secondary">{t("wizard.format").toUpperCase()}</label>
              <div className="flex gap-3">
                {[
                  { id: "16:9", label: "Landscape" },
                  { id: "9:16", label: "Portrait" },
                  { id: "1:1", label: "Square" },
                ].map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRatio(r.id)}
                    className={cn(
                      "flex-1 rounded-xl border py-3 text-[14px] font-semibold transition-all duration-200",
                      ratio === r.id
                        ? "border-nc-text bg-nc-surface text-nc-text shadow-sm ring-1 ring-nc-text/20"
                        : "border-nc-border bg-nc-bg text-nc-text-secondary hover:border-nc-border-strong hover:bg-nc-surface hover:text-nc-text"
                    )}
                  >
                    {r.id} <span className="text-nc-text-tertiary ml-1 font-normal">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && goal && (
          <div className="animate-fade-in">
            <h2 className="mb-2 text-center text-xl font-bold text-nc-text">{t("wizard.step4Title")}</h2>
            <p className="mb-8 text-center text-[14px] text-nc-text-secondary">{t("wizard.step4Desc")}</p>
            
            <div className="space-y-4 rounded-2xl border border-nc-border bg-nc-bg p-6">
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 border-b border-nc-border pb-6">
                <ConfirmRow label={t("wizard.goal")} value={lang === "zh" ? goal.labelZh : goal.label} />
                <ConfirmRow label={t("wizard.style")} value={selectedStyle} />
                <ConfirmRow label={t("wizard.formatVal")} value={ratio} />
                <ConfirmRow label={t("wizard.shots")} value={String(goal.defaultShots)} />
                <ConfirmRow label={t("wizard.duration")} value={`${goal.defaultDuration}s`} />
                <ConfirmRow label={t("wizard.workflow")} value={goal.workflow.replace(/_/g, " ")} />
              </div>
              <div className="pt-2">
                <div className="text-[13px] font-bold text-nc-text-secondary mb-2">{t("wizard.yourIdea")}</div>
                <p className="text-[14px] leading-relaxed text-nc-text bg-nc-surface p-4 rounded-xl border border-nc-border">
                  {ideaText}
                </p>
              </div>
            </div>
            
            <div className="mt-4 rounded-xl border border-nc-border bg-nc-surface px-5 py-4 text-[13px] leading-relaxed text-nc-text-secondary flex items-start gap-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-nc-text shrink-0 mt-0.5">
                <path d="M10 2v16M2 10h16" opacity="0.3" />
                <circle cx="10" cy="10" r="4" />
              </svg>
              {t("wizard.agentSteps")}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex items-center justify-between border-t border-nc-border pt-6">
          <button
            onClick={step === "goal" ? onClose : handleBack}
            className="rounded-xl px-6 py-3 text-[14px] font-semibold text-nc-text-secondary transition-colors hover:text-nc-text hover:bg-nc-panel"
          >
            {step === "goal" ? t("wizard.cancel") : t("wizard.back")}
          </button>

          {step === "confirm" ? (
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2.5 rounded-xl bg-nc-text px-8 py-3 text-[14px] font-bold text-nc-surface transition-all hover:bg-nc-text-secondary hover:-translate-y-0.5 shadow-lg shadow-nc-text/20"
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor"><polygon points="3,1 13,7 3,13" /></svg>
              {t("wizard.generate")}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={(step === "goal" && !selectedGoal) || (step === "content" && !ideaText.trim())}
              className={cn(
                "rounded-xl px-8 py-3 text-[14px] font-bold transition-all duration-200",
                ((step === "goal" && selectedGoal) || (step === "content" && ideaText.trim()) || step === "style")
                  ? "bg-nc-text text-nc-surface shadow-md hover:bg-nc-text-secondary hover:-translate-y-0.5"
                  : "bg-nc-panel text-nc-text-tertiary cursor-not-allowed"
              )}
            >
              {t("wizard.next")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-bold uppercase tracking-wider text-nc-text-tertiary">{label}</span>
      <span className="text-[15px] font-semibold capitalize text-nc-text">{value}</span>
    </div>
  );
}