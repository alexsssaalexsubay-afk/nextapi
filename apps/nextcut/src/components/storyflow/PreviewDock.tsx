import { useEffect, useRef } from "react";
import { MonitorPlay, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { Button, MediaThumb, Pill } from "@/components/ui/kit";
import type { Shot } from "@/stores/director-store";
import { safeMediaSrc } from "./media";

export function PreviewDock({
  shot,
  index,
  total,
  onPrev,
  onNext,
  playbackActive,
  onTogglePlayback,
}: {
  shot: Shot | null;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  playbackActive: boolean;
  onTogglePlayback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const thumbnailSrc = safeMediaSrc(shot?.thumbnail_url);
  const videoSrc = safeMediaSrc(shot?.video_url);
  const hasVideo = Boolean(videoSrc);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playbackActive) {
      void video.play().catch(() => undefined);
      return;
    }
    video.pause();
  }, [playbackActive, videoSrc]);

  return (
    <div className="nc-card-safe flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-nc-border bg-white shadow-[0_14px_42px_rgba(15,23,42,0.08)]">
      <div className="flex min-h-12 items-center justify-between border-b border-nc-border px-4">
        <div>
          <div className="text-[14px] font-semibold leading-5 text-nc-text">预览</div>
          <div className="text-[12px] leading-4 text-nc-text-tertiary">{shot ? `S${index + 1} / ${total}` : "未选择镜头"}</div>
        </div>
        <Pill tone={hasVideo ? "success" : shot?.status === "failed" ? "danger" : "neutral"}>
          {hasVideo ? "已生成" : shot?.status || "等待"}
        </Pill>
      </div>

      <div className="relative min-h-[220px] flex-1 overflow-hidden bg-[#0F172A]">
        {thumbnailSrc && <MediaThumb src={thumbnailSrc} title={shot?.title} className="absolute inset-0 h-full rounded-none border-0 opacity-75 shadow-none" />}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.18),rgba(15,23,42,0.72))]" />
        <div className="relative flex h-full flex-col items-center justify-center gap-4 p-5 text-center">
          {hasVideo ? (
            <video ref={videoRef} src={videoSrc} className="h-full max-h-[280px] w-full rounded-[14px] object-contain shadow-2xl" controls />
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-white/16 text-white shadow-xl backdrop-blur">
                <MonitorPlay className="h-7 w-7" />
              </div>
              <div>
                <p className="nc-text-safe line-clamp-2 text-[15px] font-semibold leading-6 text-white">{shot?.title || "选择镜头查看预览"}</p>
                <p className="nc-text-safe mx-auto mt-2 line-clamp-4 max-w-[320px] text-[13px] leading-6 text-white/72">
                  {shot?.generationParams?.shot_script || shot?.prompt || "预览会跟随创作流程节点和时间线片段同步。"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex min-h-[68px] items-center justify-between gap-3 border-t border-nc-border px-4">
        <Button size="icon" variant="ghost" onClick={onPrev} disabled={index <= 0} aria-label="上一个镜头">
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="primary" className="h-12 w-12 rounded-full" onClick={onTogglePlayback} aria-label={playbackActive ? "暂停预览" : "播放预览"}>
          {playbackActive ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </Button>
        <Button size="icon" variant="ghost" onClick={onNext} disabled={index >= total - 1} aria-label="下一个镜头">
          <SkipForward className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-2 text-nc-text-tertiary">
          <Volume2 className="h-4 w-4" />
          <div className="h-1.5 w-20 rounded-full bg-nc-border">
            <div className="h-full w-2/3 rounded-full bg-nc-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}
