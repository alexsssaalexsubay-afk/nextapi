import { useState, useCallback } from "react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { sidecarFetch } from "@/lib/sidecar";

type Tab = "properties" | "prompt" | "extend" | "export";

const TABS: { id: Tab; label: string }[] = [
  { id: "properties", label: "Properties" },
  { id: "prompt", label: "Prompt" },
  { id: "extend", label: "Extend" },
  { id: "export", label: "Export" },
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
    productionBible,
    shotGenerationCards,
    promptReview,
  } = useDirectorStore();

  const selectedShot = shots.find((s) => s.id === selectedShotId);
  const selectedCard = shotGenerationCards.find((c) => c.shot_id === selectedShotId);
  const selectedFindings = promptReview?.findings.filter((f) => f.shot_id === selectedShotId) || [];
  const completedShots = shots.filter((s) => s.status === "succeeded" || s.video_url);

  const [editingPrompt, setEditingPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

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
    try {
      await sidecarFetch("/generate/batch", {
        method: "POST",
        body: JSON.stringify({
          sequential: false,
          shots: [{
            shot_id: selectedShot.id,
            prompt: selectedShot.prompt,
            duration: selectedShot.duration,
            quality: pipeline.video_quality,
            aspect_ratio: aspectRatio,
            generate_audio: pipeline.generate_audio,
            model: pipeline.video_model,
            api_key: pipeline.video_api_key,
            base_url: pipeline.video_base_url,
          }],
        }),
      });
      updateShot(selectedShot.id, { status: "queued", video_url: "", thumbnail_url: "" });
    } catch {
      // handled by toast
    } finally {
      setRegenerating(false);
    }
  }, [selectedShot, pipeline, aspectRatio, updateShot]);

  const handleExtend = useCallback(async (direction: "forward" | "backward") => {
    if (!selectedShot?.video_url) return;
    try {
      await sidecarFetch("/generate/submit", {
        method: "POST",
        body: JSON.stringify({
          shot_id: `${selectedShot.id}-ext-${direction}`,
          prompt: selectedShot.prompt,
          video_url: selectedShot.video_url,
          extend_direction: direction,
          duration: 5,
          quality: pipeline.video_quality,
          aspect_ratio: aspectRatio,
          model: pipeline.video_model,
          api_key: pipeline.video_api_key,
          base_url: pipeline.video_base_url,
        }),
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
    <div className="flex h-48 flex-col border-t border-nc-border bg-nc-surface shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
      {/* Tab bar */}
      <div className="flex h-11 shrink-0 items-center border-b border-nc-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "h-full rounded-t-lg px-4 text-xs font-medium uppercase tracking-[0.12em] transition-all",
              tab === t.id
                ? "border-b-2 border-nc-accent text-nc-accent"
                : "text-nc-text-tertiary hover:text-nc-text-secondary"
            )}
          >
            {t.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 pr-3">
          {completedShots.length > 0 && (
            <span className="rounded-full border border-nc-success/25 bg-nc-success/15 px-3 py-1 text-xs tabular-nums text-nc-success shadow-sm">
              {completedShots.length}/{shots.length}
            </span>
          )}
          {selectedShot && (
            <button
              onClick={regenerateShot}
              disabled={regenerating || isRunning}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-nc-accent/25 bg-nc-accent/10 px-3 py-2 text-xs font-semibold text-nc-accent shadow-sm transition-all hover:bg-nc-accent/20 hover:shadow-md disabled:opacity-40"
            >
              {regenerating ? (
                <div className="h-2 w-2 animate-spin rounded-full border border-nc-accent border-t-transparent" />
              ) : (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M7 4a3 3 0 1 1-.9-2.1" />
                  <path d="M7 1v2H5" />
                </svg>
              )}
              Regenerate
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {tab === "properties" && (
          <div className="text-sm">
            {selectedShot ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-nc-border bg-nc-surface p-3 shadow-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Row label="Shot" value={selectedShot.id} mono accent />
                  <Row label="Duration" value={`${selectedShot.duration}s`} mono />
                  <Row label="Title" value={selectedShot.title} />
                  <Row
                    label="Status"
                    value={selectedShot.video_url ? "Ready" : selectedShot.status}
                    className={cn(
                      selectedShot.video_url ? "text-nc-success" :
                      selectedShot.status === "failed" ? "text-nc-error" :
                      "text-nc-text-tertiary"
                    )}
                  />
                </div>
                </div>

                <div className="mt-1 flex flex-wrap gap-2">
                  {selectedShot.video_url && (
                    <button
                      onClick={() => downloadShot(selectedShot.video_url, selectedShot.id)}
                      className="flex h-10 items-center gap-1.5 rounded-lg border border-nc-accent/25 bg-nc-accent/10 px-3 py-2 text-xs font-semibold text-nc-accent shadow-md transition-all hover:bg-nc-accent/20 hover:shadow-lg"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M5 1v6M2.5 5L5 7.5 7.5 5M1 9h8" />
                      </svg>
                      Download
                    </button>
                  )}
                  <button
                    onClick={startEditing}
                    className="flex h-10 items-center gap-1.5 rounded-lg border border-nc-border bg-nc-panel-hover px-3 py-2 text-xs text-nc-text-secondary shadow-sm transition-all hover:border-nc-border-strong hover:bg-nc-panel-active hover:shadow-md"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <path d="M7.5 1.5l1 1-5 5H2v-1.5l5.5-5.5z" />
                    </svg>
                    Edit Prompt
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-nc-border px-4 py-3 text-sm text-nc-text-tertiary">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1" className="text-nc-text-tertiary/50">
                  <rect x="2" y="3" width="10" height="8" rx="1" />
                  <path d="M5 7h4" />
                </svg>
                Select a shot to inspect
              </div>
            )}
          </div>
        )}

        {tab === "prompt" && (
          <div className="flex flex-col gap-2">
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
                  placeholder="Shot prompt..."
                  className={cn(
                    "flex-1 resize-none rounded-lg border bg-nc-panel p-3 text-sm leading-relaxed text-nc-text shadow-sm outline-none transition-colors",
                    isEditing
                      ? "border-nc-accent/40 focus:ring-2 focus:ring-nc-accent/15"
                      : "border-nc-border hover:border-nc-border-strong"
                  )}
                  rows={4}
                />
                {isEditing && (
                  <div className="flex gap-2">
                    <button
                      onClick={savePrompt}
                      className="rounded-lg bg-nc-accent px-4 py-2 text-xs font-semibold text-nc-bg shadow-md transition-all hover:bg-nc-accent-hover hover:shadow-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="rounded-lg px-4 py-2 text-xs text-nc-text-tertiary transition-colors hover:text-nc-text-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
                  {selectedCard && (
                    <div className="rounded-lg border border-nc-border bg-nc-panel/80 p-3 shadow-sm transition-shadow hover:shadow-md">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-nc-text-secondary">
                          Generation card
                        </span>
                        {selectedCard.risk_flags.length > 0 && (
                          <span className="rounded-full border border-nc-warning/30 bg-nc-warning/15 px-2 py-0.5 text-[10px] text-nc-warning">
                            {selectedCard.risk_flags.length} risks
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-nc-text-secondary">
                        {selectedCard.motion_contract || "One subject action"} · {selectedCard.camera_contract || selectedShot.camera}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-nc-text-tertiary">
                        {selectedCard.reference_contract}
                      </p>
                    </div>
                  )}

                  {(selectedShot.generationParams || productionBible) && (
                    <div className="rounded-lg border border-nc-border bg-nc-panel/80 p-3 shadow-sm transition-shadow hover:shadow-md">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-nc-text-secondary">
                        Render contract
                      </span>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-nc-text-secondary">
                        {selectedShot.generationParams?.constraints ||
                          productionBible?.reference_policy ||
                          "No render contract yet"}
                      </p>
                      {selectedShot.generationParams?.reference_instructions?.length ? (
                        <p className="mt-1 truncate text-xs text-nc-accent">
                          {selectedShot.generationParams.reference_instructions.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                {selectedFindings.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {selectedFindings.map((finding) => (
                      <div
                        key={`${finding.code}-${finding.severity}`}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs leading-relaxed shadow-sm",
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
              <span className="text-sm text-nc-text-tertiary">Select a shot to edit its prompt</span>
            )}
          </div>
        )}

        {tab === "extend" && (
          <div className="text-sm">
            {selectedShot?.video_url ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-nc-text-secondary">
                  Extend this shot forward or backward using Seedance 2.0 video continuation.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleExtend("forward")}
                    className="flex flex-col items-center gap-2 rounded-lg border border-nc-border bg-nc-panel p-4 text-center shadow-sm transition-all hover:border-nc-accent/40 hover:bg-nc-accent/5 hover:shadow-md"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-accent">
                      <path d="M3 8h10M10 5l3 3-3 3" />
                    </svg>
                    <span className="text-xs font-semibold text-nc-text">Extend Forward</span>
                    <span className="text-[10px] text-nc-text-tertiary">Continue the action</span>
                  </button>
                  <button
                    onClick={() => handleExtend("backward")}
                    className="flex flex-col items-center gap-2 rounded-lg border border-nc-border bg-nc-panel p-4 text-center shadow-sm transition-all hover:border-nc-info/40 hover:bg-nc-info/5 hover:shadow-md"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-info">
                      <path d="M13 8H3M6 5L3 8l3 3" />
                    </svg>
                    <span className="text-xs font-semibold text-nc-text">Extend Backward</span>
                    <span className="text-[10px] text-nc-text-tertiary">Add a lead-in</span>
                  </button>
                </div>
                <div className="rounded-lg border border-nc-accent/20 bg-nc-accent-muted p-3 text-xs leading-relaxed text-nc-text-secondary shadow-sm">
                  Seedance 2.0 tip: Extended clips work best when the original is under 10s. The AI will maintain character appearance and scene consistency.
                </div>
              </div>
            ) : (
              <span className="text-nc-text-tertiary">Generate a video first to use extend</span>
            )}
          </div>
        )}

        {tab === "export" && (
          <div className="text-sm">
            {shots.length === 0 ? (
              <span className="text-nc-text-tertiary">No shots generated yet</span>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-nc-text-secondary">
                    {completedShots.length} of {shots.length} clips ready
                  </span>
                  {completedShots.length > 0 && (
                    <button
                      onClick={downloadAll}
                      className="flex h-10 items-center gap-1.5 rounded-lg bg-nc-accent px-4 py-2 text-xs font-semibold text-nc-bg shadow-md transition-all hover:bg-nc-accent-hover hover:shadow-lg"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M5 1v6M2.5 5L5 7.5 7.5 5M1 9h8" />
                      </svg>
                      Download All
                    </button>
                  )}
                </div>

                {/* Export full video */}
                {completedShots.length >= 2 && (
                  <button
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
                    className="flex h-10 items-center gap-1.5 rounded-lg border border-nc-success/40 bg-nc-success/8 px-4 py-2 text-xs font-semibold text-nc-success shadow-sm transition-all hover:bg-nc-success/15 hover:shadow-md"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <path d="M2 3h8v7H2zM4 1v2M8 1v2M2 6h8" />
                    </svg>
                    Export Full Video
                  </button>
                )}

                {/* Progress bar */}
                <div>
                  <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-nc-panel">
                    <div
                      className="h-full rounded-full bg-nc-accent transition-all duration-500"
                      style={{ width: `${(completedShots.length / shots.length) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-nc-text-tertiary">
                    {Math.round((completedShots.length / shots.length) * 100)}% complete
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  {shots.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-xs shadow-sm hover:border-nc-border hover:bg-nc-panel-hover">
                      <span className={cn(
                        "h-[6px] w-[6px] rounded-full",
                        s.video_url ? "bg-nc-success" : s.status === "failed" ? "bg-nc-error" : "bg-nc-text-tertiary/40"
                      )} />
                      <span className="flex-1 truncate text-nc-text-secondary">{s.title || s.id}</span>
                      <span className="font-mono text-xs tabular-nums text-nc-text-tertiary">{s.duration}s</span>
                      {s.video_url ? (
                        <button
                          onClick={() => downloadShot(s.video_url, s.id)}
                          className="text-nc-accent hover:text-nc-accent-hover"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                            <path d="M5 1v6M2.5 5L5 7.5 7.5 5M1 9h8" />
                          </svg>
                        </button>
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
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-nc-text-tertiary">{label}</span>
      <span className={cn(
        "truncate text-sm",
        mono && "font-mono",
        accent ? "text-nc-accent" : "text-nc-text-secondary",
        className
      )}>
        {value}
      </span>
    </div>
  );
}
