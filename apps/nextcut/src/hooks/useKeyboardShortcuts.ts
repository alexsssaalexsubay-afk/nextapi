import { useEffect } from "react";
import { useAppStore, type SidebarPage, type WorkspaceView } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";

const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
const modKey = (e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

export function useKeyboardShortcuts() {
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const sidebarPage = useAppStore((s) => s.sidebarPage);
  const setWorkspaceView = useAppStore((s) => s.setWorkspaceView);
  const selectedShotId = useAppStore((s) => s.selectedShotId);
  const setSelectedShotId = useAppStore((s) => s.setSelectedShotId);
  const setTimelineZoom = useAppStore((s) => s.setTimelineZoom);
  const timelineZoom = useAppStore((s) => s.timelineZoom);
  const shots = useDirectorStore((s) => s.shots);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (sidebarPage === "workspace") return;

      // Navigation: 1-5 for sidebar pages
      if (!modKey(e) && !e.altKey) {
        const pageMap: Record<string, SidebarPage> = {
          "1": "home",
          "2": "projects",
          "3": "agents",
          "4": "library",
          "5": "templates",
          "6": "edit",
          "7": "settings",
          "8": "guide",
        };
        if (pageMap[e.key]) {
          e.preventDefault();
          setSidebarPage(pageMap[e.key]);
          return;
        }
      }

      // Cmd/Ctrl+N = new project (go home)
      if (modKey(e) && e.key === "n") {
        e.preventDefault();
        setSidebarPage("home");
        return;
      }

      // Cmd/Ctrl+, = settings
      if (modKey(e) && e.key === ",") {
        e.preventDefault();
        setSidebarPage("settings");
        return;
      }

      // View modes: Cmd+1/2/3 when on library view
      if (modKey(e) && !e.altKey) {
        const viewMap: Record<string, WorkspaceView> = {
          "1": "storyboard",
          "2": "canvas",
          "3": "split",
        };
        if (viewMap[e.key]) {
          e.preventDefault();
          setWorkspaceView(viewMap[e.key]);
          return;
        }
      }

      // Zoom: Cmd+= / Cmd+- for timeline zoom
      if (modKey(e) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setTimelineZoom(timelineZoom * 1.5);
        return;
      }
      if (modKey(e) && e.key === "-") {
        e.preventDefault();
        setTimelineZoom(timelineZoom / 1.5);
        return;
      }
      if (modKey(e) && e.key === "0") {
        e.preventDefault();
        setTimelineZoom(1);
        return;
      }

      // Arrow left/right to navigate shots
      if (shots.length > 0) {
        const currentIdx = shots.findIndex((s) => s.id === selectedShotId);

        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const prev = currentIdx > 0 ? currentIdx - 1 : shots.length - 1;
          setSelectedShotId(shots[prev].id);
          return;
        }

        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const next = currentIdx < shots.length - 1 ? currentIdx + 1 : 0;
          setSelectedShotId(shots[next].id);
          return;
        }
      }

      // Space = play/pause (handled by PreviewMonitor)
      if (e.key === " " && !isInputFocused()) {
        e.preventDefault();
        return;
      }

      // Escape = deselect shot
      if (e.key === "Escape") {
        setSelectedShotId(null);
        return;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sidebarPage, setSidebarPage, setWorkspaceView, selectedShotId, setSelectedShotId, shots, timelineZoom, setTimelineZoom]);
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
}
