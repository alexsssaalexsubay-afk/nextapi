import { memo, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Eye, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDirectorStore, type PipelineStep } from "@/stores/director-store";

const STEPS: { id: PipelineStep; label: string; labelZh: string; desc: string }[] = [
  { id: "planning", label: "Script", labelZh: "脚本", desc: "AI writes the screenplay" },
  { id: "script_review", label: "审核脚本", labelZh: "审核脚本", desc: "编辑场景和角色" },
  { id: "storyboard_review", label: "分镜", labelZh: "分镜", desc: "整理并优化镜头" },
  { id: "prompt_review", label: "Prompts", labelZh: "提示词", desc: "Fine-tune each shot" },
  { id: "generating", label: "Generate", labelZh: "生成", desc: "Render with Seedance" },
  { id: "quality_review", label: "Quality", labelZh: "质检", desc: "Review & score results" },
];

type StepFlowStatus = "idle" | "running" | "complete" | "failed" | "selected";

function stepIndex(step: PipelineStep): number {
  const idx = STEPS.findIndex((s) => s.id === step);
  return idx >= 0 ? idx : -1;
}

function connectorStatus({
  index,
  currentIdx,
  isRunning,
  hasError,
  complete,
}: {
  index: number;
  currentIdx: number;
  isRunning: boolean;
  hasError: boolean;
  complete: boolean;
}): StepFlowStatus {
  if (hasError && index >= Math.max(0, currentIdx - 1)) return "failed";
  if (complete || index < currentIdx - 1) return "complete";
  if (index === currentIdx - 1) return isRunning ? "running" : "complete";
  if (index === currentIdx) return "selected";
  return "idle";
}

function statusText(status: StepFlowStatus) {
  if (status === "running") return "运行中";
  if (status === "complete") return "已完成";
  if (status === "failed") return "已阻断";
  if (status === "selected") return "即将开始";
  return "等待";
}

function FlowConnector({ status }: { status: StepFlowStatus }) {
  return (
    <span
      className={cn("nc-pipeline-flow-connector", `is-${status}`)}
      title={`流程连接：${statusText(status)}`}
      aria-label={`流程连接：${statusText(status)}`}
    />
  );
}

