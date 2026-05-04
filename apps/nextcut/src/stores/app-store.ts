import { create } from "zustand";

export type SidebarPage = "home" | "projects" | "agents" | "library" | "templates" | "edit" | "settings" | "workspace";
export type ConnectionStatus = "connected" | "connecting" | "disconnected";
export type WorkspaceView = "storyboard" | "canvas" | "split";

interface AppState {
  sidebarPage: SidebarPage;
  setSidebarPage: (page: SidebarPage) => void;

  workspaceView: WorkspaceView;
  setWorkspaceView: (view: WorkspaceView) => void;

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
}

export const useAppStore = create<AppState>((set) => ({
  sidebarPage: "workspace",
  setSidebarPage: (page) => set({ sidebarPage: page }),

  workspaceView: "storyboard",
  setWorkspaceView: (view) => set({ workspaceView: view }),

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
}));
