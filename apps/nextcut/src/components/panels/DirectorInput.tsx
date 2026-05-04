import { useState, useCallback, useRef } from "react";
import { useDirectorStore } from "@/stores/director-store";
import { useDirector } from "@/hooks/useDirector";
import { sidecarFetch } from "@/lib/sidecar";
import { cn } from "@/lib/cn";
import { StructuredPromptBuilder } from "@/components/director/StructuredPromptBuilder";
import { WorkflowPresets } from "@/components/director/WorkflowPresets";
import { PipelineStepFlow } from "@/components/director/PipelineStepFlow";
import { CharacterPanel } from "@/components/director/CharacterPanel";
import { PromptQualityMeter } from "@/components/director/PromptQualityMeter";

const STYLES = [
  { id: "cinematic", label: "Cinematic", icon: "🎬" },
  { id: "anime", label: "Anime", icon: "🎨" },
  { id: "documentary", label: "Documentary", icon: "📹" },
  { id: "commercial", label: "Commercial", icon: "📺" },
  { id: "music_video", label: "Music Video", icon: "🎵" },
  { id: "noir", label: "Noir", icon: "🌑" },
  { id: "dreamy", label: "Dreamy", icon: "☁️" },
  { id: "cyberpunk", label: "Cyberpunk", icon: "🌃" },
  { id: "wuxia", label: "Wuxia", icon: "⚔️" },
  { id: "social_short", label: "Short Form", icon: "📱" },
  { id: "minimal", label: "Minimal", icon: "◻️" },
  { id: "vintage", label: "Vintage", icon: "📼" },
];

const RATIOS = [
  { id: "16:9", label: "16:9", desc: "Landscape" },
  { id: "9:16", label: "9:16", desc: "Portrait" },
  { id: "1:1", label: "1:1", desc: "Square" },
  { id: "4:3", label: "4:3", desc: "Classic" },
  { id: "21:9", label: "21:9", desc: "Ultra-wide" },
];

type InputMode = "freeform" | "structured";

