import { memo, useState, useCallback } from "react";
import { useDirectorStore, type Shot, type QualityScore } from "@/stores/director-store";
import { sidecarFetch } from "@/lib/sidecar";
import { cn } from "@/lib/cn";

type GridSize = "sm" | "md" | "lg";
const GRID_COLS: Record<GridSize, string> = {
  sm: "grid-cols-4 sm:grid-cols-6 md:grid-cols-8",
  md: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
  lg: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
};

export const StoryboardPanel = memo(function StoryboardPanel() {
  const { shots, updateShot, reorderShots } = useDirectorStore();
  const [gridSize, setGridSize] = useState<GridSize>("md");
  const [selectedShot, setSelectedShot] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ from: number; over: number | null } | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");

  const completed = shots.filter((s) => s.video_url || s.status === "succeeded").length;
  const generating = shots.filter((s) => s.status === "generating" || s.status === "processing").length;

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
    }
    setDragState(null);
  }, [dragState, reorderShots]);

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
    updateShot(shotId, { status: "pending", video_url: "" });
    try {
      await sidecarFetch("/generate/submit", {
        method: "POST",
        body: JSON.stringify({
          shot_id: shotId,
          prompt: shot.prompt,
          duration: shot.duration,
        }),
      });
    } catch {
      // handled by toast
    }
  }, [shots, updateShot]);

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
      setEditingPrompt(null);
    }
  };

  if (shots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-nc-panel">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-text-ghost">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <div>
          <p className="text-[12px] font-medium text-nc-text-tertiary">No shots yet</p>
          <p className="mt-1 text-[10px] text-nc-text-ghost">Generate a plan to see your storyboard here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-nc-bg">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-nc-border px-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">
            Storyboard
          </span>
          <span className="font-mono text-[10px] tabular-nums text-nc-text-ghost">
            {completed}/{shots.length}
            {generating > 0 && (
              <span className="ml-1 text-nc-info">({generating} rendering)</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Grid size */}
          <div className="flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel p-0.5">
            {(["sm", "md", "lg"] as GridSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setGridSize(size)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[9px] font-medium transition-colors",
                  gridSize === size
                    ? "bg-nc-panel-active text-nc-text"
                    : "text-nc-text-ghost hover:text-nc-text-tertiary"
                )}
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-3">
        <div className={cn("grid gap-3", GRID_COLS[gridSize])}>
          {shots.map((shot, index) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              index={index}
              gridSize={gridSize}
              isSelected={selectedShot === shot.id}
              isDragOver={dragState?.over === index}
              isEditing={editingPrompt === shot.id}
              promptDraft={editingPrompt === shot.id ? promptDraft : ""}
              onSelect={() => setSelectedShot(shot.id)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(index, e)}
              onDrop={() => handleDrop(index)}
              onRegenerate={() => handleRegenerateShot(shot.id)}
              onPromptAction={(action) => handlePromptAction(shot.id, action)}
              onStartEditPrompt={() => startEditPrompt(shot.id)}
              onPromptDraftChange={setPromptDraft}
              onSavePrompt={savePrompt}
              onCancelEdit={() => setEditingPrompt(null)}
            />
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
  onPromptAction: (action: string) => void;
  onStartEditPrompt: () => void;
  onPromptDraftChange: (v: string) => void;
  onSavePrompt: () => void;
  onCancelEdit: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  const hasVideo = !!shot.video_url;
  const isCompact = gridSize === "sm";

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
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-lg)] border transition-all duration-200",
        isSelected
          ? "border-nc-accent/50 bg-nc-panel shadow-lg shadow-nc-accent/5 ring-1 ring-nc-accent/20"
          : isDragOver
          ? "border-nc-info/50 bg-nc-info/5 ring-1 ring-nc-info/20"
          : "border-nc-border bg-nc-surface hover:border-nc-border-strong hover:shadow-md hover:shadow-black/20"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        {hasVideo ? (
          <>
            {shot.thumbnail_url ? (
              <img src={shot.thumbnail_url} alt={shot.title} className="h-full w-full object-cover" />
            ) : (
              <video src={shot.video_url} className="h-full w-full object-cover" muted />
            )}
            {hovering && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="white"><polygon points="4,2 12,7 4,12" /></svg>
                </div>
              </div>
            )}
          </>
        ) : shot.status === "generating" || shot.status === "processing" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-nc-panel">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-nc-accent border-t-transparent" />
            {!isCompact && <span className="text-[9px] text-nc-text-ghost">Rendering...</span>}
          </div>
        ) : shot.status === "failed" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-nc-error/5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-error">
              <circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" />
            </svg>
            {!isCompact && (
              <button onClick={onRegenerate} className="text-[9px] text-nc-accent hover:underline">Retry</button>
            )}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-nc-panel">
            <span className="text-[10px] text-nc-text-ghost">Pending</span>
          </div>
        )}

        {/* Shot number */}
        <div className="absolute left-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-black/60 px-1 text-[8px] font-bold text-white backdrop-blur-sm">
          {index + 1}
        </div>

        {/* Quality badge */}
        {shot.qualityScore && (
          <div className={cn(
            "absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[8px] font-bold backdrop-blur-sm",
            shot.qualityScore.overall >= 0.8 ? "bg-nc-success/80 text-white" :
            shot.qualityScore.overall >= 0.5 ? "bg-nc-warning/80 text-white" :
            "bg-nc-error/80 text-white"
          )}>
            {(shot.qualityScore.overall * 100).toFixed(0)}
          </div>
        )}

        {/* Duration */}
        <div className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-mono tabular-nums text-white backdrop-blur-sm">
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
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <h4 className="line-clamp-1 text-[11px] font-medium text-nc-text">
            {shot.title || `Shot ${index + 1}`}
          </h4>

          {/* Quality breakdown */}
          {shot.qualityScore && (
            <QualityBar score={shot.qualityScore} />
          )}

          {/* Prompt (editable or display) */}
          {isEditing ? (
            <div className="mt-1">
              <textarea
                value={promptDraft}
                onChange={(e) => onPromptDraftChange(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-[var(--radius-sm)] border border-nc-accent/30 bg-nc-panel px-2 py-1.5 text-[10px] leading-relaxed text-nc-text outline-none focus:ring-1 focus:ring-nc-accent/20"
                autoFocus
              />
              <div className="mt-1 flex justify-end gap-1">
                <button onClick={onCancelEdit} className="rounded px-2 py-0.5 text-[9px] text-nc-text-ghost hover:bg-nc-panel">
                  Cancel
                </button>
                <button onClick={onSavePrompt} className="rounded bg-nc-accent px-2 py-0.5 text-[9px] font-medium text-nc-bg">
                  Save
                </button>
              </div>
            </div>
          ) : (
            shot.prompt && (
              <p
                onClick={(e) => { e.stopPropagation(); onStartEditPrompt(); }}
                className="line-clamp-2 cursor-text text-[9px] leading-relaxed text-nc-text-ghost hover:text-nc-text-tertiary"
              >
                {shot.prompt}
              </p>
            )
          )}

          {/* Prompt quick actions */}
          {!isEditing && isSelected && (
            <div className="mt-1 flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onPromptAction("simplify"); }}
                className="rounded px-1.5 py-0.5 text-[8px] text-nc-text-ghost hover:bg-nc-panel-hover hover:text-nc-text-tertiary"
                title="Simplify prompt"
              >
                Simplify
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onPromptAction("enhance"); }}
                className="rounded px-1.5 py-0.5 text-[8px] text-nc-text-ghost hover:bg-nc-panel-hover hover:text-nc-text-tertiary"
                title="Enhance with more detail"
              >
                Enhance
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onPromptAction("translate"); }}
                className="rounded px-1.5 py-0.5 text-[8px] text-nc-text-ghost hover:bg-nc-panel-hover hover:text-nc-text-tertiary"
                title="Translate Chinese ↔ English"
              >
                中/En
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onStartEditPrompt(); }}
                className="ml-auto rounded px-1.5 py-0.5 text-[8px] text-nc-accent hover:bg-nc-accent/10"
              >
                Edit
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

function QualityBar({ score }: { score: QualityScore }) {
  const metrics = [
    { label: "Char", value: score.characterConsistency, color: "bg-nc-info" },
    { label: "Prompt", value: score.promptQuality, color: "bg-nc-accent" },
    { label: "Style", value: score.styleCoherence, color: "bg-nc-success" },
  ];

  return (
    <div className="flex items-center gap-2">
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center gap-1">
          <span className="text-[7px] text-nc-text-ghost">{m.label}</span>
          <div className="h-1 w-8 overflow-hidden rounded-full bg-nc-panel">
            <div className={cn("h-full rounded-full transition-all", m.color)} style={{ width: `${m.value * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
