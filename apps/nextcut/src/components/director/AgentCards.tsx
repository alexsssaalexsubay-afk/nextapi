import { memo } from "react";
import { CheckCircle2, CircleDashed, GitBranch, ShieldCheck, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { capabilityMeta } from "@/lib/capability-badges";
import {
  ORCHESTRATION_AGENTS,
  getAgentProgressPercent,
  getAgentRunStatus,
  getDependencySummary,
  getProgressMap,
} from "@/lib/agent-orchestration";
import { Pill } from "@/components/ui/kit";
import { useDirectorStore } from "@/stores/director-store";

function statusMeta(status: ReturnType<typeof getAgentRunStatus>) {
  if (status === "complete") return { label: "已产出", tone: "success" as const, icon: CheckCircle2 };
  if (status === "running") return { label: "运行中", tone: "accent" as const, icon: Timer };
  if (status === "failed") return { label: "阻断", tone: "danger" as const, icon: ShieldCheck };
  if (status === "ready") return { label: "可运行", tone: "info" as const, icon: GitBranch };
  return { label: "等上游", tone: "neutral" as const, icon: CircleDashed };
}

export const AgentCards = memo(function AgentCards() {
  const { agentProgress, isRunning } = useDirectorStore();
  const progressMap = getProgressMap(agentProgress);
  const llmCapability = capabilityMeta.text;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-7 text-nc-text">AI 导演组</h3>
          <p className="mt-1 line-clamp-1 text-[12px] leading-5 text-nc-text-tertiary">
            按依赖运行，产物会回写到分镜、参考、提示词和时间线。
          </p>
        </div>
        {isRunning && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-nc-accent">
            <span className="inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-nc-accent" />
            编排中
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ORCHESTRATION_AGENTS.map((agent) => {
          const runStatus = getAgentRunStatus(agent, progressMap);
          const pct = getAgentProgressPercent(agent.id, progressMap);
          const dependency = getDependencySummary(agent, progressMap);
          const meta = statusMeta(runStatus);
          const Icon = meta.icon;
          const active = runStatus === "running";
          const done = runStatus === "complete";

          return (
            <article
              key={agent.id}
              className={cn(
                "nc-card-safe group relative flex min-h-[214px] flex-col overflow-hidden rounded-[16px] border bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)]",
                active && "border-nc-accent bg-[#F9F7FF] ring-2 ring-nc-accent/12",
                done && "border-nc-success/30",
                runStatus === "failed" && "border-nc-error/35 bg-nc-error/5",
                !active && !done && runStatus !== "failed" && "border-nc-border"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-[14px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: agent.accent }}
                >
                  {agent.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold leading-6 text-nc-text">{agent.name}</span>
                    <span className="truncate text-[12px] leading-5 text-nc-text-tertiary">{agent.phase}</span>
                  </div>
                  <div className="line-clamp-1 text-[12px] leading-5 text-nc-text-secondary">{agent.roleZh}</div>
                </div>
                <Pill tone={meta.tone} className="min-h-6 shrink-0 px-2.5 py-0.5 text-[11px]">
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </Pill>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill tone={llmCapability.tone} className="min-h-6 px-2.5 py-0.5 text-[11px]" title={llmCapability.hint}>
                  {llmCapability.label}
                </Pill>
                <span className="text-[11px] font-semibold leading-4 text-nc-text-tertiary">可在设置里单独换模型</span>
              </div>

              <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{agent.summary}</p>

              <div className="mt-4 grid gap-3">
                <div className="rounded-[13px] border border-nc-border bg-nc-bg px-3 py-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold leading-4 text-nc-text-tertiary">
                    <span>依赖</span>
                    <span>{dependency.total === 0 ? "入口代理" : `${dependency.complete}/${dependency.total}`}</span>
                  </div>
                  <div className="flex min-h-6 flex-wrap gap-1.5">
                    {(agent.dependencies.length ? agent.dependencies : ["Brief"]).map((item) => (
                      <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium leading-4 text-nc-text-secondary shadow-sm">
                        {item.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-[13px] border border-nc-border bg-white px-3 py-2.5">
                  <div className="mb-2 text-[11px] font-semibold leading-4 text-nc-text-tertiary">核心产物</div>
                  <div className="flex min-h-6 flex-wrap gap-1.5">
                    {agent.produces.slice(0, 3).map((item) => (
                      <span key={item} className="rounded-full bg-[#F5F3FF] px-2.5 py-1 text-[11px] font-semibold leading-4 text-nc-accent">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-4">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold leading-4 text-nc-text-tertiary">
                  <span>生产进度</span>
                  <span className="font-mono tabular-nums">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-nc-border">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      runStatus === "failed" ? "bg-nc-error" : done ? "bg-nc-success" : "bg-nc-accent"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
});
