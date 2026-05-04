import { memo } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore, type PipelineStep } from "@/stores/director-store";

const STEPS: { id: PipelineStep; label: string; labelZh: string; desc: string }[] = [
  { id: "planning", label: "Script", labelZh: "脚本", desc: "AI writes the screenplay" },
  { id: "script_review", label: "Review Script", labelZh: "审核脚本", desc: "Edit scenes & characters" },
  { id: "storyboard_review", label: "Storyboard", labelZh: "分镜", desc: "Arrange & refine shots" },
  { id: "prompt_review", label: "Prompts", labelZh: "提示词", desc: "Fine-tune each shot" },
  { id: "generating", label: "Generate", labelZh: "生成", desc: "Render with Seedance" },
  { id: "quality_review", label: "Quality", labelZh: "质检", desc: "Review & score results" },
];

function stepIndex(step: PipelineStep): number {
  const idx = STEPS.findIndex((s) => s.id === step);
  return idx >= 0 ? idx : -1;
}

export const PipelineStepFlow = memo(function PipelineStepFlow() {
  const { pipelineStep, isRunning } = useDirectorStore();

  const currentIdx = stepIndex(pipelineStep);

  if (pipelineStep === "idle" || pipelineStep === "complete") return null;

  return (
    <div className="flex items-center gap-1 px-4 py-2">
      {STEPS.map((step, i) => {
        const isActive = step.id === pipelineStep;
        const isDone = i < currentIdx;

        return (
          <div key={step.id} className="flex items-center gap-1">
            {i > 0 && (
              <div className={cn(
                "h-px w-4 transition-colors",
                isDone ? "bg-nc-success" : isActive ? "bg-nc-accent" : "bg-nc-border"
              )} />
            )}
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold transition-all",
                isDone ? "bg-nc-success/20 text-nc-success" :
                isActive ? "bg-nc-accent/20 text-nc-accent ring-2 ring-nc-accent/20" :
                "bg-nc-panel text-nc-text-ghost"
              )}>
                {isDone ? (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M1.5 4l2 2L6.5 2" />
                  </svg>
                ) : isActive && isRunning ? (
                  <div className="h-2 w-2 animate-[spin_1.5s_linear_infinite] rounded-full border border-nc-accent border-t-transparent" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <div className="hidden sm:block">
                <div className={cn(
                  "text-[9px] font-medium leading-none",
                  isDone ? "text-nc-success" :
                  isActive ? "text-nc-accent" :
                  "text-nc-text-ghost"
                )}>
                  {step.label}
                </div>
                {isActive && (
                  <div className="mt-0.5 text-[7px] text-nc-text-ghost">{step.desc}</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export const ScriptReviewPanel = memo(function ScriptReviewPanel() {
  const { sceneOutlines, updateSceneOutline, setPipelineStep } = useDirectorStore();

  if (sceneOutlines.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-[11px] text-nc-text-ghost">
        Waiting for script generation...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-semibold text-nc-text">Review Script</h3>
          <p className="text-[10px] text-nc-text-ghost">Edit scenes before generating the storyboard. Changes here affect all downstream shots.</p>
        </div>
        <button
          onClick={() => setPipelineStep("storyboard_review")}
          className="rounded-[var(--radius-md)] bg-nc-accent px-4 py-1.5 text-[11px] font-semibold text-nc-bg hover:bg-nc-accent-hover"
        >
          Approve & Continue
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {sceneOutlines.map((scene, i) => (
          <div key={scene.id} className="rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-nc-accent/10 text-[9px] font-bold text-nc-accent">
                {i + 1}
              </span>
              <input
                value={scene.title}
                onChange={(e) => updateSceneOutline(scene.id, { title: e.target.value })}
                className="flex-1 bg-transparent text-[12px] font-medium text-nc-text outline-none"
                placeholder="Scene title"
              />
            </div>
            <textarea
              value={scene.description}
              onChange={(e) => updateSceneOutline(scene.id, { description: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-[var(--radius-md)] border border-nc-border bg-nc-panel px-3 py-2 text-[11px] leading-relaxed text-nc-text outline-none focus:border-nc-accent/30"
              placeholder="Scene description — what happens, who's involved, setting, mood..."
            />
            {scene.characters.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {scene.characters.map((c) => (
                  <span key={c} className="rounded-full bg-nc-panel-active px-2 py-0.5 text-[8px] text-nc-text-tertiary">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
