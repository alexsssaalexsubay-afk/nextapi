import { memo, useState, useRef, useCallback, useEffect } from "react";
import { MonitorPlay, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, XCircle } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { cn } from "@/lib/cn";

export const PreviewMonitor = memo(function PreviewMonitor() {
  const selectedShotId = useAppStore((s) => s.selectedShotId);
  const setSelectedShotId = useAppStore((s) => s.setSelectedShotId);
  const shots = useDirectorStore((s) => s.shots);
  const isRunning = useDirectorStore((s) => s.isRunning);

  const selectedShot = shots.find((s) => s.id === selectedShotId);
  const selectedIndex = shots.findIndex((s) => s.id === selectedShotId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const hasVideo = !!selectedShot?.video_url;
  const statusLabel = selectedShot?.video_url
    ? "已生成"
    : selectedShot?.status === "failed"
    ? "失败"
    : selectedShot?.status === "planned"
    ? "已规划"
    : selectedShot?.status === "queued"
    ? "排队中"
    : selectedShot?.status === "generating" || selectedShot?.status === "processing"
    ? "生成中"
    : selectedShot?.status || "未选择";

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setVideoDuration(0);
  }, [selectedShotId]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const goToPrev = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedShotId(shots[selectedIndex - 1].id);
    }
  }, [selectedIndex, shots, setSelectedShotId]);

  const goToNext = useCallback(() => {
    if (selectedIndex < shots.length - 1) {
      setSelectedShotId(shots[selectedIndex + 1].id);
    }
  }, [selectedIndex, shots, setSelectedShotId]);

  const handleScrubClick = useCallback((e: React.MouseEvent) => {
    if (!scrubRef.current || !videoRef.current || !videoDuration) return;
    const rect = scrubRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * videoDuration;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, [videoDuration]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const f = Math.floor((secs % 1) * 30);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex min-h-[56px] items-center justify-between border-b border-nc-border bg-white px-5 shadow-sm">
        <span className="text-[15px] font-semibold leading-6 text-nc-text">预览</span>
        <div className="flex items-center gap-3">
          {selectedShot && (
            <span className={cn(
              "flex min-h-8 items-center rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold leading-5 shadow-sm",
              selectedShot.video_url ? "bg-nc-success/10 text-nc-success border-nc-success/20" :
              selectedShot.status === "failed" ? "bg-nc-error/10 text-nc-error border-nc-error/20" :
              "bg-nc-bg text-nc-text-tertiary border-nc-border"
            )}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      {/* Viewport */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#111827]">
        {selectedShot ? (
          hasVideo ? (
            <div className="relative flex h-full w-full items-center justify-center p-4">
              <video
                ref={videoRef}
                src={selectedShot.video_url}
                className="max-h-full max-w-full rounded-lg border border-nc-border/40 object-contain shadow-lg shadow-black/40"
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) setVideoDuration(videoRef.current.duration);
                  setIsLoading(false);
                }}
                onLoadStart={() => setIsLoading(true)}
                onEnded={() => {
                  setIsPlaying(false);
                  if (selectedIndex < shots.length - 1) {
                    setTimeout(() => goToNext(), 600);
                  }
                }}
                onClick={togglePlay}
                playsInline
                loop={false}
              />
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-6 w-6 animate-[spin_1.5s_linear_infinite] rounded-full border-2 border-nc-accent/30 border-t-nc-accent" />
                </div>
              )}
              {!isPlaying && !isLoading && (
                <div
                  className="absolute inset-0 flex cursor-pointer items-center justify-center opacity-0 transition-opacity hover:opacity-100"
                  onClick={togglePlay}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/50 shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:shadow-xl">
                    <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
              {selectedShot.thumbnail_url && (
                <img src={selectedShot.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-sm scale-105" />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,24,39,0.18),rgba(17,24,39,0.74))]" />
              <div className="relative rounded-[16px] border border-white/25 bg-white/14 p-6 text-center shadow-xl backdrop-blur-md transition-shadow hover:shadow-2xl">
                {(selectedShot.status === "generating" || selectedShot.status === "queued" || (selectedShot.status === "pending" && isRunning)) ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <div className="h-9 w-9 animate-[spin_2s_linear_infinite] rounded-full border-2 border-nc-accent/20 border-t-nc-accent" />
                      <div className="absolute inset-0 h-9 w-9 animate-[spin_3s_linear_infinite_reverse] rounded-full border-2 border-transparent border-b-nc-accent/30" />
                    </div>
                    <div className="text-sm font-medium text-white/82">
                      {selectedShot.status === "queued" ? "排队等待生成" : "正在生成"}
                    </div>
                  </div>
                ) : selectedShot.status === "failed" ? (
                  <div className="flex flex-col items-center gap-3">
                    <XCircle className="h-7 w-7 text-nc-error/70" />
                    <span className="text-sm text-white">生成失败</span>
                    <span className="text-[13px] leading-5 text-white/65">请重新生成当前镜头</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <MonitorPlay className="h-9 w-9 text-white/35" />
                    <span className="text-[13px] font-semibold leading-5 text-white/78">等待生成视频</span>
                  </div>
                )}
              </div>
              {(selectedShot.generationParams?.shot_script || selectedShot.prompt) && (
                <p className="relative max-w-[360px] text-center text-[13px] leading-6 text-white/72">
                  &ldquo;{(selectedShot.generationParams?.shot_script || selectedShot.prompt).slice(0, 120)}&rdquo;
                </p>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-4">
            <MonitorPlay className="h-11 w-11 text-white/25" />
            <span className="text-sm text-white/70">选择一个镜头进行预览</span>
          </div>
        )}
      </div>

      {/* Scrub bar */}
      {hasVideo && videoDuration > 0 && (
        <div
          ref={scrubRef}
          className="group relative h-2.5 cursor-pointer border-t border-nc-border bg-nc-surface shadow-inner"
          onClick={handleScrubClick}
        >
          <div
            className="absolute inset-y-0 left-0 bg-nc-accent/40 transition-[width] duration-75"
            style={{ width: `${(currentTime / videoDuration) * 100}%` }}
          />
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-nc-accent opacity-0 shadow-md transition-opacity group-hover:opacity-100"
            style={{ left: `${(currentTime / videoDuration) * 100}%` }}
          />
        </div>
      )}

      {/* Transport bar */}
      <div className="flex min-h-[64px] shrink-0 items-center justify-between border-t border-nc-border bg-white px-5 shadow-sm">
        {/* Timecode left */}
        <div className="w-28 font-mono text-[13px] font-medium leading-5 tabular-nums text-nc-text-secondary">
          {hasVideo ? formatTime(currentTime) : "--:--:--"}
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-4">
          {/* Shot counter */}
          {shots.length > 0 && selectedIndex >= 0 && (
            <span className="mr-2 flex min-h-8 items-center rounded-[10px] border border-nc-border bg-nc-bg px-3.5 py-1.5 font-mono text-[13px] font-medium leading-5 tabular-nums text-nc-text-secondary shadow-sm">
              {selectedIndex + 1}/{shots.length}
            </span>
          )}

          <button
            type="button"
            onClick={goToPrev}
            disabled={selectedIndex <= 0}
            aria-label="上一个镜头"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-nc-text-tertiary transition-colors hover:bg-nc-panel hover:text-nc-text disabled:opacity-25"
          >
            <SkipBack className="h-4 w-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={!hasVideo}
            aria-label={isPlaying ? "暂停" : "播放"}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition-all",
              hasVideo
                ? "bg-nc-accent text-white hover:bg-nc-accent-hover hover:shadow-md hover:scale-105"
                : "bg-nc-panel text-nc-text-tertiary shadow-none"
            )}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={goToNext}
            disabled={selectedIndex >= shots.length - 1}
            aria-label="下一个镜头"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-nc-text-tertiary transition-colors hover:bg-nc-panel hover:text-nc-text disabled:opacity-25"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>
        </div>

        {/* Right controls */}
        <div className="flex w-28 items-center justify-end gap-3">
          {/* Volume */}
          <div
            className="relative"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted ? "取消静音" : "静音"}
              className="flex h-10 w-10 items-center justify-center rounded-[10px] text-nc-text-tertiary transition-colors hover:bg-nc-panel hover:text-nc-text"
            >
              {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {showVolumeSlider && (
              <div className="absolute -top-24 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center rounded-xl border border-nc-border bg-nc-surface p-4 shadow-xl">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                  className="h-16 w-1.5 appearance-none rounded-full bg-nc-border accent-nc-text cursor-pointer"
                  style={{ writingMode: "vertical-lr", direction: "rtl" }}
                />
              </div>
            )}
          </div>

          {/* Duration */}
          <span className="flex min-h-8 items-center rounded-[9px] border border-nc-border bg-nc-bg px-3 py-1.5 font-mono text-[13px] font-medium leading-5 tabular-nums text-nc-text-secondary">
            {hasVideo ? formatTime(videoDuration) : "--:--:--"}
          </span>
        </div>
      </div>
    </div>
  );
});
