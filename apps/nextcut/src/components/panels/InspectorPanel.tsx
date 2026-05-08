import { useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Download, Edit3, Film, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { sidecarFetch } from "@/lib/sidecar";
import { buildGeneratePayload, formatPreflightFindings, runGenerationPreflight } from "@/lib/generation";
import { Button, Pill, Segmented, Surface } from "@/components/ui/kit";

type Tab = "properties" | "prompt" | "extend" | "export";

const TABS: { id: Tab; label: string }[] = [
  { id: "properties", label: "信息" },
  { id: "prompt", label: "提示词" },
  { id: "extend", label: "扩展" },
  { id: "export", label: "导出" },
];

export function InspectorPanel() {
  const [tab, setTab] = useState<Tab>("properties");
  const selectedShotId = useAppStore((s) => s.selectedShotId);
  const {
    shots,
    updateShot,
    isRunning,
    pipeline,
    aspectRatio,
    selectedWorkflow,
    productionBible,
    shotGenerationCards,
    promptReview,
  } = useDirectorStore();

  const selectedShot = shots.find((s) => s.id === selectedShotId);
  const selectedShotIndex = shots.findIndex((s) => s.id === selectedShotId);
  const selectedCard = shotGenerationCards.find((c) => c.shot_id === selectedShotId);
  const selectedFindings = promptReview?.findings.filter((f) => f.shot_id === selectedShotId) || [];
  const completedShots = shots.filter((s) => s.status === "succeeded" || s.video_url);

  const [editingPrompt, setEditingPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [preflightError, setPreflightError] = useState("");

  const startEditing = useCallback(() => {
    if (!selectedShot) return;
    setEditingPrompt(selectedShot.prompt);
    setIsEditing(true);
    setTab("prompt");
  }, [selectedShot]);

  const savePrompt = useCallback(() => {
    if (!selectedShot) return;
    updateShot(selectedShot.id, { prompt: editingPrompt });
    setIsEditing(false);
  }, [selectedShot, editingPrompt, updateShot]);

  const regenerateShot = useCallback(async () => {
    if (!selectedShot) return;
    setRegenerating(true);
    setPreflightError("");
    const payload = buildGeneratePayload({ shot: selectedShot, pipeline, aspectRatio, workflow: selectedWorkflow });
    try {
      const preflight = await runGenerationPreflight([payload], false);
      if (preflight.status === "blocked") {
        setPreflightError(formatPreflightFindings(preflight));
        return;
      }
      await sidecarFetch("/generate/batch", {
        method: "POST",
        body: JSON.stringify({
          sequential: false,
          shots: [payload],
        }),
      });
      updateShot(selectedShot.id, { status: "queued", video_url: "", thumbnail_url: "" });
    } catch {
      updateShot(selectedShot.id, { status: "failed" });
    } finally {
      setRegenerating(false);
    }
  }, [selectedShot, pipeline, aspectRatio, selectedWorkflow, updateShot]);

  const handleExtend = useCallback(async (direction: "forward" | "backward") => {
    if (!selectedShot?.video_url) return;
    setPreflightError("");
    const payload = {
      ...buildGeneratePayload({
        shot: selectedShot,
        pipeline,
        aspectRatio,
        workflow: "video_extend",
        promptOverride: `${selectedShot.prompt}\nExtend ${direction} while preserving the same subject, style, camera logic, and continuity.`,
        durationOverride: 5,
        extraVideoUrls: [selectedShot.video_url],
      }),
      shot_id: `${selectedShot.id}-ext-${direction}`,
    };
    try {
      const preflight = await runGenerationPreflight([payload], true);
      if (preflight.status === "blocked") {
        setPreflightError(formatPreflightFindings(preflight));
        return;
      }
      await sidecarFetch("/generate/submit", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch {
      // handled by toast
    }
  }, [selectedShot, pipeline, aspectRatio]);

  const downloadShot = useCallback((videoUrl: string, shotId: string) => {
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `${shotId}.mp4`;
    a.target = "_blank";
    a.click();
  }, []);

  const downloadAll = useCallback(() => {
    completedShots.forEach((s, i) => {
      if (s.video_url) {
        setTimeout(() => {
          const a = document.createElement("a");
          a.href = s.video_url;
          a.download = `${s.id}.mp4`;
          a.target = "_blank";
          a.click();
        }, i * 400);
      }
    });
  }, [completedShots]);

  return (
    <div className="flex h-full flex-col bg-nc-surface">
      {/* Tab bar */}
      <div className="flex min-h-[68px] shrink-0 items-center border-b border-nc-border px-5">
        <Segmented<Tab> value={tab} onChange={setTab} options={TABS.map((item) => ({ value: item.id, label: item.label }))} />

        <div className="ml-auto flex items-center gap-3">
          {completedShots.length > 0 && (
            <Pill tone="success" className="font-mono tabular-nums">
              {completedShots.length}/{shots.length}
            </Pill>
          )}
          {selectedShot && (
            <Button
              onClick={regenerateShot}
              disabled={regenerating || isRunning}
              size="sm"
            >
              {regenerating ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-nc-text border-t-transparent" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              重生成
            </Button>
          )}
        </div>
      </div>
      {preflightError && (
        <div className="mx-5 mt-4 whitespace-pre-line rounded-[14px] border border-nc-error/20 bg-nc-error/5 px-4 py-3 text-[13px] leading-6 text-nc-error">
          {preflightError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {tab === "properties" && (
          <div className="text-[14px]">
            {selectedShot ? (
              <div className="flex flex-col gap-4">
                <Surface className="p-5">
                <div className="grid grid-cols-1 gap-3">
                  <Row label="镜头" value={selectedShotIndex >= 0 ? `S${selectedShotIndex + 1}` : "已选择"} mono accent />
                  <Row label="时长" value={`${selectedShot.duration}s`} mono />
                  <Row label="标题" value={selectedShot.title} />
                  <Row
                    label="状态"
                    value={selectedShot.video_url ? "已生成" : selectedShot.status === "planned" ? "已规划" : selectedShot.status}
                    className={cn(
                      selectedShot.video_url ? "text-nc-success" :
                      selectedShot.status === "failed" ? "text-nc-error" :
                      "text-nc-text-tertiary"
                    )}
                  />
                </div>
                </Surface>

                <div className="mt-1 flex flex-wrap gap-3">
                  {selectedShot.video_url && (
                    <Button
                      onClick={() => downloadShot(selectedShot.video_url, selectedShot.id)}
                      variant="primary"
                    >
                      <Download className="h-4 w-4" />
                      下载
                    </Button>
                  )}
                  <Button
                    onClick={startEditing}
                  >
                    <Edit3 className="h-4 w-4" />
                    编辑提示词
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-[14px] border border-dashed border-nc-border px-5 py-4 text-[14px] leading-6 text-nc-text-tertiary">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1" className="text-nc-text-tertiary/50">
                  <rect x="2" y="3" width="10" height="8" rx="1" />
                  <path d="M5 7h4" />
                </svg>
                选择一个镜头查看详情
              </div>
            )}
          </div>
        )}

        {tab === "prompt" && (
          <div className="flex flex-col gap-4">
            {selectedShot ? (
              <>
                <textarea
                  value={isEditing ? editingPrompt : (selectedShot.prompt || "")}
                  onChange={(e) => setEditingPrompt(e.target.value)}
                  onFocus={() => {
                    if (!isEditing) {
                      setEditingPrompt(selectedShot.prompt || "");
                      setIsEditing(true);
                    }
                  }}
                  placeholder="镜头提示词..."
                  className={cn(
                    "flex-1 resize-none rounded-[14px] border bg-nc-panel px-4 py-3.5 text-[14px] leading-7 text-nc-text shadow-sm outline-none transition-colors",
                    isEditing
                      ? "border-nc-accent/40 focus:ring-2 focus:ring-nc-accent/15"
                      : "border-nc-border hover:border-nc-border-strong"
                  )}
                  rows={4}
                />
                {isEditing && (
                  <div className="flex gap-3">
                  <Button
                    onClick={savePrompt}
                    variant="primary"
                    size="sm"
                  >
                    保存
                  </Button>
                  <Button
                    onClick={() => setIsEditing(false)}
                    variant="ghost"
                    size="sm"
                  >
                    取消
                  </Button>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                  {selectedCard && (
                    <div className="rounded-[14px] border border-nc-border bg-nc-panel/80 p-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-nc-text-secondary">
                          生成卡片
                        </span>
                        {selectedCard.risk_flags.length > 0 && (
                          <span className="rounded-full border border-nc-warning/30 bg-nc-warning/15 px-2.5 py-1 text-[12px] leading-4 text-nc-warning">
                            {selectedCard.risk_flags.length} 个风险
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[13px] leading-6 text-nc-text-secondary">
                        {selectedCard.motion_contract || "One subject action"} · {selectedCard.camera_contract || selectedShot.camera}
                      </p>
                      <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-nc-text-tertiary">
                        {selectedCard.reference_contract}
                      </p>
                    </div>
                  )}

                  {(selectedShot.generationParams || productionBible) && (
                    <div className="rounded-[14px] border border-nc-border bg-nc-panel/80 p-4 shadow-sm transition-shadow hover:shadow-md">
                      <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-nc-text-secondary">
                        渲染约束
                      </span>
                      <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-nc-text-secondary">
                        {selectedShot.generationParams?.constraints ||
                          productionBible?.reference_policy ||
                          "No render contract yet"}
                      </p>
                      {selectedShot.generationParams?.reference_instructions?.length ? (
                        <p className="mt-2 truncate text-[13px] leading-5 text-nc-accent">
                          {selectedShot.generationParams.reference_instructions.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                {selectedFindings.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {selectedFindings.map((finding) => (
                      <div
                        key={`${finding.code}-${finding.severity}`}
                        className={cn(
                          "rounded-[12px] border px-4 py-3 text-[13px] leading-6 shadow-sm",
                          finding.severity === "critical"
                            ? "border-nc-error/30 bg-nc-error/8 text-nc-error"
                            : finding.severity === "warning"
                              ? "border-nc-warning/30 bg-nc-warning/8 text-nc-warning"
                              : "border-nc-border bg-nc-panel text-nc-text-tertiary"
                        )}
                      >
                        {finding.message} {finding.suggestion}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span className="text-sm text-nc-text-tertiary">选择一个镜头编辑提示词</span>
            )}
          </div>
        )}

        {tab === "extend" && (
          <div className="text-[14px]">
            {selectedShot?.video_url ? (
              <div className="flex flex-col gap-4">
                <p className="text-[14px] leading-6 text-nc-text-secondary">
                  使用视频续写能力向前或向后扩展当前镜头。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => handleExtend("forward")}
                    variant="secondary"
                    className="min-h-[128px] flex-col gap-3 p-5 text-center"
                  >
                    <ArrowRight className="h-5 w-5 text-nc-accent" />
                    <span className="text-[14px] font-semibold leading-5 text-nc-text">向后续写</span>
                    <span className="text-[13px] leading-5 text-nc-text-tertiary">延续当前动作</span>
                  </Button>
                  <Button
                    onClick={() => handleExtend("backward")}
                    variant="secondary"
                    className="min-h-[128px] flex-col gap-3 p-5 text-center"
                  >
                    <ArrowLeft className="h-5 w-5 text-nc-info" />
                    <span className="text-[14px] font-semibold leading-5 text-nc-text">向前补镜</span>
                    <span className="text-[13px] leading-5 text-nc-text-tertiary">补充进入前奏</span>
                  </Button>
                </div>
                <div className="rounded-[14px] border border-nc-accent/20 bg-nc-accent-muted p-4 text-[13px] leading-6 text-nc-text-secondary shadow-sm">
                  建议：单段 10 秒以内更适合续写。扩展时会优先保持角色外观、场景方向和运动连续性。
                </div>
              </div>
            ) : (
              <span className="text-nc-text-tertiary">先生成视频，再使用扩展</span>
            )}
          </div>
        )}

        {tab === "export" && (
          <div className="text-[14px]">
            {shots.length === 0 ? (
              <span className="text-nc-text-tertiary">还没有镜头</span>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-nc-text-secondary">
                    {completedShots.length} / {shots.length} 个片段已就绪
                  </span>
                  {completedShots.length > 0 && (
                    <Button
                      onClick={downloadAll}
                      variant="primary"
                    >
                      <Download className="h-4 w-4" />
                      全部下载
                    </Button>
                  )}
                </div>

                {/* Export full video */}
                {completedShots.length >= 2 && (
                  <Button
                    onClick={async () => {
                      try {
                        const res = await sidecarFetch<any>("/generate/export", {
                          method: "POST",
                          body: JSON.stringify({
                            shot_ids: shots.map((s) => s.id),
                            format: "mp4",
                            transition: "cut",
                          }),
                        });
                        if (res.status === "ready" && res.export_url) {
                          const a = document.createElement("a");
                          a.href = res.export_url;
                          a.download = "nextcut_export.mp4";
                          a.target = "_blank";
                          a.click();
                        } else if (res.status === "incomplete") {
                          alert(`Cannot export yet: ${res.message}`);
                        } else {
                          alert("Export failed: " + (res.message || "Unknown error"));
                        }
                      } catch { /* toast */ }
                    }}
                    variant="secondary"
                    className="border-nc-success/40 bg-nc-success/10 text-nc-success hover:bg-nc-success/15"
                  >
                    <Film className="h-4 w-4" />
                    导出完整视频
                  </Button>
                )}

                {/* Progress bar */}
                <div>
                  <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-nc-panel">
                    <div
                      className="h-full rounded-full bg-nc-accent transition-all duration-500"
                      style={{ width: `${(completedShots.length / shots.length) * 100}%` }}
                    />
                  </div>
                  <div className="text-[13px] leading-5 text-nc-text-tertiary">
                    完成度 {Math.round((completedShots.length / shots.length) * 100)}%
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {shots.map((s) => (
                    <div key={s.id} className="flex min-h-10 items-center gap-3 rounded-[12px] border border-transparent px-3.5 py-2.5 text-[13px] leading-5 shadow-sm hover:border-nc-border hover:bg-nc-panel-hover">
                      <span className={cn(
                        "h-[6px] w-[6px] rounded-full",
                        s.video_url ? "bg-nc-success" : s.status === "failed" ? "bg-nc-error" : "bg-nc-text-tertiary/40"
                      )} />
                      <span className="flex-1 truncate text-nc-text-secondary">{s.title || s.id}</span>
                      <span className="font-mono text-[13px] tabular-nums text-nc-text-tertiary">{s.duration}s</span>
                      {s.video_url ? (
                        <Button
                          onClick={() => downloadShot(s.video_url, s.id)}
                          variant="ghost"
                          size="icon"
                          aria-label={`下载 ${s.title || s.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-nc-text-tertiary">{s.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, accent, className }: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-20 shrink-0 text-[13px] leading-5 text-nc-text-tertiary">{label}</span>
      <span className={cn(
        "truncate text-[14px] leading-6",
        mono && "font-mono",
        accent ? "text-nc-accent" : "text-nc-text-secondary",
        className
      )}>
        {value}
      </span>
    </div>
  );
}
