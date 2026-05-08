import { useMemo, useState } from "react";
import { Bookmark, Clock3, Lock, Minus, Music2, Plus, Scissors, Subtitles, Video, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { Button, MediaThumb, Pill } from "@/components/ui/kit";
import type { Shot } from "@/stores/director-store";
import { safeMediaSrc } from "./media";
import type { StoryflowClip } from "./storyflow-types";

type TimelineVariant = "mini" | "review" | "edit";

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = Math.round(safe % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function makeClips(shots: Shot[]): StoryflowClip[] {
  return shots.reduce<StoryflowClip[]>((clips, shot) => {
    const start = clips.reduce((sum, clip) => sum + clip.duration, 0);
    clips.push({
      id: `clip_${shot.id}`,
      shotId: shot.id,
      title: shot.title,
      duration: Number(shot.duration) || 0,
      start,
      thumbnail: shot.thumbnail_url,
      status: shot.video_url ? "已生成" : shot.status || "planned",
      prompt: shot.prompt,
      camera: shot.camera,
    });
    return clips;
  }, []);
}

export function TimelineDock({
  shots,
  selectedShotId,
  variant = "mini",
  playbackActive,
  onSelectShot,
  onReorder,
  onUpdateDuration,
}: {
  shots: Shot[];
  selectedShotId: string | null;
  variant?: TimelineVariant;
  playbackActive?: boolean;
  onSelectShot: (shotId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onUpdateDuration: (shotId: string, duration: number) => void;
}) {
  const timelineZoom = useAppStore((s) => s.timelineZoom);
  const setTimelineZoom = useAppStore((s) => s.setTimelineZoom);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const clips = useMemo(() => makeClips(shots), [shots]);
  const total = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const compact = variant === "mini";
  const pxPerSecond = compact ? 26 * timelineZoom : variant === "review" ? 38 * timelineZoom : 54 * timelineZoom;
  const selectedClip = clips.find((clip) => clip.shotId === selectedShotId);

  return (
    <section className={cn(
      "flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-nc-border bg-white shadow-[0_14px_42px_rgba(15,23,42,0.08)]",
      compact ? "h-[184px]" : "h-full"
    )}>
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-nc-border px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold leading-6 text-nc-text">Timeline</h2>
            <Pill tone={playbackActive ? "accent" : "neutral"} className="min-h-6 px-2.5 py-0.5 text-[11px]">
              {playbackActive ? "播放中" : `${formatTime(total)} 总长`}
            </Pill>
          </div>
          {!compact && <p className="text-[12px] leading-5 text-nc-text-tertiary">镜头、音频、字幕和标记保持与 Storyflow 节点同步。</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setTimelineZoom(timelineZoom / 1.25)} title="缩小时间线" aria-label="缩小时间线">
            <Minus className="h-4 w-4" />
          </Button>
          <div className="h-1.5 w-24 rounded-full bg-nc-border">
            <div className="h-full rounded-full bg-nc-accent" style={{ width: `${Math.min(100, Math.max(24, timelineZoom * 42))}%` }} />
          </div>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setTimelineZoom(timelineZoom * 1.25)} title="放大时间线" aria-label="放大时间线">
            <Plus className="h-4 w-4" />
          </Button>
          {!compact && <Button size="sm" variant="secondary"><Scissors className="h-4 w-4" />吸附开启</Button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="min-w-full" style={{ width: Math.max(760, total * pxPerSecond + 220) }}>
          <div className="mb-2 ml-[104px] flex h-6 items-end border-b border-dashed border-nc-border">
            {Array.from({ length: Math.max(5, Math.ceil(total / 5) + 1) }).map((_, index) => (
              <div key={index} className="relative shrink-0 text-[11px] font-medium leading-4 text-nc-text-tertiary" style={{ width: 5 * pxPerSecond }}>
                <span className="absolute -left-3 bottom-1">{formatTime(index * 5)}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-3">
            <TrackRow icon={<Video className="h-4 w-4" />} label="视频" locked={false}>
              <div className="flex h-[74px] items-center gap-2">
                {clips.map((clip, index) => {
                  const selected = clip.shotId === selectedShotId;
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      draggable
                      onClick={() => onSelectShot(clip.shotId)}
                      onDragStart={() => setDragIndex(index)}
                      onDragEnd={() => setDragIndex(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (dragIndex === null) return;
                        onReorder(dragIndex, index);
                        setDragIndex(null);
                      }}
                      className={cn(
                        "group nc-card-safe relative h-[66px] shrink-0 overflow-hidden rounded-[14px] border bg-nc-bg text-left transition-all",
                        selected
                          ? "border-nc-accent ring-4 ring-nc-accent/12 shadow-[0_10px_26px_rgba(108,77,255,0.18)]"
                          : "border-nc-border hover:-translate-y-0.5 hover:border-nc-accent/35 hover:shadow-md"
                      )}
                      style={{ width: Math.max(compact ? 114 : 150, clip.duration * pxPerSecond) }}
                    >
                      <MediaThumb
                        src={safeMediaSrc(clip.thumbnail)}
                        title={clip.title}
                        className="absolute inset-0 h-full rounded-none border-0 opacity-70 shadow-none"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.72),rgba(15,23,42,0.10))]" />
                      <span className="absolute left-2 top-2 rounded-[8px] bg-nc-accent px-2 py-1 text-[11px] font-bold leading-3 text-white">{index + 1}</span>
                      <span className="nc-text-safe absolute bottom-2 left-2 right-12 line-clamp-1 text-[12px] font-semibold leading-4 text-white">{clip.title}</span>
                      <span className="absolute bottom-2 right-2 rounded-full bg-white/85 px-2 py-0.5 font-mono text-[11px] font-semibold text-nc-text">{clip.duration}s</span>
                    </button>
                  );
                })}
              </div>
            </TrackRow>

            <TrackRow icon={<Music2 className="h-4 w-4" />} label="音频" locked={false}>
              <div className="relative h-10 rounded-[12px] border border-nc-info/20 bg-nc-info/10">
                <div className="absolute inset-x-3 top-1/2 h-5 -translate-y-1/2 overflow-hidden">
                  <div className="h-full w-full bg-[repeating-linear-gradient(90deg,rgba(0,212,224,0.35)_0_2px,transparent_2px_8px)]" />
                </div>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-nc-info">Background_Music.mp3</span>
              </div>
            </TrackRow>

            {!compact && (
              <>
                <TrackRow icon={<Subtitles className="h-4 w-4" />} label="字幕" locked={false}>
                  <div className="flex h-10 items-center gap-2">
                    {clips.map((clip) => (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => onSelectShot(clip.shotId)}
                        className={cn(
                          "nc-card-safe h-9 shrink-0 rounded-[12px] border px-4 text-[12px] font-semibold leading-4 transition-all",
                          clip.shotId === selectedShotId ? "border-nc-accent bg-[#F5F3FF] text-nc-accent" : "border-nc-border bg-nc-bg text-nc-text-secondary"
                        )}
                        style={{ width: Math.max(140, clip.duration * pxPerSecond) }}
                      >
                        <span className="nc-text-safe line-clamp-1">{clip.prompt || clip.title}</span>
                      </button>
                    ))}
                  </div>
                </TrackRow>

                <TrackRow icon={<Bookmark className="h-4 w-4" />} label="标记" locked={true}>
                  <div className="flex h-10 items-center gap-4 text-[12px] font-semibold text-nc-text-tertiary">
                    {clips.map((clip, index) => (
                      <button key={clip.id} type="button" onClick={() => onSelectShot(clip.shotId)} className="flex items-center gap-2 rounded-full bg-nc-bg px-3 py-1.5">
                        <span className="h-2 w-2 rounded-full bg-nc-accent" />
                        {index === 0 ? "开场" : index === clips.length - 1 ? "收束" : "转场"}
                      </button>
                    ))}
                  </div>
                </TrackRow>
              </>
            )}
          </div>
        </div>
      </div>

      {!compact && selectedClip && (
        <div className="flex min-h-16 items-center justify-between gap-4 border-t border-nc-border px-4">
          <div className="min-w-0">
            <div className="nc-text-safe line-clamp-1 text-[13px] font-semibold leading-5 text-nc-text">{selectedClip.title}</div>
            <div className="nc-text-safe line-clamp-1 text-[12px] leading-5 text-nc-text-tertiary">{selectedClip.camera || selectedClip.prompt}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => onUpdateDuration(selectedClip.shotId, Math.max(2, selectedClip.duration - 1))}>-1s</Button>
            <Pill tone="neutral"><Clock3 className="mr-1 h-3.5 w-3.5" />{selectedClip.duration}s</Pill>
            <Button size="sm" variant="secondary" onClick={() => onUpdateDuration(selectedClip.shotId, Math.min(30, selectedClip.duration + 1))}>+1s</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function TrackRow({
  icon,
  label,
  locked,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3">
      <div className="flex h-full min-h-10 items-center justify-between rounded-[12px] border border-nc-border bg-nc-bg px-3 text-[12px] font-semibold text-nc-text-secondary">
        <span className="flex items-center gap-2">{icon}{label}</span>
        {locked ? <Lock className="h-3.5 w-3.5 text-nc-text-tertiary" /> : <Volume2 className="h-3.5 w-3.5 text-nc-text-tertiary" />}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
