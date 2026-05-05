import { cn } from "@/lib/cn";
import { useDirectorStore } from "@/stores/director-store";
import { AgentCards } from "@/components/director/AgentCards";

const AGENT_LABELS: Record<string, { label: string; icon: string }> = {
  screenwriter: { label: "Screenwriter", icon: "S" },
  character_extractor: { label: "Characters", icon: "C" },
  storyboard_artist: { label: "Storyboard", icon: "B" },
  cinematographer: { label: "Camera", icon: "D" },
  audio_director: { label: "Audio", icon: "A" },
  editing_agent: { label: "Editing", icon: "E" },
  prompt_optimizer: { label: "Optimizer", icon: "O" },
  consistency_checker: { label: "Checker", icon: "K" },
  pipeline: { label: "Pipeline", icon: "P" },
};

export function AgentLogPanel() {
  const { agentProgress, isRunning, shots, overallQuality, pipelineStep } = useDirectorStore();

  const completedAgents = agentProgress.filter((p) => p.status === "complete").length;
  const totalAgents = agentProgress.length;

  return (
    <div className="flex h-full flex-col overflow-auto p-6 bg-nc-surface">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <span className="text-[16px] font-semibold text-nc-text">Pipeline Status</span>
        {isRunning ? (
          <span className="flex items-center gap-2 text-[14px] font-semibold text-nc-accent">
            <span className="inline-block h-2 w-2 rounded-full bg-nc-accent animate-[glow-pulse_2s_ease-in-out_infinite]" />
            Running
          </span>
        ) : totalAgents > 0 ? (
          <span className="text-[14px] font-medium text-nc-text-tertiary">
            {completedAgents}/{totalAgents} agents done
          </span>
        ) : null}
      </div>

      {/* Overall progress bar */}
      {totalAgents > 0 && (
        <div className="mb-6">
          <div className="mb-2 h-1 overflow-hidden rounded-[999px] bg-nc-border">
            <div
              className="h-full rounded-[999px] bg-nc-accent transition-all duration-500 ease-out"
              style={{ width: `${(completedAgents / totalAgents) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[13px] font-medium text-nc-text-tertiary">
            <span>{Math.round((completedAgents / totalAgents) * 100)}%</span>
            {shots.length > 0 && <span>{shots.length} shots planned</span>}
          </div>
        </div>
      )}

      {/* Agent team cards (always visible) */}
      <div className="mb-6">
        <AgentCards />
      </div>

      <div className="mb-6 h-px w-full bg-nc-border" />

      {/* Agent progress log */}
      {agentProgress.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-[14px] text-nc-text-tertiary font-medium">Run a director plan to see agent activity.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {agentProgress.map((p) => {
            const meta = AGENT_LABELS[p.agent] || { label: p.agent, icon: "?" };
            const isDone = p.status === "complete";
            const isActive = p.status === "running" || p.status === "progress";

            return (
              <div
                key={p.agent}
                className={cn(
                  "flex items-center gap-4 rounded-[14px] border px-4 py-3 transition-colors",
                  isActive ? "border-nc-accent shadow-sm bg-nc-bg" : isDone ? "border-nc-border bg-nc-surface" : "border-transparent bg-transparent"
                )}
              >
                {/* Agent icon */}
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold",
                  isDone ? "bg-nc-bg text-nc-text-secondary border border-nc-border" :
                  isActive ? "bg-nc-accent text-white shadow-sm" :
                  "bg-nc-panel text-nc-text-tertiary"
                )}>
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 5l2.5 2.5L8 3" />
                    </svg>
                  ) : isActive ? (
                    <div className="h-3 w-3 animate-[spin_1s_linear_infinite] rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    meta.icon
                  )}
                </div>

                {/* Label */}
                <span className={cn(
                  "flex-1 text-[14px]",
                  isDone ? "text-nc-text-secondary font-medium" :
                  isActive ? "text-nc-text font-semibold" :
                  "text-nc-text-tertiary font-medium"
                )}>
                  {meta.label}
                </span>

                {/* Progress */}
                <div className="flex items-center gap-3">
                  <div className="h-1 w-12 overflow-hidden rounded-[999px] bg-nc-border">
                    <div
                      className={cn(
                        "h-full rounded-[999px] transition-all duration-500",
                        isDone ? "bg-nc-success" : isActive ? "bg-nc-accent" : "bg-transparent"
                      )}
                      style={{ width: `${Math.round(p.progress * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[12px] font-medium tabular-nums text-nc-text-secondary">
                    {Math.round(p.progress * 100)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quality Score Card */}
      {overallQuality && !isRunning && (
        <div className="mt-6 rounded-[14px] border border-nc-border bg-nc-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-nc-text">
              Quality Report
            </span>
            <span className={cn(
              "rounded-[999px] border px-2 py-0.5 text-[12px] font-medium shadow-sm",
              overallQuality.overall >= 0.8 ? "border-nc-success/30 bg-nc-success/10 text-nc-success" :
              overallQuality.overall >= 0.5 ? "border-nc-warning/30 bg-nc-warning/10 text-nc-warning" :
              "border-nc-error/30 bg-nc-error/10 text-nc-error"
            )}>
              {(overallQuality.overall * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <QualityMetric label="Character Consistency" value={overallQuality.characterConsistency} />
            <QualityMetric label="Prompt Quality" value={overallQuality.promptQuality} />
            <QualityMetric label="Style Coherence" value={overallQuality.styleCoherence} />
          </div>
        </div>
      )}

      {/* Pipeline step hint */}
      {pipelineStep === "storyboard_review" && !isRunning && (
        <div className="mt-6 rounded-[14px] border border-nc-accent bg-nc-surface p-4 shadow-sm">
          <div className="mb-2 text-[14px] font-semibold text-nc-text">Ready for review</div>
          <p className="text-[13px] leading-[20px] text-nc-text-secondary font-medium">
            Switch to the Storyboard view to review, reorder, and edit shots before generating video.
          </p>
        </div>
      )}
    </div>
  );
}

function QualityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-[13px] font-medium text-nc-text-secondary">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nc-border">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value >= 0.8 ? "bg-nc-success" : value >= 0.5 ? "bg-nc-warning" : "bg-nc-error"
          )}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[12px] font-medium tabular-nums text-nc-text-secondary">
        {(value * 100).toFixed(0)}
      </span>
    </div>
  );
}