export function DirectorInput() {
  const {
    prompt, setPrompt, style, setStyle, numShots, setNumShots,
    duration, setDuration, aspectRatio, setAspectRatio,
    isRunning, shots, pipeline, references, addReference, removeReference,
    useStructuredPrompt, setUseStructuredPrompt, pipelineStep,
  } = useDirectorStore();
  const { runPipeline, stopPipeline } = useDirector();
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputMode: InputMode = useStructuredPrompt ? "structured" : "freeform";
  const hasPlan = shots.length > 0;
  const pendingShots = shots.filter((s) => !s.video_url && s.status !== "succeeded");
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;

  const submitVideoGeneration = useCallback(async () => {
    if (pendingShots.length === 0) return;
    setIsGenerating(true);
    try {
      await sidecarFetch("/generate/batch", {
        method: "POST",
        body: JSON.stringify({
          sequential: true,
          shots: pendingShots.map((s) => ({
            shot_id: s.id,
            prompt: s.prompt,
            duration: s.duration,
            quality: pipeline.video_quality,
            aspect_ratio: aspectRatio,
            generate_audio: pipeline.generate_audio,
            model: pipeline.video_model,
            api_key: pipeline.video_api_key,
            base_url: pipeline.video_base_url,
          })),
        }),
      });
    } catch {
      // handled by toast
    } finally {
      setIsGenerating(false);
    }
  }, [pendingShots, pipeline, aspectRatio]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith("video") ? "video" as const
        : file.type.startsWith("audio") ? "audio" as const
        : "image" as const;
      addReference({ url, type, role: "reference", description: file.name });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [addReference]);

  const toggleSection = (id: string) =>
    setExpandedSection(expandedSection === id ? null : id);

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      {/* Pipeline step indicator */}
      {pipelineStep !== "idle" && pipelineStep !== "complete" && (
        <div className="border-b border-nc-border bg-nc-surface">
          <PipelineStepFlow />
        </div>
      )}

      <div className="flex flex-col gap-4 p-4">
        {/* Input mode toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-nc-border bg-nc-panel p-0.5">
            <button
              onClick={() => setUseStructuredPrompt(false)}
              className={cn(
                "rounded-[var(--radius-sm)] px-3 py-1 text-[10px] font-medium transition-colors",
                !useStructuredPrompt
                  ? "bg-nc-panel-active text-nc-text shadow-sm"
                  : "text-nc-text-ghost hover:text-nc-text-tertiary"
              )}
            >
              Freeform
            </button>
            <button
              onClick={() => setUseStructuredPrompt(true)}
              className={cn(
                "rounded-[var(--radius-sm)] px-3 py-1 text-[10px] font-medium transition-colors",
                useStructuredPrompt
                  ? "bg-nc-panel-active text-nc-text shadow-sm"
                  : "text-nc-text-ghost hover:text-nc-text-tertiary"
              )}
            >
              Director Mode
            </button>
          </div>
          {wordCount > 0 && inputMode === "freeform" && (
            <span className="text-[9px] tabular-nums text-nc-text-ghost">{wordCount} words</span>
          )}
        </div>

        {/* Prompt input */}
        {inputMode === "freeform" ? (
          <div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your video idea, paste a script, or write a detailed brief...&#10;&#10;Tip: More detail = better results. Include character descriptions, emotions, settings, and camera movements."
              rows={5}
              disabled={isRunning}
              className={cn(
                "w-full resize-none rounded-[var(--radius-lg)] border bg-nc-panel p-3 text-[13px] leading-relaxed text-nc-text",
                "placeholder:text-nc-text-ghost/60 outline-none transition-all duration-200",
                "focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10",
                "disabled:opacity-40",
                isRunning ? "border-nc-border" : "border-nc-border hover:border-nc-border-strong"
              )}
            />
          </div>
        ) : (
          <StructuredPromptBuilder disabled={isRunning} />
        )}

        {/* Prompt quality meter */}
        {prompt.trim() && inputMode === "freeform" && (
          <PromptQualityMeter prompt={prompt} />
        )}

        {/* Characters */}
        <CollapsibleSection
          title="Characters"
          titleZh="角色管理"
          expanded={expandedSection === "characters"}
          onToggle={() => toggleSection("characters")}
        >
          <CharacterPanel />
        </CollapsibleSection>

        {/* Collapsible sections */}
        <CollapsibleSection
          title="Seedance Workflow"
          titleZh="生成工作流"
          expanded={expandedSection === "workflow"}
          onToggle={() => toggleSection("workflow")}
        >
          <WorkflowPresets disabled={isRunning} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Visual Style & Ratio"
          titleZh="风格和比例"
          expanded={expandedSection === "style"}
          onToggle={() => toggleSection("style")}
        >
          {/* Style chips */}
          <div className="mb-3">
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  disabled={isRunning}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all duration-150 disabled:opacity-40",
                    style === s.id
                      ? "border-nc-accent/40 bg-nc-accent-dim text-nc-accent"
                      : "border-nc-border text-nc-text-tertiary hover:border-nc-border-strong hover:text-nc-text-secondary"
                  )}
                >
                  <span className="text-[9px]">{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div className="flex gap-1.5">
            {RATIOS.map((r) => (
              <button
                key={r.id}
                onClick={() => setAspectRatio(r.id)}
                disabled={isRunning}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 transition-all duration-150 disabled:opacity-40",
                  aspectRatio === r.id
                    ? "border-nc-accent/40 bg-nc-accent-dim text-nc-accent"
                    : "border-nc-border text-nc-text-tertiary hover:border-nc-border-strong"
                )}
              >
                <span className="text-[11px] font-semibold tabular-nums">{r.label}</span>
                <span className="text-[8px] text-nc-text-ghost">{r.desc}</span>
              </button>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Shots & Duration"
          titleZh="镜头和时长"
          expanded={expandedSection === "params"}
          onToggle={() => toggleSection("params")}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] text-nc-text-tertiary">Shots</label>
              <div className="flex items-center gap-2">
                <input type="range" min={1} max={24} value={numShots} onChange={(e) => setNumShots(parseInt(e.target.value))} disabled={isRunning} className="flex-1" />
                <span className="w-6 text-center font-mono text-[12px] tabular-nums text-nc-text-secondary">{numShots}</span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] text-nc-text-tertiary">Duration (s)</label>
              <div className="flex items-center gap-2">
                <input type="range" min={4} max={15} value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} disabled={isRunning} className="flex-1" />
                <span className="w-6 text-center font-mono text-[12px] tabular-nums text-nc-text-secondary">{duration}</span>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Reference Assets"
          titleZh="参考素材"
          expanded={expandedSection === "refs"}
          onToggle={() => toggleSection("refs")}
          badge={references.length > 0 ? String(references.length) : undefined}
        >
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={handleFileUpload} />
          {references.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {references.map((ref, i) => (
                <div key={i} className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-nc-border bg-nc-panel">
                  {ref.type === "image" ? (
                    <img src={ref.url} alt={ref.description} className="h-full w-full object-cover" />
                  ) : ref.type === "video" ? (
                    <video src={ref.url} className="h-full w-full object-cover" muted />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-nc-text-ghost">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1" />
                      <polygon points="6.5,5 11,8 6.5,11" fill="currentColor" />
                    </svg>
                  )}
                  <button
                    onClick={() => removeReference(i)}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-nc-error text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                  >
                    <svg width="6" height="6" viewBox="0 0 6 6" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l4 4M5 1l-4 4" /></svg>
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-nc-border text-nc-text-ghost hover:border-nc-border-strong hover:text-nc-text-tertiary"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3v8M3 7h8" /></svg>
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-nc-border py-4 text-[10px] text-nc-text-ghost transition-colors hover:border-nc-border-strong hover:text-nc-text-tertiary"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="1" y="2" width="12" height="10" rx="1.5" />
                <circle cx="4.5" cy="5.5" r="1.5" />
                <path d="M1 10l3.5-3.5L7 9l2-2 4 4" />
              </svg>
              Drop images, video, or audio for character/style reference
            </div>
          )}
        </CollapsibleSection>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {isRunning ? (
            <button
              onClick={stopPipeline}
              className="flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-nc-error/30 bg-nc-error/10 text-[12px] font-semibold text-nc-error transition-colors hover:bg-nc-error/20"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1" /></svg>
              Stop Pipeline
            </button>
          ) : (
            <button
              onClick={runPipeline}
              disabled={!prompt.trim()}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] text-[13px] font-semibold transition-all duration-200",
                prompt.trim()
                  ? "bg-nc-accent text-nc-bg shadow-lg shadow-nc-accent/15 hover:bg-nc-accent-hover hover:shadow-xl hover:shadow-nc-accent/20"
                  : "bg-nc-panel text-nc-text-ghost cursor-not-allowed"
              )}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="3,1 13,7 3,13" /></svg>
              {hasPlan ? "Re-plan Shots" : "Generate Plan"}
            </button>
          )}

          {hasPlan && !isRunning && pendingShots.length > 0 && (
            <button
              onClick={submitVideoGeneration}
              disabled={isGenerating}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] text-[12px] font-semibold transition-all duration-200",
                isGenerating
                  ? "bg-nc-info/15 text-nc-info cursor-wait"
                  : "border border-nc-accent/30 bg-nc-accent/10 text-nc-accent hover:bg-nc-accent/20"
              )}
            >
              {isGenerating ? (
                <><div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-nc-info border-t-transparent" />Submitting...</>
              ) : (
                <>Generate {pendingShots.length} Video{pendingShots.length > 1 ? "s" : ""}</>
              )}
            </button>
          )}
        </div>

        {/* Status summary */}
        {hasPlan && (
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-nc-border bg-nc-surface px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-nc-success" />
              <span className="text-[10px] text-nc-text-secondary">{shots.length} shots</span>
            </div>
            {shots.filter((s) => s.video_url).length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-nc-accent" />
                <span className="text-[10px] text-nc-accent">{shots.filter((s) => s.video_url).length} rendered</span>
              </div>
            )}
            <span className="ml-auto font-mono text-[9px] tabular-nums text-nc-text-ghost">
              {shots.reduce((s, sh) => s + sh.duration, 0).toFixed(1)}s
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  titleZh,
  expanded,
  onToggle,
  badge,
  children,
}: {
  title: string;
  titleZh: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">
            {title}
          </span>
          <span className="text-[9px] text-nc-text-ghost">{titleZh}</span>
          {badge && (
            <span className="rounded-full bg-nc-accent/15 px-1.5 py-0.5 text-[8px] font-medium text-nc-accent">
              {badge}
            </span>
          )}
        </div>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"
          className={cn("text-nc-text-ghost transition-transform", expanded && "rotate-180")}
        >
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>
      {expanded && <div className="border-t border-nc-border px-3 pb-3 pt-2.5">{children}</div>}
    </div>
  );
}
