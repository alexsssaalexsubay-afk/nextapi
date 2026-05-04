import { memo, useState } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore, type SeedanceWorkflow } from "@/stores/director-store";
import { useAppStore } from "@/stores/app-store";
import { useDirector } from "@/hooks/useDirector";

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
    icon: <span className="text-[18px]">📖</span>,
    workflow: "multimodal_story",
    defaultShots: 6,
    defaultDuration: 5,
  },
  {
    id: "product",
    label: "Showcase a Product",
    labelZh: "产品展示",
    desc: "Product reveal, unboxing, or advertisement",
    icon: <span className="text-[18px]">🎁</span>,
    workflow: "image_to_video",
    defaultShots: 3,
    defaultDuration: 5,
  },
  {
    id: "music",
    label: "Music Video",
    labelZh: "音乐 MV",
    desc: "Visual accompaniment to a song or beat",
    icon: <span className="text-[18px]">🎵</span>,
    workflow: "multimodal_story",
    defaultShots: 8,
    defaultDuration: 5,
  },
  {
    id: "concept",
    label: "Quick Concept",
    labelZh: "快速创意",
    desc: "Rapidly explore a visual idea or mood",
    icon: <span className="text-[18px]">💡</span>,
    workflow: "text_to_video",
    defaultShots: 4,
    defaultDuration: 5,
  },
  {
    id: "social",
    label: "Social Media Clip",
    labelZh: "社交媒体短视频",
    desc: "Vertical or square content for TikTok, Reels, Shorts",
    icon: <span className="text-[18px]">📱</span>,
    workflow: "text_to_video",
    defaultShots: 4,
    defaultDuration: 5,
  },
  {
    id: "trailer",
    label: "Cinematic Trailer",
    labelZh: "电影预告",
    desc: "Epic trailer with dramatic arc and tension",
    icon: <span className="text-[18px]">🎬</span>,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-nc-border bg-nc-bg p-6 shadow-2xl shadow-black/30">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full text-nc-text-ghost transition-colors hover:bg-nc-panel-hover hover:text-nc-text"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {(["goal", "content", "style", "confirm"] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={cn("h-px w-6", step === s || (["goal", "content", "style", "confirm"].indexOf(step) > i) ? "bg-nc-accent" : "bg-nc-border")} />}
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold transition-all",
                step === s ? "bg-nc-accent text-nc-bg ring-2 ring-nc-accent/20" :
                (["goal", "content", "style", "confirm"].indexOf(step) > i) ? "bg-nc-success/20 text-nc-success" :
                "bg-nc-panel text-nc-text-ghost"
              )}>
                {(["goal", "content", "style", "confirm"].indexOf(step) > i) ? "✓" : i + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Step: Goal */}
        {step === "goal" && (
          <div>
            <h2 className="mb-1 text-center text-[18px] font-bold text-nc-text">What do you want to create?</h2>
            <p className="mb-5 text-center text-[12px] text-nc-text-ghost">Pick a goal and we&apos;ll set everything up for you</p>
            <div className="grid grid-cols-3 gap-2.5">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGoal(g.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all",
                    selectedGoal === g.id
                      ? "border-nc-accent/40 bg-nc-accent-dim shadow-md shadow-nc-accent/10"
                      : "border-nc-border hover:border-nc-border-strong hover:shadow-sm"
                  )}
                >
                  {g.icon}
                  <div className="text-[11px] font-semibold text-nc-text">{g.label}</div>
                  <div className="text-[9px] text-nc-text-ghost">{g.labelZh}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Content */}
        {step === "content" && (
          <div>
            <h2 className="mb-1 text-center text-[18px] font-bold text-nc-text">Describe your idea</h2>
            <p className="mb-5 text-center text-[12px] text-nc-text-ghost">
              Write in any language. Be as brief or detailed as you like — our AI screenwriter will expand it.
            </p>
            <textarea
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder={
                goal?.id === "product" ? "Describe your product and the vibe you want. e.g. 'A sleek matte-black wireless earbuds case slowly opens to reveal glowing LED inside. Premium, minimal, Apple-style.'"
                : goal?.id === "story" ? "What's your story? e.g. 'A detective in 1940s Shanghai discovers a mysterious letter that leads her through rain-soaked alleys to confront her past.'"
                : goal?.id === "music" ? "Describe the visual mood. e.g. 'Abstract neon shapes pulse to the beat. A silhouette dances in slow motion against shifting color gradients.'"
                : "Describe what you want to see. The more specific, the better."
              }
              rows={5}
              className="w-full resize-none rounded-xl border border-nc-border bg-nc-panel px-4 py-3 text-[13px] leading-relaxed text-nc-text outline-none placeholder:text-nc-text-ghost/50 focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between text-[9px] text-nc-text-ghost">
              <span>{ideaText.trim().split(/\s+/).filter(Boolean).length} words</span>
              <span>Any language OK — we&apos;ll translate to optimal English for Seedance</span>
            </div>
          </div>
        )}

        {/* Step: Style */}
        {step === "style" && (
          <div>
            <h2 className="mb-1 text-center text-[18px] font-bold text-nc-text">Choose a look</h2>
            <p className="mb-5 text-center text-[12px] text-nc-text-ghost">Pick a visual style and format</p>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {STYLE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStyle(s.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border py-3 transition-all",
                    selectedStyle === s.id
                      ? "border-nc-accent/40 bg-nc-accent-dim"
                      : "border-nc-border hover:border-nc-border-strong"
                  )}
                >
                  <span className="text-[16px]">{s.emoji}</span>
                  <span className="text-[10px] font-medium text-nc-text">{s.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-nc-text-tertiary">Format:</span>
              {[
                { id: "16:9", label: "Landscape" },
                { id: "9:16", label: "Portrait" },
                { id: "1:1", label: "Square" },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRatio(r.id)}
                  className={cn(
                    "rounded-[var(--radius-md)] border px-3 py-1.5 text-[10px] font-medium transition-all",
                    ratio === r.id
                      ? "border-nc-accent/40 bg-nc-accent-dim text-nc-accent"
                      : "border-nc-border text-nc-text-tertiary hover:border-nc-border-strong"
                  )}
                >
                  {r.id} {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && goal && (
          <div>
            <h2 className="mb-1 text-center text-[18px] font-bold text-nc-text">Ready to create!</h2>
            <p className="mb-5 text-center text-[12px] text-nc-text-ghost">Review your settings and hit generate</p>
            <div className="space-y-2 rounded-xl border border-nc-border bg-nc-surface p-4">
              <ConfirmRow label="Goal" value={goal.label} />
              <ConfirmRow label="Style" value={selectedStyle} />
              <ConfirmRow label="Format" value={ratio} />
              <ConfirmRow label="Shots" value={String(goal.defaultShots)} />
              <ConfirmRow label="Duration/shot" value={`${goal.defaultDuration}s`} />
              <ConfirmRow label="Workflow" value={goal.workflow.replace(/_/g, " ")} />
              <div className="border-t border-nc-border pt-2">
                <div className="text-[9px] font-medium text-nc-text-ghost">Your idea:</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-nc-text-secondary">
                  {ideaText.length > 200 ? ideaText.slice(0, 200) + "..." : ideaText}
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-[var(--radius-md)] border border-nc-accent/10 bg-nc-accent-muted px-3 py-2 text-[9px] leading-relaxed text-nc-text-ghost">
              Our AI agents will: write a screenplay → extract characters → create storyboard → refine camera angles → optimize prompts → check consistency. You can edit at each step.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={step === "goal" ? onClose : handleBack}
            className="rounded-[var(--radius-md)] px-4 py-2 text-[12px] text-nc-text-ghost transition-colors hover:text-nc-text-tertiary"
          >
            {step === "goal" ? "Cancel" : "Back"}
          </button>

          {step === "confirm" ? (
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 rounded-xl bg-nc-accent px-6 py-2.5 text-[13px] font-bold text-nc-bg shadow-lg shadow-nc-accent/20 transition-all hover:bg-nc-accent-hover hover:shadow-xl"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="3,1 13,7 3,13" /></svg>
              Generate Video
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={(step === "goal" && !selectedGoal) || (step === "content" && !ideaText.trim())}
              className={cn(
                "rounded-xl px-6 py-2.5 text-[13px] font-semibold transition-all",
                ((step === "goal" && selectedGoal) || (step === "content" && ideaText.trim()) || step === "style")
                  ? "bg-nc-accent text-nc-bg hover:bg-nc-accent-hover"
                  : "bg-nc-panel text-nc-text-ghost cursor-not-allowed"
              )}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-nc-text-ghost">{label}</span>
      <span className="font-medium capitalize text-nc-text-secondary">{value}</span>
    </div>
  );
}
