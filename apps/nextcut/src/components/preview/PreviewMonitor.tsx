import { memo, useState, useRef, useCallback, useEffect } from "react";
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
    <div className="flex h-full flex-col bg-nc-bg">
      {/* Header */}
      <div className="flex h-[60px] items-center justify-between border-b border-nc-border bg-nc-surface px-6 shadow-sm">
        <span className="text-[14px] font-semibold text-nc-text">Preview</span>
        <div className="flex items-center gap-3">
          {selectedShot && (
            <span className={cn(
              "rounded-md border px-2 py-1 text-[12px] font-medium shadow-sm",
              selectedShot.video_url ? "bg-nc-success/10 text-nc-success border-nc-success/20" :
              selectedShot.status === "failed" ? "bg-nc-error/10 text-nc-error border-nc-error/20" :
              "bg-nc-bg text-nc-text-tertiary border-nc-border"
            )}>
              {selectedShot.video_url ? "Ready" : selectedShot.status}
            </span>
          )}
          {selectedShotId && (
            <span className="font-mono text-[12px] font-medium text-nc-text-secondary bg-nc-bg px-2 py-1 rounded border border-nc-border">{selectedShotId.slice(0, 8)}</span>
          )}
        </div>
      </div>

      {/* Viewport */}
      <div className="relative flex flex-1 items-center justify-center bg-black/60">
        {selectedShot ? (
          hasVideo ? (
            <div className="relative flex h-full w-full items-center justify-center p-3">
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
                    <svg width="22" height="22" viewBox="0 0 18 18" fill="white">
                      <polygon points="5,2 16,9 5,16" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-8">
              <div className="rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface/50 p-7 text-center shadow-md hover:shadow-lg transition-shadow">
                {(selectedShot.status === "generating" || selectedShot.status === "queued" || (selectedShot.status === "pending" && isRunning)) ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <div className="h-9 w-9 animate-[spin_2s_linear_infinite] rounded-full border-2 border-nc-accent/20 border-t-nc-accent" />
                      <div className="absolute inset-0 h-9 w-9 animate-[spin_3s_linear_infinite_reverse] rounded-full border-2 border-transparent border-b-nc-accent/30" />
                    </div>
                    <div className="text-sm text-nc-text-tertiary">
                      {selectedShot.status === "queued" ? "Queued for generation..." : "Generating..."}
                    </div>
                  </div>
                ) : selectedShot.status === "failed" ? (
                  <div className="flex flex-col items-center gap-3">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-nc-error/70">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    <span className="text-sm text-nc-error/90">Generation failed</span>
                    <span className="text-xs text-nc-text-tertiary">Try re-running the pipeline</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <svg width="36" height="36" viewBox="0 0 32 32" fill="none" className="text-nc-text-tertiary/35">
                      <rect x="4" y="6" width="24" height="20" rx="2" stroke="currentColor" strokeWidth="1.2" />
                      <polygon points="13,12 21,16 13,20" fill="currentColor" />
                    </svg>
                    <span className="text-xs text-nc-text-tertiary">Awaiting generation</span>
                  </div>
                )}
              </div>
              {selectedShot.prompt && (
                <p className="max-w-[300px] text-center text-xs leading-relaxed text-nc-text-tertiary/90 italic">
                  &ldquo;{selectedShot.prompt.slice(0, 160)}&rdquo;
                </p>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-4">
            <svg width="44" height="44" viewBox="0 0 40 40" fill="none" className="text-nc-text-tertiary/25">
              <rect x="4" y="8" width="32" height="24" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <polygon points="17,15 27,20 17,25" fill="currentColor" opacity="0.5" />
            </svg>
            <span className="text-sm text-nc-text-tertiary">Select a shot to preview</span>
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
      <div className="flex h-[60px] shrink-0 items-center justify-between border-t border-nc-border bg-nc-surface px-6 shadow-sm">
        {/* Timecode left */}
        <div className="w-28 font-mono text-[13px] font-medium tabular-nums text-nc-text-secondary">
          {hasVideo ? formatTime(currentTime) : "--:--:--"}
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-4">
          {/* Shot counter */}
          {shots.length > 0 && selectedIndex >= 0 && (
            <span className="mr-2 rounded-lg border border-nc-border bg-nc-bg px-3 py-1.5 font-mono text-[12px] font-medium tabular-nums text-nc-text-secondary shadow-sm">
              {selectedIndex + 1}/{shots.length}
            </span>
          )}

          <button
            type="button"
            onClick={goToPrev}
            disabled={selectedIndex <= 0}
            className="rounded-lg p-2.5 text-nc-text-tertiary transition-colors hover:bg-nc-panel hover:text-nc-text disabled:opacity-25"
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="2" width="2.5" height="8" rx="0.5" />
              <polygon points="5,6 11,2 11,10" />
            </svg>
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={!hasVideo}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-all",
              hasVideo
                ? "bg-nc-text text-nc-bg hover:bg-nc-text-secondary hover:shadow-md hover:scale-105"
                : "bg-nc-panel text-nc-text-tertiary shadow-none"
            )}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="3" height="8" rx="1" />
                <rect x="6" y="1" width="3" height="8" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 10 10" fill="currentColor" className="ml-0.5">
                <polygon points="2,0 10,5 2,10" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={goToNext}
            disabled={selectedIndex >= shots.length - 1}
            className="rounded-lg p-2.5 text-nc-text-tertiary transition-colors hover:bg-nc-panel hover:text-nc-text disabled:opacity-25"
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="1,2 7,6 1,10" />
              <rect x="8.5" y="2" width="2.5" height="8" rx="0.5" />
            </svg>
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
              className="rounded-lg p-2.5 text-nc-text-tertiary transition-colors hover:bg-nc-panel hover:text-nc-text"
            >
              <svg width="16" height="16" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                {isMuted || volume === 0 ? (
                  <>
                    <polygon points="1,4 3,4 6,1 6,11 3,8 1,8" fill="currentColor" stroke="none" />
                    <path d="M8 4l3 4M11 4l-3 4" />
                  </>
                ) : (
                  <>
                    <polygon points="1,4 3,4 6,1 6,11 3,8 1,8" fill="currentColor" stroke="none" />
                    <path d="M8 3.5c1 1 1 4 0 5" />
                    {volume > 0.5 && <path d="M9.5 2c1.5 1.5 1.5 6.5 0 8" />}
                  </>
                )}
              </svg>
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
          <span className="font-mono text-[13px] font-medium tabular-nums text-nc-text-secondary bg-nc-bg px-2 py-1 rounded border border-nc-border">
            {hasVideo ? formatTime(videoDuration) : "--:--:--"}
          </span>
        </div>
      </div>
    </div>
  );
});
