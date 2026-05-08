import { memo, useRef, useCallback, useState, useEffect } from "react";
import { Camera, CheckCircle2, Clock3, Minus, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { useI18nStore } from "@/stores/i18n-store";

const PX_PER_SECOND_BASE = 60;

const TRACK_COLORS = [
  { bg: "bg-nc-accent/25", border: "border-nc-accent/30", ring: "ring-nc-accent/40" },
  { bg: "bg-nc-info/25", border: "border-nc-info/30", ring: "ring-nc-info/40" },
  { bg: "bg-nc-success/25", border: "border-nc-success/30", ring: "ring-nc-success/40" },
  { bg: "bg-nc-warning/20", border: "border-nc-warning/30", ring: "ring-nc-warning/35" },
  { bg: "bg-nc-error/15", border: "border-nc-error/25", ring: "ring-nc-error/30" },
];

function shotStatusLabel(status?: string, hasVideo?: boolean) {
  if (hasVideo) return "已生成";
  if (status === "failed") return "失败";
  if (status === "generating" || status === "processing") return "生成中";
  if (status === "queued") return "排队中";
  if (status === "planned" || status === "pending") return "已规划";
  return "待生成";
}

export const TimelineEditor = memo(function TimelineEditor() {
  const { selectedShotId, setSelectedShotId, timelineZoom, setTimelineZoom } = useAppStore();
  const directorShots = useDirectorStore((s) => s.shots);
  const updateShot = useDirectorStore((s) => s.updateShot);
  const { t } = useI18nStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const previousSelectedSignatureRef = useRef<string | null>(null);
  const [playheadPos, setPlayheadPos] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ shotId: string; label: string } | null>(null);

  const pxPerSec = PX_PER_SECOND_BASE * timelineZoom;
  const totalDuration = directorShots.reduce((sum, s) => sum + s.duration, 0);
  const totalWidth = Math.max(totalDuration * pxPerSec + 120, 600);
  const selectedShot = directorShots.find((shot) => shot.id === selectedShotId) || directorShots[0];
  const selectedStart = directorShots.slice(0, Math.max(0, directorShots.findIndex((shot) => shot.id === selectedShot?.id))).reduce((sum, shot) => sum + shot.duration, 0);

  const findShotAtTime = useCallback((time: number) => {
    let acc = 0;
    for (const shot of directorShots) {
      if (time >= acc && time < acc + shot.duration) return shot;
      acc += shot.duration;
    }
    return directorShots[directorShots.length - 1] || null;
  }, [directorShots]);

  const handleScrub = useCallback((e: React.MouseEvent) => {
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - 48;
    const time = Math.max(0, x / pxPerSec);
    setPlayheadPos(time);
    const shot = findShotAtTime(time);
    if (shot) setSelectedShotId(shot.id);
  }, [findShotAtTime, pxPerSec, setSelectedShotId]);

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const handleMove = (e: MouseEvent) => {
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft - 48;
      const time = Math.max(0, Math.min(totalDuration, x / pxPerSec));
      setPlayheadPos(time);
      const shot = findShotAtTime(time);
      if (shot) setSelectedShotId(shot.id);
    };
    const handleUp = () => setIsDraggingPlayhead(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [findShotAtTime, isDraggingPlayhead, pxPerSec, setSelectedShotId, totalDuration]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !selectedShot) return;
    const targetLeft = Math.max(0, selectedStart * pxPerSec - 120);
    container.scrollTo({ left: targetLeft, behavior: "smooth" });
    if (!isDraggingPlayhead) setPlayheadPos(selectedStart);
  }, [isDraggingPlayhead, pxPerSec, selectedShot, selectedStart]);

  useEffect(() => {
    if (!selectedShot) return;
    const signature = [
      selectedShot.id,
      selectedShot.title,
      selectedShot.duration,
      selectedShot.status,
      selectedShot.camera,
      selectedShot.generationParams?.shot_script,
    ].join("|");
    if (previousSelectedSignatureRef.current && previousSelectedSignatureRef.current !== signature) {
      setSyncNotice({ shotId: selectedShot.id, label: `${selectedShot.title || `镜头 ${selectedShot.index}`} 已同步到时间线` });
    }
    previousSelectedSignatureRef.current = signature;
  }, [selectedShot]);

  useEffect(() => {
    if (!syncNotice) return;
    const timer = window.setTimeout(() => setSyncNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [syncNotice]);

  const changeSelectedDuration = useCallback((delta: number) => {
    if (!selectedShot) return;
    updateShot(selectedShot.id, { duration: Math.max(2, Math.min(15, Number((selectedShot.duration + delta).toFixed(1)))) });
  }, [selectedShot, updateShot]);

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
          <div className="h-9 border-b border-nc-border bg-nc-surface/95" />
          
          {/* Skeletal Tracks */}
          <div className="relative flex-1 py-4 px-14 flex flex-col gap-8">
            <div className="absolute left-0 top-0 h-full w-14 border-r border-nc-border" />
            
            {/* Video Track Skeleton */}
            <div className="relative">
              <div className="absolute -left-14 top-0 h-full w-14 flex items-center justify-center">
                <span className="text-[12px] font-semibold tracking-widest text-nc-text-tertiary" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>视频</span>
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
                <span className="text-[12px] font-semibold tracking-widest text-nc-text-tertiary" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>音频</span>
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
          {selectedShot && (
            <div className="hidden min-h-9 max-w-[520px] items-center gap-3 rounded-[13px] border border-nc-border bg-white px-4 py-2 shadow-sm xl:flex">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#F5F3FF] text-nc-accent">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold leading-5 text-nc-text">{selectedShot.title}</span>
                <span className="block truncate text-[12px] leading-4 text-nc-text-tertiary">{selectedShot.generationParams?.shot_script || selectedShot.camera || "等待镜头合约"}</span>
              </span>
              {syncNotice?.shotId === selectedShot.id && (
                <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-nc-success/10 px-2.5 py-1 text-[12px] font-semibold leading-4 text-nc-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  已同步
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          {selectedShot && (
            <div className="hidden items-center gap-2 lg:flex">
              <button
                type="button"
                aria-label="缩短当前镜头"
                onClick={() => changeSelectedDuration(-0.5)}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-nc-border bg-white text-nc-text-secondary shadow-sm transition-all hover:border-nc-accent/40 hover:text-nc-accent"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-[86px] rounded-[10px] border border-nc-border bg-nc-bg px-3 py-1.5 text-center font-mono text-[12px] font-semibold tabular-nums text-nc-text">
                S{selectedShot.index} · {selectedShot.duration}s
              </div>
              <button
                type="button"
                aria-label="延长当前镜头"
                onClick={() => changeSelectedDuration(0.5)}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-nc-border bg-white text-nc-text-secondary shadow-sm transition-all hover:border-nc-accent/40 hover:text-nc-accent"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <select
                aria-label="当前镜头状态"
                value={selectedShot.status}
                onChange={(event) => updateShot(selectedShot.id, { status: event.target.value })}
                className="h-9 rounded-[10px] border border-nc-border bg-white px-3 text-[12px] font-semibold text-nc-text-secondary shadow-sm outline-none transition-all focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              >
                <option value="planned">已规划</option>
                <option value="pending">待生成</option>
                <option value="queued">排队中</option>
                <option value="generating">生成中</option>
                <option value="succeeded">已生成</option>
                <option value="failed">失败</option>
              </select>
            </div>
          )}
          <div className="flex min-h-9 items-center gap-3 rounded-[12px] border border-nc-border bg-nc-bg px-4 py-2 font-mono text-[13px] font-medium leading-5 text-nc-text-secondary">
            <Clock3 className="h-4 w-4 text-nc-text-tertiary" />
            <span className="tabular-nums">{totalDuration.toFixed(1)}s</span>
            <span className="text-nc-border-strong">/</span>
            <span className="tabular-nums">{directorShots.length} {t("timeline.shots")}</span>
          </div>

          {/* Zoom control */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="缩小时间线"
              onClick={() => setTimelineZoom(timelineZoom / 1.5)}
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-nc-border bg-nc-panel text-nc-text-tertiary shadow-sm transition-all hover:bg-[#F5F3FF] hover:text-nc-accent hover:shadow-md"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="h-[6px] w-16 overflow-hidden rounded-[999px] border border-nc-border/50 bg-nc-panel shadow-inner">
              <div
                className="h-full rounded-[999px] bg-nc-text-tertiary/40 transition-all"
                style={{ width: `${((timelineZoom - 0.25) / 3.75) * 100}%` }}
              />
            </div>
            <button
              type="button"
              aria-label="放大时间线"
              onClick={() => setTimelineZoom(timelineZoom * 1.5)}
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-nc-border bg-nc-panel text-nc-text-tertiary shadow-sm transition-all hover:bg-[#F5F3FF] hover:text-nc-accent hover:shadow-md"
            >
              <Plus className="h-4 w-4" />
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
          <div className="sticky top-0 z-10 h-7 border-b border-nc-border bg-nc-surface/95 shadow-sm backdrop-blur-sm">
            {rulerMarks.map(({ time, major }) => (
              <div
                key={time}
                className="absolute top-0 h-full"
                style={{ left: `${time * pxPerSec + 48}px` }}
              >
                <div className={cn("h-full w-px", major ? "bg-nc-border" : "bg-nc-border/40")} />
                {major && (
                  <span className="absolute left-2 top-1.5 font-mono text-[12px] leading-4 tabular-nums text-nc-text-tertiary">
                    {time >= 60 ? `${Math.floor(time / 60)}m${Math.floor(time % 60)}s` : `${time}s`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Track label */}
          <div className="absolute left-0 top-7 z-10 flex h-[calc(100%-28px)] w-12 flex-col justify-center border-r border-nc-border bg-nc-surface shadow-sm">
            <div className="flex items-center justify-center">
              <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
                视频轨道
              </span>
            </div>
          </div>

          {/* Shot clips */}
          <div className="relative ml-12 flex items-start gap-1 px-2 py-3.5">
            {directorShots.map((shot, i) => {
              const colors = TRACK_COLORS[i % TRACK_COLORS.length];
              const isActive = selectedShotId === shot.id;
              const width = shot.duration * pxPerSec;
              const hasVideo = !!shot.video_url;
              const statusLabel = shotStatusLabel(shot.status, hasVideo);

              return (
                <button
                  key={shot.id}
                  onClick={() => setSelectedShotId(shot.id)}
                  className={cn(
                    "group relative flex flex-col justify-between overflow-hidden rounded-[12px] border border-nc-border/60 bg-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
                    colors.bg,
                    isActive
                      ? cn(colors.border, "ring-2", colors.ring, "shadow-md hover:shadow-lg")
                      : cn("hover:border-nc-border-strong")
                  )}
                  style={{ width: `${width}px`, minHeight: 66 }}
                >
                  {/* Color strip top */}
                  <div className={cn("h-[3px] w-full", isActive ? "bg-nc-accent" : "bg-transparent")} />

                  {/* Content */}
                  <div className="flex flex-1 flex-col justify-center px-3.5 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {hasVideo && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nc-success shadow-sm" />
                      )}
                      <span className="truncate text-[13px] font-semibold leading-5 text-nc-text">
                        {shot.title || `镜头 ${i + 1}`}
                      </span>
                    </div>
                  {width > 80 && (
                      <span className="mt-1.5 flex min-w-0 items-center gap-1 truncate text-[12px] leading-4 text-nc-text-tertiary">
                        <Camera className="h-3 w-3 shrink-0" />
                        <span className="truncate">{statusLabel} · {shot.camera || "镜头规划"}</span>
                      </span>
                    )}
                  </div>

                  {/* Duration tag */}
                  {width > 50 && (
                    <div className="px-3.5 pb-2.5">
                      <span className="font-mono text-[12px] leading-4 tabular-nums text-nc-text-tertiary/80">
                        {shot.duration}s · S{i + 1}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Audio track */}
          <div className="relative ml-12 flex flex-col gap-1 border-t border-nc-border px-2 py-2.5 shadow-sm">
            <div className="absolute -left-12 top-0 flex h-full w-12 items-center justify-center border-r border-nc-border bg-nc-surface shadow-sm">
              <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
                音频轨道
              </span>
            </div>
            <div className="flex items-center gap-1">
              {directorShots.map((shot, i) => {
                const width = shot.duration * pxPerSec;
                const hasDialogue = !!shot.audio?.dialogue;
                return (
                  <div
                    key={`audio-${shot.id}`}
                    className={cn(
                      "relative flex flex-col justify-end overflow-hidden rounded-[12px] border px-2.5 pb-2 shadow-sm transition-shadow hover:shadow-md",
                      hasDialogue 
                        ? "bg-nc-info/10 border-nc-info/30 hover:border-nc-info/50 min-h-[58px]" 
                        : "bg-nc-success/10 border-nc-success/25 h-9"
                    )}
                    style={{ width: `${width}px` }}
                    title={shot.audio?.dialogue || "环境音"}
                  >
                    {hasDialogue && (
                      <div className="absolute left-2.5 right-2 top-2 truncate text-[12px] font-medium leading-4 text-nc-info opacity-95">
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
                            height: `${Math.max(8, (hasDialogue ? 22 : 18) + Math.sin((j + i * 7) * 0.7) * (hasDialogue ? 18 : 14) + Math.cos((j + 3) * 0.43) * 8)}px`,
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
