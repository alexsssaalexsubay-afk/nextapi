import { memo, useMemo, useState, useCallback } from "react";
import { Download, Filter, Grid2X2, ListVideo, Plus, Sparkles } from "lucide-react";
import { useDirectorStore, type Shot, type QualityScore } from "@/stores/director-store";
import { useAppStore } from "@/stores/app-store";
import { sidecarFetch } from "@/lib/sidecar";
import { buildGeneratePayload, formatPreflightFindings, runGenerationPreflight } from "@/lib/generation";
import { cn } from "@/lib/cn";
import { useI18nStore } from "@/stores/i18n-store";
import { Button, MediaThumb, Pill, Segmented } from "@/components/ui/kit";

type GridSize = "sm" | "md" | "lg";
type SceneFilter = "all" | "ready" | "queued" | "needs";
const GRID_COLS: Record<GridSize, string> = {
  sm: "grid-cols-[repeat(auto-fill,minmax(172px,1fr))]",
  md: "grid-cols-[repeat(auto-fill,minmax(248px,1fr))]",
  lg: "grid-cols-[repeat(auto-fill,minmax(304px,1fr))]",
};

export const StoryboardPanel = memo(function StoryboardPanel() {
  const { shots, setShots, updateShot, reorderShots, pipeline, aspectRatio, selectedWorkflow, planId } = useDirectorStore();
  const { selectedShotId, setSelectedShotId } = useAppStore();
  const [gridSize, setGridSize] = useState<GridSize>("lg");
  const [sceneFilter, setSceneFilter] = useState<SceneFilter>("all");
  const [dragState, setDragState] = useState<{ from: number; over: number | null } | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [preflightError, setPreflightError] = useState("");
  const [assetSubmitting, setAssetSubmitting] = useState<string | null>(null);
  const { t } = useI18nStore();

  const completed = shots.filter((s) => s.video_url || s.status === "succeeded").length;
  const generating = shots.filter((s) => s.status === "generating" || s.status === "processing").length;
  const queued = shots.filter((s) => s.status === "queued" || s.status === "pending").length;
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) || shots[0] || null;
  const totalDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);

  const visibleShots = useMemo(() => {
    if (sceneFilter === "ready") return shots.filter((shot) => shot.video_url || shot.status === "succeeded");
    if (sceneFilter === "queued") return shots.filter((shot) => shot.status === "queued" || shot.status === "generating" || shot.status === "processing");
    if (sceneFilter === "needs") return shots.filter((shot) => !shot.video_url && shot.status !== "queued" && shot.status !== "generating" && shot.status !== "processing");
    return shots;
  }, [sceneFilter, shots]);

  const handleDragStart = useCallback((index: number) => {
    setDragState({ from: index, over: null });
  }, []);

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    if (dragState) setDragState({ ...dragState, over: index });
  }, [dragState]);

  const handleDrop = useCallback((toIndex: number) => {
    if (dragState && dragState.from !== toIndex) {
      reorderShots(dragState.from, toIndex);
      if (planId) {
        const nextShots = [...shots];
        const [moved] = nextShots.splice(dragState.from, 1);
        nextShots.splice(toIndex, 0, moved);
        void sidecarFetch(`/director/plan/${planId}/reorder`, {
          method: "POST",
          body: JSON.stringify({ shot_ids: nextShots.map((shot) => shot.id) }),
        }).catch(() => {});
      }
    }
    setDragState(null);
  }, [dragState, planId, reorderShots, shots]);

  const handlePromptAction = useCallback(async (shotId: string, action: string) => {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;
    try {
      const res = await sidecarFetch<{ result: string }>("/director/prompt/action", {
        method: "POST",
        body: JSON.stringify({ prompt: shot.prompt, action }),
      });
      if (res.result) {
        updateShot(shotId, { prompt: res.result });
      }
    } catch {
      // silent
    }
  }, [shots, updateShot]);

  const handleRegenerateShot = useCallback(async (shotId: string) => {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;
    setPreflightError("");
    const payload = buildGeneratePayload({ shot, pipeline, aspectRatio, workflow: selectedWorkflow });
    try {
      const preflight = await runGenerationPreflight([payload], true);
      if (preflight.status === "blocked") {
        setPreflightError(formatPreflightFindings(preflight));
        updateShot(shotId, { status: "failed" });
        return;
      }
      updateShot(shotId, { status: "queued", video_url: "" });
      await sidecarFetch("/generate/submit", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch {
      updateShot(shotId, { status: "failed" });
    }
  }, [aspectRatio, pipeline, selectedWorkflow, shots, updateShot]);

  const handleBatchGenerate = useCallback(async () => {
    const pendingShots = shots.filter((shot) => !shot.video_url && shot.status !== "queued" && shot.status !== "generating" && shot.status !== "processing");
    if (pendingShots.length === 0 || batchSubmitting) return;
    setBatchSubmitting(true);
    setPreflightError("");
    const payloads = pendingShots.map((shot) =>
      buildGeneratePayload({ shot, pipeline, aspectRatio, workflow: selectedWorkflow })
    );
    try {
      const preflight = await runGenerationPreflight(payloads, false);
      if (preflight.status === "blocked") {
        setPreflightError(formatPreflightFindings(preflight));
        return;
      }
      pendingShots.forEach((shot) => updateShot(shot.id, { status: "queued", video_url: "" }));
      await sidecarFetch("/generate/batch", {
        method: "POST",
        body: JSON.stringify({
          sequential: false,
          shots: payloads,
        }),
      });
    } catch {
      pendingShots.forEach((shot) => updateShot(shot.id, { status: "failed" }));
    } finally {
      setBatchSubmitting(false);
    }
  }, [aspectRatio, batchSubmitting, pipeline, selectedWorkflow, shots, updateShot]);

  const handleGenerateStoryboardAssets = useCallback(async (shotId: string) => {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot || assetSubmitting) return;
    setPreflightError("");
    setAssetSubmitting(shotId);
    try {
      const res = await sidecarFetch<{
        status: string;
        assets?: Array<{ url: string; role: string; description: string; prompt: string }>;
        failures?: Array<{ role: string; message: string }>;
      }>("/agents/generate-storyboard-assets", {
        method: "POST",
        body: JSON.stringify({
          shot_id: shot.id,
          title: shot.title,
          prompt: shot.prompt,
          shot_script: shot.generationParams?.shot_script || "",
          first_frame_desc: shot.generationParams?.first_frame_desc || "",
          last_frame_desc: shot.generationParams?.last_frame_desc || "",
          motion_desc: shot.generationParams?.motion_desc || shot.camera,
          aspect_ratio: aspectRatio,
          modes: ["storyboard_keyframe", "first_frame", "last_frame"],
        }),
      });
      const assets = (res.assets || []).filter((asset) => asset.url);
      if (!assets.length) {
        setPreflightError("分镜图生成失败：没有返回可用图片资产。请检查 OpenAI 图片生成配置。");
        return;
      }
      const storyboard = assets.find((asset) => asset.role === "storyboard_keyframe") || assets[0];
      const firstFrame = assets.find((asset) => asset.role === "first_frame");
      const lastFrame = assets.find((asset) => asset.role === "last_frame");
      const imageUrls = uniqueCompact([...(shot.generationParams?.image_urls || []), ...assets.map((asset) => asset.url)]).slice(0, 9);
      const referenceInstructions = uniqueCompact([
        ...(shot.generationParams?.reference_instructions || []),
        firstFrame?.url ? "Use the first generated keyframe as image 1 to lock the shot starting frame." : "",
        lastFrame?.url ? "Use the last generated keyframe as a continuity target for the shot ending frame." : "",
        storyboard?.url ? "Use the storyboard keyframe to preserve composition and subject placement." : "",
      ]);
      updateShot(shot.id, {
        thumbnail_url: storyboard.url || shot.thumbnail_url,
        generationParams: {
          ...shot.generationParams,
          storyboard_image_url: storyboard.url,
          first_frame_image_url: firstFrame?.url || shot.generationParams?.first_frame_image_url,
          last_frame_image_url: lastFrame?.url || shot.generationParams?.last_frame_image_url,
          image_urls: imageUrls,
          reference_instructions: referenceInstructions,
        },
      });
    } catch {
      setPreflightError("分镜图生成失败：sidecar 或图像模型不可用。");
    } finally {
      setAssetSubmitting(null);
    }
  }, [aspectRatio, assetSubmitting, shots, updateShot]);

  const exportShotManifest = useCallback(() => {
    const payload = {
      title: "NextCut storyboard manifest",
      total_duration: totalDuration,
      shot_count: shots.length,
      shots: shots.map((shot) => ({
        id: shot.id,
        index: shot.index,
        title: shot.title,
        duration: shot.duration,
        status: shot.status,
        prompt: shot.prompt,
        camera: shot.camera,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nextcut-storyboard-manifest.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [shots, totalDuration]);

  const handleAddShot = useCallback(() => {
    const base = selectedShot || shots[shots.length - 1];
    const id = `manual_shot_${Date.now()}`;
    const nextShot: Shot = {
      id,
      scene_id: base?.scene_id || "manual_scene",
      index: shots.length + 1,
      title: `新增镜头 ${shots.length + 1}`,
      duration: base?.duration || 4,
      prompt: base?.prompt || "新增镜头：描述主体、动作、场景和运镜。",
      negative_prompt: base?.negative_prompt || "low quality, watermark, text overlay",
      status: "planned",
      video_url: "",
      thumbnail_url: base?.thumbnail_url || "",
      camera: base?.camera || "medium shot, stable camera movement",
      audio: base?.audio,
      generationParams: {
        ...base?.generationParams,
        shot_script: "新增镜头。补充一个清晰动作，保持主体一致。",
      },
      qualityScore: null,
    };
    setShots([...shots, nextShot]);
    setSelectedShotId(id);
  }, [selectedShot, setSelectedShotId, setShots, shots]);

  const startEditPrompt = (shotId: string) => {
    const shot = shots.find((s) => s.id === shotId);
    if (shot) {
      setEditingPrompt(shotId);
      setPromptDraft(shot.prompt);
    }
  };

  const savePrompt = () => {
    if (editingPrompt) {
      updateShot(editingPrompt, { prompt: promptDraft });
      if (planId) {
        void sidecarFetch(`/director/plan/${planId}/shot/${editingPrompt}`, {
          method: "PATCH",
          body: JSON.stringify({ prompt: promptDraft }),
        }).catch(() => {});
      }
      setEditingPrompt(null);
    }
  };

  if (shots.length === 0) {
    return (
      <div className="flex h-full flex-col bg-nc-bg">
        {/* Toolbar */}
        <div className="flex min-h-[56px] shrink-0 items-center justify-between border-b border-nc-border px-5">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium uppercase tracking-[0.08em] text-nc-text-secondary">
              {t("storyboard.title")}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-8">
          <div className="mb-6 text-center">
            <h3 className="text-xl font-bold text-nc-text">{t("storyboard.empty")}</h3>
            <p className="mt-2 text-[14px] text-nc-text-tertiary max-w-md mx-auto">{t("storyboard.emptyDesc")}</p>
          </div>

          {/* Skeletal Storyboard */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 opacity-50 max-w-6xl mx-auto w-full">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="aspect-video w-full rounded-[var(--radius-lg)] bg-nc-surface border border-nc-border shadow-sm flex flex-col justify-between p-4">
                <div className="flex justify-between items-start w-full">
                  <div className="h-5 w-5 bg-nc-panel rounded flex items-center justify-center text-[10px] font-bold text-nc-text-tertiary">{i + 1}</div>
                  <div className="h-4 w-12 bg-nc-panel rounded-sm" />
                </div>
                <div className="space-y-1.5 w-full mt-auto">
                  <div className="h-2 w-full bg-nc-panel rounded-full" />
                  <div className="h-2 w-3/4 bg-nc-panel rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#F7F8FC]">
      <div className="shrink-0 border-b border-nc-border bg-white px-8 py-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-semibold leading-9 text-nc-text">分镜板</h1>
              <button type="button" aria-label="收藏分镜板" className="flex h-9 w-9 items-center justify-center rounded-[10px] text-nc-text-tertiary hover:bg-nc-bg hover:text-nc-accent">
                ☆
              </button>
            </div>
            <p className="mt-1 text-[14px] leading-6 text-nc-text-secondary">
              可视化你的拍摄计划，调整镜头顺序与内容，确保每个镜头服务于整体叙事。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button variant="secondary" onClick={exportShotManifest}>
              <Download className="h-4 w-4" />
              导出镜头清单
            </Button>
            <Button variant="secondary" onClick={handleBatchGenerate} disabled={batchSubmitting || shots.length === completed}>
              {batchSubmitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-nc-accent/30 border-t-nc-accent" /> : <Sparkles className="h-4 w-4" />}
              批量生成
            </Button>
            <Segmented<GridSize>
              value={gridSize}
              onChange={setGridSize}
              options={[
                { value: "lg", label: "卡片" },
                { value: "md", label: "紧凑" },
                { value: "sm", label: "列表" },
              ]}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-nc-border bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="accent">全部 {shots.length}</Pill>
            <Pill tone="success">已就绪 {completed}</Pill>
            <Pill tone={queued || generating ? "info" : "neutral"}>队列 {queued + generating}</Pill>
            <Pill tone="neutral">总时长 {totalDuration.toFixed(0)}s</Pill>
          </div>
          <div className="flex items-center gap-3">
            <Segmented<SceneFilter>
              value={sceneFilter}
              onChange={setSceneFilter}
              options={[
                { value: "all", label: "全部" },
                { value: "ready", label: "已确认" },
                { value: "queued", label: "生成中" },
                { value: "needs", label: "待处理" },
              ]}
            />
            <Button size="icon" variant="secondary" aria-label="筛选">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {preflightError && (
          <div className="mt-4 whitespace-pre-line rounded-[14px] border border-nc-error/20 bg-nc-error/5 px-4 py-3 text-[13px] leading-6 text-nc-error">
            {preflightError}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
        <div className="mb-4 flex items-center gap-3 text-[13px] leading-5 text-nc-text-secondary">
          <Grid2X2 className="h-4 w-4" />
          <span>拖拽卡片可调整镜头顺序</span>
          {selectedShot && <span className="ml-auto truncate">当前选中：S{selectedShot.index} · {selectedShot.title}</span>}
        </div>
        <div className={cn("grid gap-5", GRID_COLS[gridSize])}>
          {visibleShots.map((shot) => {
            const index = shots.findIndex((item) => item.id === shot.id);
            return (
            <ShotCard
              key={shot.id}
              shot={shot}
              index={index}
              gridSize={gridSize}
              isSelected={selectedShotId === shot.id}
              isDragOver={dragState?.over === index}
              isEditing={editingPrompt === shot.id}
              promptDraft={editingPrompt === shot.id ? promptDraft : ""}
              onSelect={() => setSelectedShotId(shot.id)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(index, e)}
              onDrop={() => handleDrop(index)}
              onRegenerate={() => handleRegenerateShot(shot.id)}
              onGenerateStoryboard={() => handleGenerateStoryboardAssets(shot.id)}
              isGeneratingAssets={assetSubmitting === shot.id}
              onPromptAction={(action) => handlePromptAction(shot.id, action)}
              onStartEditPrompt={() => startEditPrompt(shot.id)}
              onPromptDraftChange={setPromptDraft}
              onSavePrompt={savePrompt}
              onCancelEdit={() => setEditingPrompt(null)}
            />
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-nc-border bg-white px-8 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-nc-text-secondary">
            <ListVideo className="h-4 w-4" />
            镜头顺序（共 {shots.length} 个镜头 · 总时长 {totalDuration.toFixed(0)}s）
          </div>
          <Button size="sm" variant="secondary" onClick={handleAddShot}>
            <Plus className="h-4 w-4" />
            添加镜头
          </Button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {shots.map((shot, index) => (
            <button
              key={shot.id}
              type="button"
              onClick={() => setSelectedShotId(shot.id)}
              className={cn(
                "group flex w-[116px] shrink-0 flex-col gap-1 rounded-[12px] border p-1.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                selectedShotId === shot.id ? "border-nc-accent bg-[#F5F3FF] ring-2 ring-nc-accent/10" : "border-nc-border bg-white"
              )}
            >
              <div className="relative aspect-video overflow-hidden rounded-[9px] bg-nc-bg">
                <MediaThumb src={shot.thumbnail_url || undefined} title={shot.title} className="h-full rounded-[9px] border-0" />
                <span className="absolute left-1.5 top-1.5 rounded-[7px] bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-nc-accent">0{index + 1}</span>
              </div>
              <span className="truncate text-[11px] font-semibold leading-4 text-nc-text">{shot.title}</span>
              <span className="font-mono text-[10px] text-nc-text-tertiary">{shot.duration}s</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

const ShotCard = memo(function ShotCard({
  shot,
  index,
  gridSize,
  isSelected,
  isDragOver,
  isEditing,
  promptDraft,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onRegenerate,
  onGenerateStoryboard,
  isGeneratingAssets,
  onPromptAction,
  onStartEditPrompt,
  onPromptDraftChange,
  onSavePrompt,
  onCancelEdit,
}: {
  shot: Shot;
  index: number;
  gridSize: GridSize;
  isSelected: boolean;
  isDragOver: boolean;
  isEditing: boolean;
  promptDraft: string;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onRegenerate: () => void;
  onGenerateStoryboard: () => void;
  isGeneratingAssets: boolean;
  onPromptAction: (action: string) => void;
  onStartEditPrompt: () => void;
  onPromptDraftChange: (v: string) => void;
  onSavePrompt: () => void;
  onCancelEdit: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  const hasVideo = !!shot.video_url;
  const hasKeyframe = !!shot.thumbnail_url;
  const isCompact = gridSize === "sm";
  const { t } = useI18nStore();
  const motionLabel = shot.index === 1
    ? "开场钩子"
    : shot.index === 2
    ? "质感建立"
    : shot.index === 3
    ? "场景推进"
    : shot.index === 4
    ? "卖点强化"
    : shot.index === 5
    ? "情绪收束"
    : "节奏补强";
  const statusLabel = hasVideo
    ? "已生成"
    : shot.status === "queued"
    ? "排队中"
    : shot.status === "generating" || shot.status === "processing"
    ? "生成中"
    : shot.status === "failed"
    ? "失败"
    : "待生成";

  return (
    <div
      draggable
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={cn(
        "group nc-card-safe relative flex cursor-pointer flex-col rounded-[16px] border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        isSelected
          ? "border-nc-accent bg-white shadow-lg shadow-nc-accent/10 ring-2 ring-nc-accent/15"
          : isDragOver
          ? "border-nc-info/50 bg-nc-info/5 ring-1 ring-nc-info/20"
          : "border-nc-border bg-white hover:border-nc-accent/35"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-black/40">
        {hasVideo ? (
          <>
            <MediaThumb src={shot.thumbnail_url || undefined} videoSrc={shot.thumbnail_url ? undefined : shot.video_url} title={shot.title} className="h-full rounded-none border-0" />
            {hovering && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="white"><polygon points="4,2 12,7 4,12" /></svg>
                </div>
              </div>
            )}
          </>
        ) : hasKeyframe ? (
          <div className="relative h-full w-full">
            <MediaThumb src={shot.thumbnail_url} title={shot.title} className="h-full rounded-none border-0" />
              <div className="absolute bottom-3 left-3 rounded-[10px] bg-white/92 px-3 py-1.5 text-[12px] font-semibold leading-4 text-nc-accent shadow-sm">
                分镜图
              </div>
          </div>
        ) : shot.status === "generating" || shot.status === "processing" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-nc-panel">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-nc-accent border-t-transparent" />
            {!isCompact && <span className="text-[13px] leading-5 text-nc-text-tertiary">{t("storyboard.rendering")}</span>}
          </div>
        ) : shot.status === "failed" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-nc-error/5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-error">
              <circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" />
            </svg>
            {!isCompact && (
              <button onClick={onRegenerate} className="rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium leading-5 text-nc-accent shadow-sm transition-all hover:bg-nc-accent/10 hover:shadow-md hover:underline">{t("storyboard.retry")}</button>
            )}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-nc-panel">
            <span className="text-[13px] leading-5 text-nc-text-tertiary">{t("storyboard.pending")}</span>
          </div>
        )}

        {/* Shot number */}
        <div className="absolute left-3 top-3 flex h-9 min-w-9 items-center justify-center rounded-[11px] bg-nc-accent px-3 text-[13px] font-bold leading-5 text-white shadow-sm">
          {index + 1}
        </div>

        {/* Quality badge */}
        {shot.qualityScore && (
          <div className={cn(
            "absolute right-3 top-3 rounded-[10px] px-3 py-1.5 text-[13px] font-bold leading-5 backdrop-blur-sm",
            shot.qualityScore.overall >= 0.8 ? "bg-nc-success/80 text-white" :
            shot.qualityScore.overall >= 0.5 ? "bg-nc-warning/80 text-white" :
            "bg-nc-error/80 text-white"
          )}>
            {(shot.qualityScore.overall * 100).toFixed(0)}
          </div>
        )}

        {/* Duration */}
        <div className="absolute bottom-3 right-3 rounded-[10px] bg-black/60 px-3 py-1.5 font-mono text-[12px] leading-4 tabular-nums text-white backdrop-blur-sm">
          {shot.duration}s
        </div>

        {/* Drag handle (visible on hover) */}
        {hovering && (
          <div className="absolute left-1.5 bottom-1.5 rounded bg-black/60 p-1 cursor-grab">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="white" opacity="0.7">
              <circle cx="2" cy="2" r="0.8" /><circle cx="6" cy="2" r="0.8" />
              <circle cx="2" cy="5" r="0.8" /><circle cx="6" cy="5" r="0.8" />
            </svg>
          </div>
        )}
      </div>

      {/* Info area */}
      {!isCompact && (
        <div className="flex min-h-[178px] flex-col gap-3 px-4 py-4">
          <h4 className="nc-text-safe line-clamp-1 text-[16px] font-semibold leading-6 text-nc-text">
            {shot.title || `Shot ${index + 1}`}
          </h4>

          {shot.qualityScore && <QualityBar score={shot.qualityScore} />}

          {isEditing ? (
            <div className="mt-1">
              <textarea
                value={promptDraft}
                onChange={(e) => onPromptDraftChange(e.target.value)}
                rows={3}
                className="nc-text-safe max-h-[132px] w-full resize-none rounded-[12px] border border-nc-accent/40 bg-nc-panel px-4 py-3 text-[14px] leading-6 text-nc-text shadow-sm outline-none focus:ring-2 focus:ring-nc-accent/20"
                autoFocus
              />
              <div className="mt-1 flex justify-end gap-2">
                <button onClick={onCancelEdit} className="min-h-10 rounded-[10px] px-4 py-2 text-[13px] leading-5 text-nc-text-tertiary transition-all hover:bg-nc-panel">
                  {t("storyboard.cancel")}
                </button>
                <button onClick={onSavePrompt} className="min-h-10 rounded-[10px] bg-nc-accent px-4 py-2 text-[13px] font-medium leading-5 text-nc-bg shadow-md transition-all hover:bg-nc-accent-hover hover:shadow-lg">
                  {t("storyboard.save")}
                </button>
              </div>
            </div>
          ) : (
            (shot.generationParams?.shot_script || shot.prompt) && (
              <p
                onClick={(e) => { e.stopPropagation(); onStartEditPrompt(); }}
                className="nc-text-safe line-clamp-3 min-h-[72px] cursor-text text-[13px] leading-6 text-nc-text-secondary hover:text-nc-text"
              >
                {shot.generationParams?.shot_script || shot.prompt}
              </p>
            )
          )}

          {!isEditing && (
            <div className="mt-auto flex items-center gap-2 pt-2">
              <span className="min-w-0 truncate rounded-[10px] bg-[#F5F3FF] px-3 py-1.5 text-[12px] font-semibold leading-4 text-nc-accent">
                {motionLabel}
              </span>
              <span className="shrink-0 rounded-[10px] bg-nc-bg px-3 py-1.5 text-[12px] font-semibold leading-4 text-nc-text-tertiary">
                {statusLabel}
              </span>
            </div>
          )}

          {/* Prompt quick actions */}
          {!isEditing && isSelected && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); onPromptAction("simplify"); }}
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium leading-5 text-nc-text-tertiary shadow-sm transition-all hover:bg-nc-panel-hover hover:text-nc-text-secondary hover:shadow-md"
                title="Simplify prompt"
              >
                精简
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onPromptAction("enhance"); }}
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium leading-5 text-nc-text-tertiary shadow-sm transition-all hover:bg-nc-panel-hover hover:text-nc-text-secondary hover:shadow-md"
                title="Enhance with more detail"
              >
                增强
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onPromptAction("translate"); }}
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium leading-5 text-nc-text-tertiary shadow-sm transition-all hover:bg-nc-panel-hover hover:text-nc-text-secondary hover:shadow-md"
                title="Translate Chinese ↔ English"
              >
                中/英
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onGenerateStoryboard(); }}
                disabled={isGeneratingAssets}
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold leading-5 text-nc-accent shadow-sm transition-all hover:bg-nc-accent/10 hover:shadow-md disabled:opacity-60"
                title="生成分镜关键帧、首帧和尾帧，并写回 image_urls"
              >
                {isGeneratingAssets ? "生图中" : "分镜图"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onStartEditPrompt(); }}
                className="ml-auto rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold leading-5 text-nc-accent shadow-sm transition-all hover:bg-nc-accent/10 hover:shadow-md"
              >
                编辑
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-nc-accent" />
      )}
    </div>
  );
});

function uniqueCompact(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}

function QualityBar({ score }: { score: QualityScore }) {
  const metrics = [
    { label: "角色一致性", value: score.characterConsistency, color: "bg-nc-info" },
    { label: "提示词质量", value: score.promptQuality, color: "bg-nc-accent" },
    { label: "风格统一", value: score.styleCoherence, color: "bg-nc-success" },
  ];

  return (
    <div className="flex items-center gap-1.5" title="角色一致性 / 提示词质量 / 风格统一">
      {metrics.map((m) => (
        <div key={m.label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-nc-bg">
            <div className={cn("h-full rounded-full transition-all", m.color)} style={{ width: `${m.value * 100}%` }} />
        </div>
      ))}
    </div>
  );
}
