import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Filter, GitBranch, PlayCircle, Search, Zap } from "lucide-react";
import { Button, FieldShell, Pill, Surface } from "@/components/ui/kit";
import { cn } from "@/lib/cn";
import {
  ORCHESTRATION_AGENTS,
  getAgentProgressPercent,
  getAgentRunStatus,
  getDependencySummary,
  getProgressMap,
  type OrchestrationAgent,
} from "@/lib/agent-orchestration";
import { AgentGlyph } from "@/components/director/AgentGlyph";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";

type LogFilter = "all" | "running" | "complete" | "warning";

function statusLabel(status: string) {
  if (status === "complete") return "完成";
  if (status === "running" || status === "progress") return "运行中";
  if (status === "failed") return "错误";
  return "等待";
}

function statusTone(status: string) {
  if (status === "complete") return "success" as const;
  if (status === "running" || status === "progress") return "accent" as const;
  if (status === "failed") return "danger" as const;
  return "neutral" as const;
}

export function AgentLogPanel() {
  const { agentProgress, isRunning, shots, overallQuality, pipelineStep, promptReview, lastError } = useDirectorStore();
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const setStoryflowMode = useAppStore((s) => s.setStoryflowMode);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LogFilter>("all");
  const progressMap = useMemo(() => getProgressMap(agentProgress), [agentProgress]);

  const completedAgents = agentProgress.filter((p) => p.status === "complete").length;
  const totalAgents = ORCHESTRATION_AGENTS.length;
  const overallProgress = totalAgents ? Math.round((completedAgents / totalAgents) * 100) : 0;
  const warnings = (promptReview?.warning || 0) + (lastError ? 1 : 0);

  const logRows = useMemo(() => {
    return agentProgress
      .map((progress) => {
        const meta = ORCHESTRATION_AGENTS.find((agent) => agent.id === progress.agent);
        const label = meta?.name || progress.agent;
        const role = meta ? `${meta.phase} / ${meta.roleZh}` : "自定义代理";
        const pct = Math.round(progress.progress * 100);
        const message = progress.status === "complete"
          ? `${role} 已完成，输出已写入导演链。`
          : progress.status === "running" || progress.status === "progress"
          ? `${role} 正在处理，当前进度 ${pct}%。`
          : `${role} 等待上游结果。`;
        return { progress, agent: meta, meta: { label, role }, pct, message };
      })
      .filter((row) => {
        if (filter === "running" && !(row.progress.status === "running" || row.progress.status === "progress")) return false;
        if (filter === "complete" && row.progress.status !== "complete") return false;
        if (filter === "warning" && row.progress.status !== "failed") return false;
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        return `${row.meta.label} ${row.meta.role} ${row.message}`.toLowerCase().includes(needle);
      });
  }, [agentProgress, filter, query]);

  const openStoryflow = () => {
    setStoryflowMode("storyflow");
    setSidebarPage("workspace");
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-nc-bg p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold leading-8 text-nc-text">Agent 运行日志</h2>
          <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-nc-text-secondary">
            代理状态、性能指标、警告和错误会集中在这里，方便定位导演链断点。
          </p>
        </div>
        <Pill tone={isRunning ? "accent" : shots.length > 0 ? "success" : "neutral"}>
          {isRunning ? "运行中" : shots.length > 0 ? "已生成计划" : "待启动"}
        </Pill>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Activity className="h-4 w-4" />} label="流程步骤" value={pipelineStep} />
        <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="代理完成" value={`${completedAgents}/${totalAgents}`} />
        <MetricCard icon={<Zap className="h-4 w-4" />} label="镜头计划" value={`${shots.length}`} />
        <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="警告" value={`${warnings}`} warning={warnings > 0} />
      </div>

      <Surface className="mb-5 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <FieldShell className="w-full xl:w-[360px]">
            <Search className="h-4 w-4 text-nc-text-tertiary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索代理、角色、日志..."
              className="w-full bg-transparent text-[14px] text-nc-text outline-none placeholder:text-nc-text-tertiary"
            />
          </FieldShell>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-nc-text-tertiary" />
            {([
              ["all", "全部"],
              ["running", "运行中"],
              ["complete", "已完成"],
              ["warning", "警告"],
            ] as Array<[LogFilter, string]>).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "primary" : "secondary"}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-[999px] bg-nc-border">
          <div className="h-full rounded-[999px] bg-nc-accent transition-all duration-500" style={{ width: `${overallProgress}%` }} />
        </div>
      </Surface>

      <OrchestrationMap progressMap={progressMap} onOpenStoryflow={openStoryflow} />

      {lastError && (
        <Surface className="mb-5 border-nc-error/30 bg-nc-error/5 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-nc-error" />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-6 text-nc-error">运行警告</div>
              <div className="mt-1 line-clamp-3 text-[13px] leading-6 text-nc-text-secondary">{lastError}</div>
            </div>
          </div>
        </Surface>
      )}

      <div className="grid gap-3">
        {logRows.length === 0 ? (
          <Surface className="flex min-h-[180px] items-center justify-center p-8 text-center">
            <div>
              <Clock3 className="mx-auto h-6 w-6 text-nc-text-tertiary" />
              <div className="mt-3 text-[14px] font-semibold leading-6 text-nc-text">暂无匹配日志</div>
              <div className="mt-1 text-[13px] leading-6 text-nc-text-secondary">调整筛选条件或先运行一次生成规划。</div>
            </div>
          </Surface>
        ) : logRows.map(({ progress, agent, meta, pct, message }) => {
          const active = progress.status === "running" || progress.status === "progress";
          const done = progress.status === "complete";
          const failed = progress.status === "failed";
          return (
            <Surface
              key={progress.agent}
              selected={active}
              className={cn(
                "grid min-h-[92px] grid-cols-[minmax(0,1fr)_120px] items-center gap-4 p-4",
                failed && "border-nc-error/35 bg-nc-error/5",
                done && "border-nc-success/25"
              )}
            >
              <div className="flex min-w-0 items-center gap-4">
                {agent ? (
                  <AgentGlyph agentId={agent.id} accent={agent.accent} active={active || done} className="h-11 w-11" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-nc-bg text-nc-text-tertiary">
                    <Activity className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold leading-6 text-nc-text">{meta.label}</span>
                    <Pill tone={failed ? "danger" : done ? "success" : active ? "accent" : "neutral"}>{statusLabel(progress.status)}</Pill>
                  </div>
                  <div className="mt-1 line-clamp-1 text-[12px] leading-5 text-nc-text-tertiary">{meta.role}</div>
                  <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-nc-text-secondary">{message}</div>
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between text-[12px] font-semibold leading-4 text-nc-text-tertiary">
                  <span>progress</span>
                  <span className="font-mono tabular-nums">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-[999px] bg-nc-border">
                  <div
                    className={cn("h-full rounded-[999px] transition-all duration-500", failed ? "bg-nc-error" : done ? "bg-nc-success" : "bg-nc-accent")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </Surface>
          );
        })}
      </div>

      {overallQuality && !isRunning && (
        <Surface className="mt-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[16px] font-semibold leading-6 text-nc-text">质量报告</span>
            <Pill tone={overallQuality.overall >= 0.8 ? "success" : overallQuality.overall >= 0.5 ? "warning" : "danger"}>
              {(overallQuality.overall * 100).toFixed(0)}%
            </Pill>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <QualityMetric label="角色一致性" value={overallQuality.characterConsistency} />
            <QualityMetric label="提示词质量" value={overallQuality.promptQuality} />
            <QualityMetric label="风格一致性" value={overallQuality.styleCoherence} />
          </div>
        </Surface>
      )}
    </div>
  );
}

function OrchestrationMap({
  progressMap,
  onOpenStoryflow,
}: {
  progressMap: Map<string, { agent: string; status: string; progress: number }>;
  onOpenStoryflow: () => void;
}) {
  return (
    <Surface className="mb-5 overflow-hidden p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-nc-accent" />
            <h3 className="text-[16px] font-semibold leading-6 text-nc-text">多智能体生产编排</h3>
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-nc-text-secondary">
            每个 Agent 都有上游依赖、产物契约和生成前检查。状态不是装饰，会跟导演运行、画布节点和生产链同步。
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpenStoryflow}>
          <PlayCircle className="h-4 w-4" />
          打开 Storyflow
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {ORCHESTRATION_AGENTS.map((agent, index) => (
          <OrchestrationNode key={agent.id} agent={agent} index={index} progressMap={progressMap} />
        ))}
      </div>
    </Surface>
  );
}

function OrchestrationNode({
  agent,
  index,
  progressMap,
}: {
  agent: OrchestrationAgent;
  index: number;
  progressMap: Map<string, { agent: string; status: string; progress: number }>;
}) {
  const runStatus = getAgentRunStatus(agent, progressMap);
  const dependency = getDependencySummary(agent, progressMap);
  const pct = getAgentProgressPercent(agent.id, progressMap);
  const rawStatus = progressMap.get(agent.id)?.status || (runStatus === "ready" ? "ready" : "pending");
  const active = runStatus === "running";
  const complete = runStatus === "complete";

  return (
    <article
      className={cn(
        "relative min-h-[190px] rounded-[16px] border bg-nc-bg p-4 transition-all duration-200",
        active && "border-nc-accent bg-[#F9F7FF] shadow-[0_12px_32px_rgba(108,77,255,0.10)]",
        complete && "border-nc-success/30 bg-white",
        runStatus === "failed" && "border-nc-error/35 bg-nc-error/5",
        !active && !complete && runStatus !== "failed" && "border-nc-border"
      )}
    >
      {index > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -left-3 top-8 hidden h-px w-3 xl:block",
            active ? "bg-nc-accent" : complete ? "bg-nc-success" : "bg-nc-border-strong"
          )}
        />
      )}
      <div className="flex items-start gap-3">
        <AgentGlyph agentId={agent.id} accent={agent.accent} active={active || complete} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[14px] font-semibold leading-5 text-nc-text">{agent.name}</span>
            <Pill tone={statusTone(rawStatus)} className="min-h-7 shrink-0 px-3 py-1 text-[12px]">
              {runStatus === "ready" ? "可运行" : statusLabel(rawStatus)}
            </Pill>
          </div>
          <div className="mt-1 line-clamp-1 text-[12px] leading-5 text-nc-text-tertiary">{agent.phase} · {agent.roleZh}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-[12px] bg-white px-3 py-2">
          <div className="mb-1 text-[12px] font-semibold leading-5 text-nc-text-tertiary">输入</div>
          <div className="line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{agent.consumes.join(" / ")}</div>
        </div>
        <div className="rounded-[12px] bg-white px-3 py-2">
          <div className="mb-1 text-[12px] font-semibold leading-5 text-nc-text-tertiary">产物</div>
          <div className="line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{agent.produces.join(" / ")}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] font-semibold leading-5 text-nc-text-tertiary">
        <span>依赖 {dependency.total === 0 ? "入口" : `${dependency.complete}/${dependency.total}`}</span>
        <span className="font-mono tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-nc-border">
        <div
          className={cn("h-full rounded-full transition-all duration-500", runStatus === "failed" ? "bg-nc-error" : complete ? "bg-nc-success" : "bg-nc-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </article>
  );
}

function MetricCard({ icon, label, value, warning }: { icon: React.ReactNode; label: string; value: string; warning?: boolean }) {
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">{label}</div>
          <div className={cn("mt-2 truncate text-[18px] font-bold leading-7", warning ? "text-nc-error" : "text-nc-text")}>{value}</div>
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]", warning ? "bg-nc-error/10 text-nc-error" : "bg-[#F5F3FF] text-nc-accent")}>{icon}</span>
      </div>
    </Surface>
  );
}

function QualityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[14px] border border-nc-border bg-nc-bg p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="truncate text-[13px] font-semibold leading-5 text-nc-text-secondary">{label}</span>
        <span className="font-mono text-[12px] font-semibold tabular-nums text-nc-text-secondary">{(value * 100).toFixed(0)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-nc-border">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value >= 0.8 ? "bg-nc-success" : value >= 0.5 ? "bg-nc-warning" : "bg-nc-error"
          )}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}
