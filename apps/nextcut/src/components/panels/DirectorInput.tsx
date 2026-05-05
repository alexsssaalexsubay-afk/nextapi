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
import { useI18nStore } from "@/stores/i18n-store";

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
  const [expandedSection, setExpandedSection] = useState<string | null>("characters");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, lang } = useI18nStore();

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

      <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto w-full">
        {/* Page Header matching Image 2 */}
        <div className="flex flex-col mb-2">
          <h1 className="text-[36px] leading-[44px] font-bold tracking-tight text-nc-text flex items-center gap-2">
            生成工作流
            <span className="text-nc-accent text-3xl">✨</span>
          </h1>
          <p className="text-[14px] text-nc-text-secondary mt-2 font-medium">
            选择最适合你创意目标的生成方式，配置参数，生成专属视频规划。
          </p>
        </div>

        {/* Input mode toggle - kept for functionality but styled subtly, as it's not explicitly in Image 2 but we need it */}
        <div className="flex items-center justify-between pb-2 mb-4 border-b border-nc-border hidden">
          <div className="flex w-full sm:w-auto items-center gap-6">
            <button
              onClick={() => setUseStructuredPrompt(false)}
              className={cn(
                "pb-3 text-[14px] transition-all whitespace-nowrap -mb-[1px]",
                !useStructuredPrompt
                  ? "border-b-2 border-nc-accent text-nc-accent font-semibold"
                  : "border-b-2 border-transparent text-nc-text-tertiary hover:text-nc-text-secondary"
              )}
            >
              {t("director.freeform")}
            </button>
            <button
              onClick={() => setUseStructuredPrompt(true)}
              className={cn(
                "pb-3 text-[14px] transition-all whitespace-nowrap -mb-[1px]",
                useStructuredPrompt
                  ? "border-b-2 border-nc-accent text-nc-accent font-semibold"
                  : "border-b-2 border-transparent text-nc-text-tertiary hover:text-nc-text-secondary"
              )}
            >
              {t("director.directorMode")}
            </button>
          </div>
          {wordCount > 0 && inputMode === "freeform" && (
            <span className="text-[13px] font-medium tabular-nums text-nc-text-tertiary hidden sm:block pb-3">{wordCount} {t("director.words")}</span>
          )}
        </div>

        {/* Prompt input for freeform mode - normally hidden if we mimic Image 2 strictly, but keeping it functional */}
        {!useStructuredPrompt && (
          <div className="mb-6">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("director.promptPlaceholder")}
              rows={4}
              disabled={isRunning}
              className={cn(
                "w-full resize-none rounded-[16px] border border-nc-border bg-nc-surface p-4 text-[14px] leading-[22px] text-nc-text shadow-sm",
                "placeholder:text-nc-text-tertiary outline-none transition-all duration-200",
                "focus:border-nc-accent focus:ring-1 focus:ring-nc-accent/20 focus:shadow-[0_0_0_2px_rgba(109,94,248,0.1)]",
                "disabled:opacity-40"
              )}
            />
          </div>
        )}

        {/* Tabs to replace Collapsible sections if we want to match Image 2 perfectly, but let's stick to the current flow and just style it like Image 2's content */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setExpandedSection("characters")}
            className={cn(
              "flex items-center gap-2 h-[36px] px-4 rounded-[10px] text-[14px] font-semibold transition-colors shadow-sm border",
              expandedSection === "characters" ? "bg-nc-accent text-white border-transparent" : "bg-nc-surface text-nc-text-secondary border-nc-border hover:bg-[#F5F3FF] hover:text-nc-accent"
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            角色
          </button>
          <button
            onClick={() => setExpandedSection("workflow")}
            className={cn(
              "flex items-center gap-2 h-[36px] px-4 rounded-[10px] text-[14px] font-semibold transition-colors shadow-sm border",
              expandedSection === "workflow" ? "bg-nc-accent text-white border-transparent" : "bg-nc-surface text-nc-text-secondary border-nc-border hover:bg-[#F5F3FF] hover:text-nc-accent"
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            工作流
          </button>
          <button
            onClick={() => setExpandedSection("refs")}
            className={cn(
              "flex items-center gap-2 h-[36px] px-4 rounded-[10px] text-[14px] font-semibold transition-colors shadow-sm border",
              expandedSection === "refs" ? "bg-nc-accent text-white border-transparent" : "bg-nc-surface text-nc-text-secondary border-nc-border hover:bg-[#F5F3FF] hover:text-nc-accent"
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            参考素材
          </button>
        </div>

        <div className="flex-1 py-4">
          {expandedSection === "characters" && (
            <div className="animate-fade-in">
              <CharacterPanel />
            </div>
          )}

          {expandedSection === "workflow" && (
            <div className="animate-fade-in flex flex-col gap-6">
              <WorkflowPresets disabled={isRunning} />

              {/* Style & Ratio inside Workflow tab to match Image 2 */}
              <div className="mt-4 border border-nc-border rounded-[16px] bg-nc-surface overflow-hidden shadow-sm">
                <div className="flex items-center justify-between p-5 border-b border-nc-border bg-nc-bg/50">
                  <div className="flex items-center gap-2 text-[16px] font-semibold text-nc-text">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                    风格和比例
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-text-tertiary"><polyline points="18 15 12 9 6 15"></polyline></svg>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Ratio */}
                    <div>
                      <div className="text-[14px] font-semibold text-nc-text-secondary mb-3">画面比例</div>
                      <div className="flex gap-2">
                        {RATIOS.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setAspectRatio(r.id)}
                            disabled={isRunning}
                            className={cn(
                              "flex flex-1 flex-col items-center gap-1 rounded-[12px] border py-3 transition-all duration-200 disabled:opacity-40 min-w-[70px]",
                              aspectRatio === r.id
                                ? "border-nc-accent bg-nc-accent-dim text-nc-accent shadow-sm"
                                : "border-nc-border bg-nc-surface text-nc-text-secondary hover:bg-[#F5F3FF] hover:text-nc-accent"
                            )}
                          >
                            <span className="text-[14px] font-semibold tabular-nums tracking-wide">{r.label}</span>
                            <span className="text-[12px] font-medium text-nc-text-tertiary">{r.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Style */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[14px] font-semibold text-nc-text-secondary">视觉风格</div>
                        <button className="flex items-center gap-1 text-[13px] font-semibold text-nc-accent">
                          <span className="text-[14px]">✨</span> 智能推荐
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {STYLES.slice(0, 5).map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setStyle(s.id)}
                            disabled={isRunning}
                            className={cn(
                              "flex flex-col items-center gap-2 transition-all duration-200 disabled:opacity-40 shrink-0",
                              style === s.id ? "opacity-100 scale-105" : "opacity-60 hover:opacity-100"
                            )}
                          >
                            <div className={cn(
                              "h-[60px] w-[60px] rounded-[12px] border-[2px] bg-nc-bg flex items-center justify-center text-2xl shadow-sm",
                              style === s.id ? "border-nc-accent" : "border-transparent hover:border-nc-border"
                            )}>
                              {s.icon}
                            </div>
                            <span className={cn("text-[12px] font-medium", style === s.id ? "text-nc-text" : "text-nc-text-secondary")}>{s.label}</span>
                          </button>
                        ))}
                        <button className="flex flex-col items-center justify-center gap-2 opacity-60 hover:opacity-100 shrink-0 ml-2">
                          <div className="h-[60px] w-[60px] rounded-[12px] border border-nc-border bg-nc-surface flex items-center justify-center">
                            <span className="text-[16px] tracking-[2px] font-bold text-nc-text-tertiary">...</span>
                          </div>
                          <span className="text-[12px] font-medium text-nc-text-secondary">更多</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Duration & Shots inside Workflow */}
              <div className="border border-nc-border rounded-[16px] bg-nc-surface overflow-hidden shadow-sm">
                <div className="flex items-center justify-between p-5 border-b border-nc-border bg-nc-bg/50">
                  <div className="flex items-center gap-2 text-[16px] font-semibold text-nc-text">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    镜头和时长
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-text-tertiary"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {/* Simplified static mockup content for now, matching Image 2 loosely */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <div className="text-[14px] font-semibold text-nc-text-secondary mb-3">总时长</div>
                    <div className="flex gap-2">
                      {[4, 6, 8, 10, 15].map((d) => (
                        <button key={d} onClick={() => setDuration(d)} className={cn("flex-1 h-10 rounded-[10px] border text-[13px] font-medium transition-all", duration === d ? "border-nc-accent bg-nc-accent-dim text-nc-accent" : "border-nc-border bg-nc-surface text-nc-text-secondary hover:bg-[#F5F3FF]")}>
                          {d}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-nc-text-secondary mb-3 flex items-center justify-between">镜头数量 (预估)</div>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map((s) => (
                        <button key={s} onClick={() => setNumShots(s)} className={cn("flex-1 h-10 rounded-[10px] border text-[13px] font-medium transition-all", numShots === s ? "border-nc-accent bg-nc-accent-dim text-nc-accent" : "border-nc-border bg-nc-surface text-nc-text-secondary hover:bg-[#F5F3FF]")}>
                          {s} 镜头
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-nc-text-secondary mb-3">镜头运动幅度</div>
                    <button className="w-full h-10 rounded-[10px] border border-nc-border bg-nc-surface px-3 flex items-center justify-between text-[13px] font-medium text-nc-text hover:bg-nc-bg">
                      中等
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {expandedSection === "refs" && (
            <div className="animate-fade-in flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold text-nc-text">参考素材 (可选)</h3>
                <span className="text-[14px] text-nc-text-tertiary">上传参考图或视频，帮助 AI 更好理解你的需求</span>
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed border-nc-border bg-nc-bg py-12 text-[14px] text-nc-text-secondary cursor-pointer transition-all hover:bg-nc-surface hover:border-nc-accent hover:text-nc-accent"
              >
                <div className="flex items-center gap-2 font-semibold text-[15px]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  点击上传或拖拽文件到此处
                </div>
                <div className="text-[12px] text-nc-text-tertiary font-medium">支持 JPG / PNG / MP4 / MOV，单个文件最大 500MB</div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={handleFileUpload} />
              
              {references.length > 0 && (
                <div className="flex flex-wrap gap-4 mt-4">
                  {references.map((ref, i) => (
                    <div key={i} className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[14px] border border-nc-border bg-nc-surface shadow-sm">
                      {ref.type === "image" ? (
                        <img src={ref.url} alt={ref.description} className="h-full w-full object-cover" />
                      ) : ref.type === "video" ? (
                        <video src={ref.url} className="h-full w-full object-cover" muted />
                      ) : (
                        <span className="text-nc-text-tertiary text-[12px] font-medium">Audio</span>
                      )}
                      <button
                        onClick={() => removeReference(i)}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-[10px] bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-4 pb-6 border-t border-nc-border mt-2">
          {isRunning ? (
            <button
              onClick={stopPipeline}
              className="flex h-[40px] w-full max-w-[280px] mx-auto items-center justify-center gap-2 rounded-[12px] border border-nc-error bg-white text-[14px] font-semibold text-nc-error shadow-sm transition-all hover:bg-nc-error hover:text-white"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1" /></svg>
              {t("director.stopPipeline")}
            </button>
          ) : (
            <button
              onClick={runPipeline}
              disabled={!prompt.trim()}
              className={cn(
                "flex h-[44px] w-full max-w-[280px] mx-auto items-center justify-center gap-2 rounded-[12px] text-[14px] font-semibold transition-all duration-200 shadow-sm",
                prompt.trim()
                  ? "bg-nc-accent text-white hover:bg-nc-accent-hover hover:-translate-y-0.5 active:bg-[#4E42CC]"
                  : "bg-[#D9D6FE] text-white cursor-not-allowed"
              )}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor"><polygon points="3,1 13,7 3,13" /></svg>
              {hasPlan ? t("director.replanShots") : t("director.generatePlan")}
            </button>
          )}

          {hasPlan && !isRunning && pendingShots.length > 0 && (
            <button
              onClick={submitVideoGeneration}
              disabled={isGenerating}
              className={cn(
                "flex h-[44px] w-full max-w-[280px] mx-auto mt-2 items-center justify-center gap-2 rounded-[12px] text-[14px] font-semibold transition-all duration-200 shadow-sm",
                isGenerating
                  ? "bg-[#D9D6FE] text-white cursor-wait"
                  : "bg-nc-surface border border-nc-border text-nc-text hover:bg-nc-bg"
              )}
            >
              {isGenerating ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{t("director.submitting")}</>
              ) : (
                <>{t("director.generateXVideos").replace("{count}", pendingShots.length.toString()).replace("{plural}", pendingShots.length > 1 ? "s" : "")}</>
              )}
            </button>
          )}
        </div>

        {/* Status summary */}
        {hasPlan && (
          <div className="flex items-center gap-3 rounded-[14px] border border-nc-border bg-nc-surface p-4 shadow-sm mx-auto max-w-[280px] w-full">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-nc-success" />
              <span className="text-[12px] font-medium text-nc-text-secondary">{shots.length} {t("director.shotsLabel").toLowerCase()}</span>
            </div>
            {shots.filter((s) => s.video_url).length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-nc-accent" />
                <span className="text-[12px] font-medium text-nc-accent">{shots.filter((s) => s.video_url).length} {t("director.rendered")}</span>
              </div>
            )}
            <span className="ml-auto font-mono text-[12px] font-medium tabular-nums text-nc-text-tertiary">
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
  const { lang } = useI18nStore();
  return (
    <div className="border-b border-nc-border overflow-hidden transition-all duration-200">
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between py-4 transition-colors hover:text-nc-text outline-none",
          expanded ? "text-nc-text" : "text-nc-text-secondary"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold uppercase tracking-wider">
            {title}
          </span>
          {lang === "zh" && <span className="text-[12px] font-medium opacity-60 ml-2">{titleZh}</span>}
          {badge && (
            <span className="rounded-full bg-nc-text px-2 py-0.5 font-mono text-[10px] font-bold text-nc-surface shadow-sm">
              {badge}
            </span>
          )}
        </div>
        <svg
          width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className={cn("transition-transform duration-300 opacity-50", expanded ? "rotate-180" : "")}
        >
          <path d="M5 7l5 5 5-5" />
        </svg>
      </button>
      <div
        className={cn(
          "transition-all duration-300 ease-in-out",
          expanded ? "max-h-[1500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="pb-6 pt-2">{children}</div>
      </div>
    </div>
  );
}
