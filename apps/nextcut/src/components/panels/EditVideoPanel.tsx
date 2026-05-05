import { useState, useCallback, memo } from "react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { sidecarFetch } from "@/lib/sidecar";

type EditMode = "inpaint" | "restyle" | "replace";

const EDIT_MODES: { id: EditMode; label: string; desc: string; icon: string }[] = [
  {
    id: "inpaint",
    label: "Inpaint",
    desc: "Mask a region, describe what to fill in",
    icon: "M2 2h3v3H2zM7 2h3v3H7zM2 7h3v3H2z",
  },
  {
    id: "restyle",
    label: "Restyle",
    desc: "Change visual style while keeping motion",
    icon: "M1 5a4 4 0 018 0 4 4 0 01-8 0M5 1v2M5 7v2M1 5h2M7 5h2",
  },
  {
    id: "replace",
    label: "Replace",
    desc: "Swap subject or background entirely",
    icon: "M1 1h3v3H1zM6 6h3v3H6zM4 2h2v1H4zM4 7h2v1H4zM2 4v2h1V4zM7 4v2h1V4z",
  },
];

export const EditVideoPanel = memo(function EditVideoPanel() {
  const selectedShotId = useAppStore((s) => s.selectedShotId);
  const { shots, pipeline, aspectRatio } = useDirectorStore();
  const selectedShot = shots.find((s) => s.id === selectedShotId);

  const [mode, setMode] = useState<EditMode>("restyle");
  const [editPrompt, setEditPrompt] = useState("");
  const [maskDesc, setMaskDesc] = useState("");
  const [strength, setStrength] = useState(0.7);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selectedShot?.video_url && editPrompt.trim().length > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedShot) return;
    setSubmitting(true);
    setSubmitted(false);
    try {
      await sidecarFetch("/generate/submit", {
        method: "POST",
        body: JSON.stringify({
          shot_id: `${selectedShot.id}-edit-${mode}`,
          prompt: editPrompt,
          video_url: selectedShot.video_url,
          edit_mode: mode,
          mask_description: mode === "inpaint" ? maskDesc : undefined,
          strength,
          duration: selectedShot.duration,
          quality: pipeline.video_quality,
          aspect_ratio: aspectRatio,
          model: pipeline.video_model,
          api_key: pipeline.video_api_key,
          base_url: pipeline.video_base_url,
        }),
      });
      setSubmitted(true);
    } catch {
      // handled by toast
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, selectedShot, mode, editPrompt, maskDesc, strength, pipeline, aspectRatio]);

  if (!selectedShot) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1" className="text-nc-text-tertiary/45">
            <rect x="4" y="8" width="24" height="16" rx="2" />
            <path d="M12 14l5 3-5 3z" />
          </svg>
          <span className="text-sm text-nc-text-tertiary">Select a shot to edit its video</span>
        </div>
      </div>
    );
  }

  if (!selectedShot.video_url) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <span className="text-sm text-nc-text-tertiary">Generate a video first, then come back to edit it</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-nc-border px-4 shadow-sm">
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-accent">
          <path d="M9 1.5l1.5 1.5L4 9.5H2.5V8L9 1.5z" />
        </svg>
        <span className="text-sm font-semibold text-nc-text">Edit Video — {selectedShot.title || selectedShot.id}</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-2">
          {EDIT_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center shadow-sm transition-all hover:shadow-md",
                mode === m.id
                  ? "border-nc-accent bg-nc-accent/10 text-nc-accent shadow-md"
                  : "border-nc-border-strong bg-nc-panel text-nc-text-secondary hover:border-nc-text-tertiary/40 hover:bg-nc-panel-hover"
              )}
            >
              <svg width="16" height="16" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="0.8">
                <path d={m.icon} />
              </svg>
              <span className="text-xs font-semibold">{m.label}</span>
            </button>
          ))}
        </div>

        <p className="text-xs leading-relaxed text-nc-text-tertiary">
          {EDIT_MODES.find((m) => m.id === mode)?.desc}
        </p>

        {/* Edit prompt */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-nc-text-secondary">
            {mode === "inpaint" ? "What to fill in" : mode === "restyle" ? "Target style" : "Replacement description"}
          </label>
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            placeholder={
              mode === "inpaint"
                ? "e.g., A golden retriever sitting calmly"
                : mode === "restyle"
                  ? "e.g., Studio Ghibli watercolor style"
                  : "e.g., Replace the background with a sunset beach"
            }
            rows={3}
            className="resize-none rounded-lg border border-nc-border-strong bg-nc-panel px-3 py-2.5 text-sm text-nc-text shadow-sm placeholder:text-nc-text-tertiary/55 focus:border-nc-accent/50 focus:outline-none focus:ring-2 focus:ring-nc-accent/15"
          />
        </div>

        {/* Mask description (inpaint only) */}
        {mode === "inpaint" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-nc-text-secondary">
              Mask region (describe what to mask)
            </label>
            <input
              type="text"
              value={maskDesc}
              onChange={(e) => setMaskDesc(e.target.value)}
              placeholder="e.g., the person on the left side"
              className="rounded-lg border border-nc-border-strong bg-nc-panel px-3 py-2.5 text-sm text-nc-text shadow-sm placeholder:text-nc-text-tertiary/55 focus:border-nc-accent/50 focus:outline-none focus:ring-2 focus:ring-nc-accent/15"
            />
          </div>
        )}

        {/* Strength slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-nc-text-secondary">
              Edit strength
            </label>
            <span className="font-mono text-xs tabular-nums text-nc-text-secondary">
              {Math.round(strength * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={strength}
            onChange={(e) => setStrength(parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-nc-panel accent-nc-accent"
          />
          <div className="flex justify-between text-[10px] text-nc-text-tertiary">
            <span>Subtle</span>
            <span>Complete</span>
          </div>
        </div>

        {/* Tips */}
        <div className="rounded-lg border border-nc-accent/25 bg-nc-accent-muted p-3 text-xs leading-relaxed text-nc-text-secondary shadow-sm">
          {mode === "inpaint" && "Tip: Describe the masked region clearly. Works best for replacing small objects or fixing artifacts."}
          {mode === "restyle" && "Tip: Keep motion intact while changing aesthetics. Lower strength preserves more of the original."}
          {mode === "replace" && "Tip: Best for swapping backgrounds or subjects. Use high strength for dramatic changes."}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={cn(
            "flex h-11 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all",
            canSubmit && !submitting
              ? "bg-nc-accent text-nc-bg shadow-md hover:bg-nc-accent-hover hover:shadow-lg"
              : "cursor-not-allowed bg-nc-panel text-nc-text-tertiary"
          )}
        >
          {submitting ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              Processing...
            </>
          ) : submitted ? (
            "Submitted — check storyboard"
          ) : (
            `Apply ${EDIT_MODES.find((m) => m.id === mode)?.label}`
          )}
        </button>
      </div>
    </div>
  );
});
