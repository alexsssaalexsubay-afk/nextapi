import { memo, useRef, useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";

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
      <div className="flex h-full flex-col bg-nc-surface">
        <div className="flex h-8 items-center justify-between border-b border-nc-border px-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">Timeline</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[11px] text-nc-text-ghost">Generate a plan to populate the timeline</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-nc-surface">
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-nc-border px-4">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">Timeline</span>
          <div className="font-mono text-[10px] tabular-nums text-nc-accent">
            {formatTimecode(playheadPos)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] text-nc-text-ghost">
            <span className="tabular-nums">{totalDuration.toFixed(1)}s</span>
            <span className="text-nc-border-strong">/</span>
            <span className="tabular-nums">{directorShots.length} shots</span>
          </div>

          {/* Zoom control */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTimelineZoom(timelineZoom / 1.5)}
              className="flex h-5 w-5 items-center justify-center rounded text-nc-text-ghost hover:bg-nc-panel-hover hover:text-nc-text-tertiary"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M2 5h6" />
              </svg>
            </button>
            <div className="h-1 w-12 overflow-hidden rounded-full bg-nc-panel">
              <div
                className="h-full rounded-full bg-nc-text-ghost/30 transition-all"
                style={{ width: `${((timelineZoom - 0.25) / 3.75) * 100}%` }}
              />
            </div>
            <button
              onClick={() => setTimelineZoom(timelineZoom * 1.5)}
              className="flex h-5 w-5 items-center justify-center rounded text-nc-text-ghost hover:bg-nc-panel-hover hover:text-nc-text-tertiary"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M2 5h6M5 2v6" />
              </svg>
            </button>
            <span className="w-8 text-right font-mono text-[9px] tabular-nums text-nc-text-ghost">
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
          <div className="sticky top-0 z-10 h-5 border-b border-nc-border bg-nc-surface/90 backdrop-blur-sm">
            {rulerMarks.map(({ time, major }) => (
              <div
                key={time}
                className="absolute top-0 h-full"
                style={{ left: `${time * pxPerSec + 48}px` }}
              >
                <div className={cn("h-full w-px", major ? "bg-nc-border" : "bg-nc-border/40")} />
                {major && (
                  <span className="absolute left-1.5 top-0.5 font-mono text-[8px] tabular-nums text-nc-text-ghost">
                    {time >= 60 ? `${Math.floor(time / 60)}m${Math.floor(time % 60)}s` : `${time}s`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Track label */}
          <div className="absolute left-0 top-5 z-10 flex h-[calc(100%-20px)] w-12 flex-col justify-center border-r border-nc-border bg-nc-surface">
            <div className="flex items-center justify-center">
              <span className="text-[8px] font-medium uppercase tracking-widest text-nc-text-ghost" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
                Video
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
                    "group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-sm)] border transition-all duration-150",
                    colors.bg,
                    isActive
                      ? cn(colors.border, "ring-1", colors.ring, "shadow-md")
                      : cn("border-transparent hover:border-nc-border-strong")
                  )}
                  style={{ width: `${width}px`, minHeight: 52 }}
                >
                  {/* Color strip top */}
                  <div className={cn("h-[2px] w-full", isActive ? "bg-nc-accent" : "bg-transparent")} />

                  {/* Content */}
                  <div className="flex flex-1 flex-col justify-center px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      {hasVideo && (
                        <span className="h-1 w-1 shrink-0 rounded-full bg-nc-success" />
                      )}
                      <span className="truncate font-mono text-[9px] font-medium text-nc-text-secondary">
                        {shot.id}
                      </span>
                    </div>
                    {width > 80 && (
                      <span className="mt-0.5 truncate text-[8px] text-nc-text-ghost">
                        {shot.title}
                      </span>
                    )}
                  </div>

                  {/* Duration tag */}
                  {width > 50 && (
                    <div className="px-2 pb-1">
                      <span className="font-mono text-[7px] tabular-nums text-nc-text-ghost/60">
                        {shot.duration}s
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Audio track */}
          <div className="relative ml-12 flex items-center gap-[2px] border-t border-nc-border/40 px-1 py-1">
            <div className="absolute -left-12 top-0 flex h-full w-12 items-center justify-center border-r border-nc-border bg-nc-surface">
              <span className="text-[8px] font-medium uppercase tracking-widest text-nc-text-ghost" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
                Audio
              </span>
            </div>
            {directorShots.map((shot, i) => {
              const width = shot.duration * pxPerSec;
              return (
                <div
                  key={`audio-${shot.id}`}
                  className="relative flex h-6 items-end overflow-hidden rounded-[var(--radius-sm)] bg-nc-success/10 border border-nc-success/15"
                  style={{ width: `${width}px` }}
                >
                  {Array.from({ length: Math.max(4, Math.floor(width / 3)) }, (_, j) => (
                    <div
                      key={j}
                      className="w-[2px] shrink-0 rounded-t-full bg-nc-success/40"
                      style={{
                        height: `${20 + Math.sin((j + i * 7) * 0.7) * 40 + Math.random() * 20}%`,
                        marginLeft: "1px",
                      }}
                    />
                  ))}
                </div>
              );
            })}
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
