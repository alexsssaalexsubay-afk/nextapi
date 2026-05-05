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
    <div className="flex h-full flex-col overflow-auto p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-nc-text-secondary">Pipeline</span>
        {isRunning ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-nc-accent">
            <span className="inline-block h-[5px] w-[5px] rounded-full bg-nc-accent animate-pulse" />
            Running
          </span>
        ) : totalAgents > 0 ? (
          <span className="text-xs text-nc-text-tertiary">
            {completedAgents}/{totalAgents} agents done
          </span>
        ) : null}
      </div>

      {/* Overall progress bar */}
      {totalAgents > 0 && (
        <div className="mb-4">
          <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-nc-panel">
            <div
              className="h-full rounded-full bg-nc-accent transition-all duration-500 ease-out"
              style={{ width: `${(completedAgents / totalAgents) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-nc-text-tertiary">
            <span>{Math.round((completedAgents / totalAgents) * 100)}%</span>
            {shots.length > 0 && <span>{shots.length} shots planned</span>}
          </div>
        </div>
      )}

      {/* Agent team cards (always visible) */}
      <AgentCards />

      <div className="my-2 h-px bg-nc-border" />

      {/* Agent progress log */}
      {agentProgress.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-sm text-nc-text-tertiary">Run a director plan to see agent activity.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {agentProgress.map((p) => {
            const meta = AGENT_LABELS[p.agent] || { label: p.agent, icon: "?" };
            const isDone = p.status === "complete";
            const isActive = p.status === "running" || p.status === "progress";

            return (
              <div
                key={p.agent}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 shadow-sm transition-all hover:border-nc-border hover:shadow-md",
                  isActive ? "border-nc-accent/20 bg-nc-accent-muted" : isDone ? "border-nc-border/50 bg-nc-surface" : "bg-transparent"
                )}
              >
                {/* Agent icon */}
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  isDone ? "bg-nc-success/15 text-nc-success" :
                  isActive ? "bg-nc-accent/15 text-nc-accent" :
                  "bg-nc-panel text-nc-text-tertiary"
                )}>
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 5l2.5 2.5L8 3" />
                    </svg>
                  ) : isActive ? (
                    <div className="h-2.5 w-2.5 animate-[spin_1.5s_linear_infinite] rounded-full border-[1.5px] border-nc-accent/40 border-t-nc-accent" />
                  ) : (
                    meta.icon
                  )}
                </div>

                {/* Label */}
                <span className={cn(
                  "flex-1 text-sm font-medium",
                  isDone ? "text-nc-text-secondary" :
                  isActive ? "text-nc-accent" :
                  "text-nc-text-tertiary"
                )}>
                  {meta.label}
                </span>

                {/* Progress */}
                <div className="flex items-center gap-2">
                  <div className="h-[3px] w-12 overflow-hidden rounded-full bg-nc-panel">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isDone ? "bg-nc-success" : isActive ? "bg-nc-accent" : "bg-nc-text-tertiary/25"
                      )}
                      style={{ width: `${Math.round(p.progress * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-xs tabular-nums text-nc-text-tertiary">
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
        <div className="mt-4 rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-4 shadow-sm hover:shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-nc-text-secondary">
              Quality Report
            </span>
            <span className={cn(
              "rounded-full border border-nc-border/50 px-3 py-1 text-xs font-bold shadow-sm",
              overallQuality.overall >= 0.8 ? "bg-nc-success/15 text-nc-success" :
              overallQuality.overall >= 0.5 ? "bg-nc-warning/15 text-nc-warning" :
              "bg-nc-error/15 text-nc-error"
            )}>
              {(overallQuality.overall * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <QualityMetric label="Character Consistency" value={overallQuality.characterConsistency} />
            <QualityMetric label="Prompt Quality" value={overallQuality.promptQuality} />
            <QualityMetric label="Style Coherence" value={overallQuality.styleCoherence} />
          </div>
        </div>
      )}

      {/* Pipeline step hint */}
      {pipelineStep === "storyboard_review" && !isRunning && (
        <div className="mt-3 rounded-lg border border-nc-accent/30 bg-nc-accent-muted p-4 shadow-sm">
          <div className="mb-1 text-sm font-semibold text-nc-accent">Ready for review</div>
          <p className="text-xs leading-relaxed text-nc-text-secondary">
            Switch to the Storyboard view to review, reorder, and edit shots before generating video.
          </p>
        </div>
      )}
    </div>
  );
}

function QualityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 text-xs text-nc-text-tertiary">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nc-panel">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value >= 0.8 ? "bg-nc-success" : value >= 0.5 ? "bg-nc-warning" : "bg-nc-error"
          )}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs tabular-nums text-nc-text-tertiary">
        {(value * 100).toFixed(0)}
      </span>
    </div>
  );
}
