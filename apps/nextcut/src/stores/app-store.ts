import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarPage = "home" | "projects" | "agents" | "library" | "templates" | "edit" | "settings" | "workspace" | "guide";
export type ConnectionStatus = "connected" | "connecting" | "disconnected";
export type WorkspaceView = "storyboard" | "canvas" | "split";
export type StoryflowMode = "storyflow" | "focus" | "review" | "timeline";

interface AppState {
  sidebarPage: SidebarPage;
  setSidebarPage: (page: SidebarPage) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  workspaceView: WorkspaceView;
  setWorkspaceView: (view: WorkspaceView) => void;

  storyflowMode: StoryflowMode;
  setStoryflowMode: (mode: StoryflowMode) => void;

  sidecarStatus: ConnectionStatus;
  setSidecarStatus: (status: ConnectionStatus) => void;

  comfyuiStatus: ConnectionStatus;
  setComfyuiStatus: (status: ConnectionStatus) => void;

  selectedShotId: string | null;
  setSelectedShotId: (id: string | null) => void;

  timelineZoom: number;
  setTimelineZoom: (z: number) => void;

  previewFullscreen: boolean;
  setPreviewFullscreen: (f: boolean) => void;

  inspectorCollapsed: boolean;
  setInspectorCollapsed: (c: boolean) => void;

  workspaceCleanMode: boolean;
  setWorkspaceCleanMode: (c: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarPage: "agents",
      setSidebarPage: (page) => set({ sidebarPage: page }),

      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      workspaceView: "storyboard",
      setWorkspaceView: (view) => set({ workspaceView: view }),

      storyflowMode: "storyflow",
      setStoryflowMode: (storyflowMode) => set({ storyflowMode }),

      sidecarStatus: "disconnected",
      setSidecarStatus: (status) => set({ sidecarStatus: status }),

      comfyuiStatus: "disconnected",
      setComfyuiStatus: (status) => set({ comfyuiStatus: status }),

      selectedShotId: null,
      setSelectedShotId: (id) => set({ selectedShotId: id }),

      timelineZoom: 1,
      setTimelineZoom: (z) => set({ timelineZoom: Math.max(0.25, Math.min(4, z)) }),

      previewFullscreen: false,
      setPreviewFullscreen: (f) => set({ previewFullscreen: f }),

      inspectorCollapsed: false,
      setInspectorCollapsed: (c) => set({ inspectorCollapsed: c }),

      workspaceCleanMode: false,
      setWorkspaceCleanMode: (workspaceCleanMode) => set({ workspaceCleanMode }),
    }),
    {
      name: "nextcut-app-shell",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        timelineZoom: state.timelineZoom,
        inspectorCollapsed: state.inspectorCollapsed,
        workspaceCleanMode: state.workspaceCleanMode,
        storyflowMode: state.storyflowMode,
      }),
    }
  )
);
