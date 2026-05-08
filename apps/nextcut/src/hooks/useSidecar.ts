import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { safeMediaSrc } from "@/lib/media";
import { checkHealth, createReconnectingWs, waitForSidecar } from "@/lib/sidecar";

const HEALTH_POLL_INTERVAL = 15_000;

export function useSidecar() {
  const setSidecarStatus = useAppStore((s) => s.setSidecarStatus);
  const updateAgentProgress = useDirectorStore((s) => s.updateAgentProgress);
  const updateShot = useDirectorStore((s) => s.updateShot);
  const setIsRunning = useDirectorStore((s) => s.setIsRunning);

  const wsRef = useRef<{ close: () => void } | null>(null);
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const mountedRef = useRef(true);

  const handleWsMessage = useCallback((data: unknown) => {
    const evt = data as { type?: string; data?: Record<string, unknown> };
    if (!evt?.type) return;

    if (evt.type.startsWith("agent.")) {
      updateAgentProgress({
        agent: (evt.data?.agent as string) ?? "",
        status: (evt.data?.status as string) ?? "",
        progress: (evt.data?.progress as number) ?? 0,
      });
    }

    if (evt.type === "shot.generated") {
      const shotId = evt.data?.shot_id as string;
      const videoUrl = evt.data?.video_url as string;
      const safeVideoUrl = safeMediaSrc(videoUrl);
      if (shotId && safeVideoUrl) {
        updateShot(shotId, { status: "succeeded", video_url: safeVideoUrl });
      }
    }

    if (evt.type === "video.complete") {
      const shotId = evt.data?.shot_id as string;
      const videoUrl = evt.data?.video_url as string;
      const thumbnailUrl = evt.data?.thumbnail_url as string;
      if (shotId) {
        updateShot(shotId, {
          status: "succeeded",
          video_url: safeMediaSrc(videoUrl) || "",
          thumbnail_url: safeMediaSrc(thumbnailUrl) || "",
        });
      }
    }

    if (evt.type === "system.status" && evt.data?.status === "failed") {
      setIsRunning(false);
    }
  }, [updateAgentProgress, updateShot, setIsRunning]);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      setSidecarStatus("connecting");
      const ready = await waitForSidecar(25_000);

      if (!mountedRef.current) return;
      setSidecarStatus(ready ? "connected" : "disconnected");

      if (ready) {
        wsRef.current = createReconnectingWs(
          "/ws/events",
          handleWsMessage,
          (connected) => {
            if (mountedRef.current) {
              setSidecarStatus(connected ? "connected" : "connecting");
            }
          }
        );
      }

      healthTimerRef.current = setInterval(async () => {
        if (!mountedRef.current) return;
        const ok = await checkHealth();
        if (!mountedRef.current) return;

        if (!ok) {
          setSidecarStatus("connecting");
        } else {
          setSidecarStatus("connected");
          if (!wsRef.current) {
            wsRef.current = createReconnectingWs(
              "/ws/events",
              handleWsMessage,
              (connected) => {
                if (mountedRef.current) {
                  setSidecarStatus(connected ? "connected" : "connecting");
                }
              }
            );
          }
        }
      }, HEALTH_POLL_INTERVAL);
    };

    init();

    return () => {
      mountedRef.current = false;
      clearInterval(healthTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [setSidecarStatus, handleWsMessage]);
}
