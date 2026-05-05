import { memo, useRef, useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { useI18nStore } from "@/stores/i18n-store";

const PX_PER_SECOND_BASE = 60;

const TRACK_COLORS = [
  { bg: "bg-nc-accent/25", border: "border-nc-accent/30", ring: "ring-nc-accent/40" },
  { bg: "bg-nc-info/25", border: "border-nc-info/30", ring: "ring-nc-info/40" },
  { bg: "bg-purple-500/25", border: "border-purple-500/30", ring: "ring-purple-500/40" },
  { bg: "bg-nc-error/20", border: "border-nc-error/25", ring: "ring-nc-error/35" },
  { bg: "bg-nc-success/25", border: "border-nc-success/30", ring: "ring-nc-success/40" },
  { bg: "bg-pink-500/25", border: "border-pink-500/30", ring: "ring-pink-500/40" },
  { bg: "bg-cyan-500/25", border: "border-cyan-500/30", ring: "ring-cyan-500/40" },
  { bg: "bg-lime-500/25", border: "border-lime-500/30", ring: "ring-lime-500/40" },
];

export const TimelineEditor = memo(function TimelineEditor() {
  const { selectedShotId, setSelectedShotId, timelineZoom, setTimelineZoom } = useAppStore();
  const directorShots = useDirectorStore((s) => s.shots);
  const { t } = useI18nStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [playheadPos, setPlayheadPos] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  const pxPerSec = PX_PER_SECOND_BASE * timelineZoom;
  const totalDuration = directorShots.reduce((sum, s) => sum + s.duration, 0);
  const totalWidth = Math.max(totalDuration * pxPerSec + 120, 600);

  const handleScrub = useCallback((e: React.MouseEvent) => {
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - 48;
    const time = Math.max(0, x / pxPerSec);
    setPlayheadPos(time);

    let acc = 0;
    for (const shot of directorShots) {
      if (time >= acc && time < acc + shot.duration) {
        setSelectedShotId(shot.id);
        break;
      }
      acc += shot.duration;
    }
  }, [pxPerSec, directorShots, setSelectedShotId]);

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const handleMove = (e: MouseEvent) => {
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft - 48;
      setPlayheadPos(Math.max(0, x / pxPerSec));
    };
    const handleUp = () => setIsDraggingPlayhead(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDraggingPlayhead, pxPerSec]);

  const formatTimecode = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const f = Math.floor((secs % 1) * 24);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  };

  const rulerMarks = [];
  const step = timelineZoom >= 2 ? 0.5 : timelineZoom >= 1 ? 1 : 2;
  for (let t = 0; t <= totalDuration + 2; t += step) {
    const isMajor = t % (step >= 1 ? 1 : 2) === 0 && Number.isInteger(t);
    rulerMarks.push({ time: t, major: isMajor });
  }

  if (directorShots.length === 0) {
    return (
      <div className="flex h-full flex-col bg-nc-surface border-t border-nc-border">
        <div className="flex h-[56px] items-center justify-between border-b border-nc-border bg-nc-surface px-8 shadow-sm">
          <span className="text-[14px] font-semibold text-nc-text">{t("timeline.title")}</span>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden opacity-40">
          <div className="h-8 border-b border-nc-border bg-nc-surface/95" />
          
          {/* Skeletal Tracks */}
          <div className="relative flex-1 py-4 px-14 flex flex-col gap-8">
            <div className="absolute left-0 top-0 h-full w-14 border-r border-nc-border" />
            
            {/* Video Track Skeleton */}
            <div className="relative">
              <div className="absolute -left-14 top-0 h-full w-14 flex items-center justify-center">
                <span className="text-[12px] font-semibold tracking-widest text-nc-text-tertiary" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>VIDEO</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-16 w-48 rounded-[12px] border border-dashed border-nc-border-strong bg-nc-panel/30" />
                <div className="h-16 w-32 rounded-[12px] border border-dashed border-nc-border-strong bg-nc-panel/30" />
                <div className="h-16 w-64 rounded-[12px] border border-dashed border-nc-border-strong bg-nc-panel/30" />
              </div>
            </div>

            {/* Audio Track Skeleton */}
            <div className="relative">
              <div className="absolute -left-14 top-0 h-full w-14 flex items-center justify-center">
                <span className="text-[12px] font-semibold tracking-widest text-nc-text-tertiary" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>AUDIO</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-10 w-48 rounded-[10px] border border-dashed border-nc-border bg-nc-panel/20" />
                <div className="h-10 w-32 rounded-[10px] border border-dashed border-nc-border bg-nc-panel/20" />
                <div className="h-10 w-64 rounded-[10px] border border-dashed border-nc-border bg-nc-panel/20" />
              </div>
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center mt-12">
              <span className="text-[14px] font-medium text-nc-text-secondary bg-nc-bg border border-nc-border px-6 py-3 rounded-[999px] shadow-sm">{t("timeline.empty")}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-nc-surface border-t border-nc-border">
      {/* Header */}
      <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-nc-border bg-nc-surface px-8 shadow-sm">
        <div className="flex items-center gap-6">
          <span className="text-[14px] font-semibold text-nc-text">{t("timeline.title")}</span>
          <div className="font-mono text-[14px] font-semibold tabular-nums text-nc-text">
            {formatTimecode(playheadPos)}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 font-mono text-[13px] font-medium text-nc-text-secondary bg-nc-bg px-4 py-1.5 rounded-[12px] border border-nc-border">
            <span className="tabular-nums">{totalDuration.toFixed(1)}s</span>
            <span className="text-nc-border-strong">/</span>
            <span className="tabular-nums">{directorShots.length} {t("timeline.shots")}</span>
          </div>

          {/* Zoom control */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTimelineZoom(timelineZoom / 1.5)}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-nc-border bg-nc-panel text-nc-text-tertiary shadow-sm transition-all hover:bg-[#F5F3FF] hover:text-nc-accent hover:shadow-md"
            >
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 scale-110">
                <path d="M2 5h6" />
              </svg>
            </button>
            <div className="h-[6px] w-16 overflow-hidden rounded-[999px] border border-nc-border/50 bg-nc-panel shadow-inner">
              <div
                className="h-full rounded-[999px] bg-nc-text-tertiary/40 transition-all"
                style={{ width: `${((timelineZoom - 0.25) / 3.75) * 100}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setTimelineZoom(timelineZoom * 1.5)}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-nc-border bg-nc-panel text-nc-text-tertiary shadow-sm transition-all hover:bg-[#F5F3FF] hover:text-nc-accent hover:shadow-md"
            >
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 scale-110">
                <path d="M2 5h6M5 2v6" />
              </svg>
            </button>
            <span className="min-w-[3rem] text-right font-mono text-[13px] font-medium tabular-nums text-nc-text-tertiary">
              {Math.round(timelineZoom * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable area */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-x-auto overflow-y-hidden"
        onMouseDown={(e) => {
          if (e.button === 0 && e.target === e.currentTarget) {
            handleScrub(e);
          }
        }}
      >
        <div className="relative" style={{ width: totalWidth, minHeight: "100%" }}>
          {/* Ruler */}
          <div className="sticky top-0 z-10 h-6 border-b border-nc-border bg-nc-surface/95 shadow-sm backdrop-blur-sm">
            {rulerMarks.map(({ time, major }) => (
              <div
                key={time}
                className="absolute top-0 h-full"
                style={{ left: `${time * pxPerSec + 48}px` }}
              >
                <div className={cn("h-full w-px", major ? "bg-nc-border" : "bg-nc-border/40")} />
                {major && (
                  <span className="absolute left-1.5 top-1 font-mono text-xs tabular-nums text-nc-text-tertiary">
                    {time >= 60 ? `${Math.floor(time / 60)}m${Math.floor(time % 60)}s` : `${time}s`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Track label */}
          <div className="absolute left-0 top-6 z-10 flex h-[calc(100%-24px)] w-12 flex-col justify-center border-r border-nc-border bg-nc-surface shadow-sm">
            <div className="flex items-center justify-center">
              <span className="text-xs font-medium uppercase tracking-widest text-nc-text-tertiary" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
                {t("timeline.video")}
              </span>
            </div>
          </div>

          {/* Shot clips */}
          <div className="relative ml-12 flex items-start gap-[2px] px-1 py-3">
            {directorShots.map((shot, i) => {
              const colors = TRACK_COLORS[i % TRACK_COLORS.length];
              const isActive = selectedShotId === shot.id;
              const width = shot.duration * pxPerSec;
              const hasVideo = !!shot.video_url;

              return (
                <button
                  key={shot.id}
                  onClick={() => setSelectedShotId(shot.id)}
                  className={cn(
                    "group relative flex flex-col justify-between overflow-hidden rounded-lg border border-nc-border/60 bg-nc-panel/20 shadow-sm transition-all duration-150 hover:shadow-md",
                    colors.bg,
                    isActive
                      ? cn(colors.border, "ring-1", colors.ring, "shadow-md hover:shadow-lg")
                      : cn("hover:border-nc-border-strong")
                  )}
                  style={{ width: `${width}px`, minHeight: 52 }}
                >
                  {/* Color strip top */}
                  <div className={cn("h-[2px] w-full", isActive ? "bg-nc-accent" : "bg-transparent")} />

                  {/* Content */}
                  <div className="flex flex-1 flex-col justify-center px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      {hasVideo && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nc-success shadow-sm" />
                      )}
                      <span className="truncate font-mono text-xs font-medium text-nc-text">
                        {shot.id}
                      </span>
                    </div>
                    {width > 80 && (
                      <span className="mt-0.5 truncate text-xs text-nc-text-tertiary">
                        {shot.title}
                      </span>
                    )}
                  </div>

                  {/* Duration tag */}
                  {width > 50 && (
                    <div className="px-2.5 pb-2">
                      <span className="font-mono text-xs tabular-nums text-nc-text-tertiary/80">
                        {shot.duration}s
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Audio track */}
          <div className="relative ml-12 flex flex-col gap-[2px] border-t border-nc-border px-1 py-2 shadow-sm">
            <div className="absolute -left-12 top-0 flex h-full w-12 items-center justify-center border-r border-nc-border bg-nc-surface shadow-sm">
              <span className="text-xs font-medium uppercase tracking-widest text-nc-text-tertiary" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
                {t("timeline.audio")}
              </span>
            </div>
            <div className="flex items-center gap-[2px]">
              {directorShots.map((shot, i) => {
                const width = shot.duration * pxPerSec;
                const hasDialogue = !!shot.audio?.dialogue;
                return (
                  <div
                    key={`audio-${shot.id}`}
                    className={cn(
                      "relative flex flex-col justify-end overflow-hidden rounded-lg border px-1.5 pb-1.5 shadow-sm transition-shadow hover:shadow-md",
                      hasDialogue 
                        ? "bg-nc-info/10 border-nc-info/30 hover:border-nc-info/50 min-h-[52px]" 
                        : "bg-nc-success/10 border-nc-success/25 h-7"
                    )}
                    style={{ width: `${width}px` }}
                    title={shot.audio?.dialogue || "Ambient"}
                  >
                    {hasDialogue && (
                      <div className="absolute left-1.5 right-1 top-1.5 text-xs font-medium leading-tight text-nc-info truncate opacity-95">
                        "{shot.audio?.dialogue}"
                      </div>
                    )}
                    <div className="flex items-end gap-[1px] opacity-70">
                      {Array.from({ length: Math.max(4, Math.floor(width / 4)) }, (_, j) => (
                        <div
                          key={j}
                          className={cn(
                            "w-[2px] shrink-0 rounded-t-full",
                            hasDialogue ? "bg-nc-info/40" : "bg-nc-success/40"
                          )}
                          style={{
                            height: `${(hasDialogue ? 10 : 20) + Math.sin((j + i * 7) * 0.7) * (hasDialogue ? 30 : 40) + Math.random() * 20}px`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 z-20 cursor-col-resize"
            style={{ left: `${playheadPos * pxPerSec + 48}px`, height: "100%" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDraggingPlayhead(true);
            }}
          >
            <div className="absolute -left-[4px] top-0 z-20">
              <svg width="9" height="12" viewBox="0 0 9 12" fill="currentColor" className="text-nc-accent">
                <path d="M0 0h9v8l-4.5 4L0 8V0z" />
              </svg>
            </div>
            <div className="h-full w-px bg-nc-accent" />
          </div>
        </div>
      </div>
    </div>
  );
});