export const PipelineStepFlow = memo(function PipelineStepFlow() {
  const {
    pipelineStep,
    isRunning,
    lastError,
    setPipelineStep,
    sceneOutlines,
    shots,
    promptReview,
    overallQuality,
  } = useDirectorStore();
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const previousStepRef = useRef<PipelineStep>(pipelineStep);
  const [reviewStep, setReviewStep] = useState<PipelineStep | null>(null);

  const activeStep = pipelineStep === "complete" ? "quality_review" : pipelineStep;
  const currentIdx = pipelineStep === "complete" ? STEPS.length : stepIndex(activeStep);
  const visibleStep = reviewStep || activeStep;
  const visibleIdx = stepIndex(visibleStep);
  const viewingHistory = Boolean(reviewStep && reviewStep !== activeStep);
  const hasError = Boolean(lastError);
  const progress = pipelineStep === "complete"
    ? 100
    : currentIdx < 0 ? 0 : Math.min(100, ((currentIdx + (isRunning ? 0.45 : 1)) / STEPS.length) * 100);

  useEffect(() => {
    const previous = previousStepRef.current;
    setReviewStep((current) => {
      if (!current || current === previous) return activeStep;
      return current;
    });
    previousStepRef.current = activeStep;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeStep]);

  if (pipelineStep === "idle") return null;

  const visibleMeta = STEPS[visibleIdx] || STEPS[Math.max(0, Math.min(currentIdx, STEPS.length - 1))];
  const nextStep = currentIdx >= 0 && currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;

  const stepSummary = (() => {
    if (visibleStep === "planning") return `${sceneOutlines.length || 0} 个场景 · ${shots.length || 0} 个镜头目标`;
    if (visibleStep === "script_review") return sceneOutlines.length ? sceneOutlines.map((scene) => scene.title).slice(0, 2).join(" / ") : "等待脚本结构";
    if (visibleStep === "storyboard_review") return shots.length ? `${shots.length} 个镜头已进入 storyboard，可继续调整顺序和时长` : "等待分镜生成";
    if (visibleStep === "prompt_review") return promptReview ? `${promptReview.critical} 个严重 · ${promptReview.warning} 个警告 · ${promptReview.findings.length} 条复核建议` : "等待镜头提示词复核";
    if (visibleStep === "generating") return `${shots.filter((shot) => shot.status === "queued" || shot.status === "generating").length} 个镜头在生成队列`;
    if (visibleStep === "quality_review") return overallQuality ? `整体评分 ${Math.round(overallQuality.overall * 100)} · ${overallQuality.issues.length} 个问题` : "等待质检评分";
    return "等待流程启动";
  })();

  return (
    <div className="border-b border-nc-border bg-white px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-nc-text">
            AI 导演流程
            {viewingHistory && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[11px] font-semibold text-nc-accent">
                <Eye className="h-3 w-3" />
                回看中
              </span>
            )}
          </div>
          <div className="mt-0.5 line-clamp-1 text-[12px] leading-5 text-nc-text-secondary">
            {visibleMeta?.desc || "等待流程启动"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {viewingHistory && (
            <button
              type="button"
              onClick={() => setReviewStep(activeStep)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-nc-border bg-white px-3 text-[12px] font-semibold text-nc-text-secondary shadow-sm transition-all hover:border-nc-accent/40 hover:text-nc-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              回到当前
            </button>
          )}
          {!isRunning && nextStep && !viewingHistory && (
            <button
              type="button"
              onClick={() => {
                setPipelineStep(nextStep.id);
                setReviewStep(nextStep.id);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-nc-accent px-3 text-[12px] font-semibold text-white shadow-sm transition-all hover:bg-nc-accent-hover"
            >
              继续
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="font-mono text-[12px] font-semibold leading-4 tabular-nums text-nc-text-tertiary">
            {Math.round(progress)}%
          </div>
        </div>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-[999px] bg-nc-border">
        <div className={cn("h-full rounded-[999px] transition-all duration-500", hasError ? "bg-nc-error" : "bg-nc-accent")} style={{ width: `${progress}%` }} />
      </div>
      <div className="flex max-w-full items-center overflow-x-auto pb-1">
        {STEPS.map((step, i) => {
          const isActive = step.id === pipelineStep;
          const isVisible = step.id === visibleStep;
          const isDone = i < currentIdx;
          const isFailed = hasError && isActive;
          const canReview = isDone || isActive || pipelineStep === "complete";
          const nextConnectorStatus = connectorStatus({
            index: i,
            currentIdx,
            isRunning,
            hasError,
            complete: pipelineStep === "complete",
          });

          return (
            <div key={step.id} className="flex min-w-fit items-center">
              <button
                type="button"
                ref={isActive ? activeRef : undefined}
                disabled={!canReview}
                onClick={() => canReview && setReviewStep(step.id)}
                className={cn(
                  "flex min-w-[154px] items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-55",
                  isFailed ? "border-nc-error/30 bg-nc-error/10 ring-2 ring-nc-error/10" :
                  isDone ? "border-nc-success/25 bg-nc-success/10" :
                  isActive ? "border-nc-accent bg-[#F5F3FF] shadow-sm ring-2 ring-nc-accent/10" :
                  "border-nc-border bg-nc-bg",
                  isVisible && !isFailed && "ring-2 ring-nc-accent/20",
                  canReview && "hover:-translate-y-0.5 hover:shadow-sm"
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold transition-all",
                  isFailed ? "bg-nc-error text-white" :
                  isDone ? "bg-nc-success text-white" :
                  isActive ? "bg-nc-accent text-white shadow-sm" :
                  "bg-white text-nc-text-tertiary"
                )}>
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isActive && isRunning ? (
                    <div className="h-3 w-3 animate-[spin_1.5s_linear_infinite] rounded-full border-2 border-white/40 border-t-white" />
                  ) : isFailed ? (
                    <span>!</span>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className={cn(
                    "truncate text-[13px] font-semibold leading-5",
                    isFailed ? "text-nc-error" :
                    isDone ? "text-nc-success" :
                    isActive ? "text-nc-accent" :
                    "text-nc-text-secondary"
                  )}>
                    {step.labelZh}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[12px] leading-4 text-nc-text-tertiary">
                    {isFailed ? "运行阻断" : isActive && isRunning ? "自动运行中" : isDone ? "结果已绑定" : step.label}
                  </div>
                </div>
              </button>
              {i < STEPS.length - 1 && <FlowConnector status={nextConnectorStatus} />}
            </div>
          );
        })}
      </div>
      <div className="mt-3 rounded-[14px] border border-nc-border bg-nc-bg px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-5 text-nc-text">
              {visibleMeta?.labelZh || "当前步骤"}
            </div>
            <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">
              {stepSummary}
            </div>
          </div>
          <span className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4",
            hasError ? "bg-nc-error/10 text-nc-error" : viewingHistory ? "bg-[#F5F3FF] text-nc-accent" : isRunning ? "bg-[#ECFEFF] text-[#0891B2]" : "bg-nc-success/10 text-nc-success"
          )}>
            {hasError ? "需要处理" : viewingHistory ? "历史快照" : isRunning ? "自动推进" : "可继续"}
          </span>
        </div>
        {hasError && (
          <div className="nc-text-safe mt-2 line-clamp-2 text-[12px] leading-5 text-nc-error">
            {lastError}
          </div>
        )}
      </div>
    </div>
  );
});

export const ScriptReviewPanel = memo(function ScriptReviewPanel() {
  const { sceneOutlines, updateSceneOutline, setPipelineStep } = useDirectorStore();

  if (sceneOutlines.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-nc-text-secondary">
        Waiting for script generation...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-nc-text">Review Script</h3>
          <p className="text-xs text-nc-text-secondary">生成分镜前先编辑场景，这里的调整会影响后续所有镜头。</p>
        </div>
        <button
          onClick={() => setPipelineStep("storyboard_review")}
          className="inline-flex h-10 items-center rounded-lg bg-nc-accent px-5 py-2 text-sm font-semibold text-nc-bg shadow-md shadow-nc-accent/20 transition-all hover:bg-nc-accent-hover hover:shadow-lg"
        >
          Approve & Continue
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {sceneOutlines.map((scene, i) => (
          <div key={scene.id} className="rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-3 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-nc-accent/10 text-xs font-bold text-nc-accent">
                {i + 1}
              </span>
              <input
                value={scene.title}
                onChange={(e) => updateSceneOutline(scene.id, { title: e.target.value })}
                className="flex-1 bg-transparent text-sm font-medium text-nc-text outline-none"
                placeholder="Scene title"
              />
            </div>
            <textarea
              value={scene.description}
              onChange={(e) => updateSceneOutline(scene.id, { description: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-[var(--radius-md)] border border-nc-border bg-nc-panel px-3 py-2 text-sm leading-relaxed text-nc-text outline-none focus:border-nc-accent/30"
              placeholder="Scene description — what happens, who's involved, setting, mood..."
            />
            {scene.characters.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {scene.characters.map((c) => (
                  <span key={c} className="rounded-full bg-nc-panel-active px-2 py-0.5 text-xs text-nc-text-secondary">
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
