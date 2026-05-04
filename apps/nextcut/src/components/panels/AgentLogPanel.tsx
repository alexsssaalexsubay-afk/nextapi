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
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">Pipeline</span>
        {isRunning ? (
          <span className="flex items-center gap-1.5 text-[10px] text-nc-accent">
            <span className="inline-block h-[5px] w-[5px] rounded-full bg-nc-accent animate-pulse" />
            Running
          </span>
        ) : totalAgents > 0 ? (
          <span className="text-[10px] text-nc-text-ghost">
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
          <div className="flex justify-between text-[9px] text-nc-text-ghost">
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
          <p className="text-[10px] text-nc-text-ghost">Run a director plan to see agent activity.</p>
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
                  "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 transition-colors",
                  isActive ? "bg-nc-accent-muted" : isDone ? "bg-nc-surface" : "bg-transparent"
                )}
              >
                {/* Agent icon */}
                <div className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[9px] font-bold",
                  isDone ? "bg-nc-success/15 text-nc-success" :
                  isActive ? "bg-nc-accent/15 text-nc-accent" :
                  "bg-nc-panel text-nc-text-ghost"
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
                  "flex-1 text-[11px] font-medium",
                  isDone ? "text-nc-text-secondary" :
                  isActive ? "text-nc-accent" :
                  "text-nc-text-ghost"
                )}>
                  {meta.label}
                </span>

                {/* Progress */}
                <div className="flex items-center gap-2">
                  <div className="h-[3px] w-12 overflow-hidden rounded-full bg-nc-panel">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isDone ? "bg-nc-success" : isActive ? "bg-nc-accent" : "bg-nc-text-ghost/20"
                      )}
                      style={{ width: `${Math.round(p.progress * 100)}%` }}
                    />
                  </div>
                  <span className="w-7 text-right font-mono text-[9px] tabular-nums text-nc-text-ghost">
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
        <div className="mt-4 rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">
              Quality Report
            </span>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
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
        <div className="mt-3 rounded-[var(--radius-md)] border border-nc-accent/20 bg-nc-accent-muted p-3">
          <div className="mb-1 text-[10px] font-semibold text-nc-accent">Ready for review</div>
          <p className="text-[9px] leading-relaxed text-nc-text-ghost">
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
      <span className="w-28 text-[9px] text-nc-text-ghost">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nc-panel">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value >= 0.8 ? "bg-nc-success" : value >= 0.5 ? "bg-nc-warning" : "bg-nc-error"
          )}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="w-7 text-right font-mono text-[9px] tabular-nums text-nc-text-ghost">
        {(value * 100).toFixed(0)}
      </span>
    </div>
  );
}
