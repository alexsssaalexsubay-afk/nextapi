import { useState, useCallback } from "react";
import { cn } from "@/lib/cn";
import { useAppStore, type WorkspaceView } from "@/stores/app-store";
import { NodeCanvas } from "@/components/canvas/NodeCanvas";
import { PreviewMonitor } from "@/components/preview/PreviewMonitor";
import { TimelineEditor } from "@/components/timeline/TimelineEditor";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { SettingsPanel } from "@/components/panels/SettingsPanel";
import { DirectorInput } from "@/components/panels/DirectorInput";
import { AgentLogPanel } from "@/components/panels/AgentLogPanel";
import { HomePage } from "@/components/panels/HomePage";
import { ProjectsPanel } from "@/components/panels/ProjectsPanel";
import { StoryboardPanel } from "@/components/panels/StoryboardPanel";
import { LibraryPanel } from "@/components/panels/LibraryPanel";
import { TemplatePanel } from "@/components/panels/TemplatePanel";
import { EditVideoPanel } from "@/components/panels/EditVideoPanel";
import { useI18nStore } from "@/stores/i18n-store";
import { useAuthStore } from "@/stores/auth-store";

function MainHeader() {
  const { lang, setLang } = useI18nStore();
  const { user, logout } = useAuthStore();
  const { setSidebarPage } = useAppStore();

  return (
    <div className="flex h-[72px] shrink-0 items-center justify-end gap-4 px-8 border-b border-nc-border bg-nc-surface w-full z-10 relative">
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 rounded-xl border border-nc-border bg-nc-surface px-4 py-2 text-[14px] font-bold text-nc-text shadow-sm transition-all hover:bg-nc-panel hover:shadow-md">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          导入素材
        </button>
        
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-nc-border bg-nc-surface text-nc-text-secondary shadow-sm transition-all hover:bg-nc-panel hover:text-nc-text">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        </button>

        <button
          onClick={() => setLang(lang === "en" ? "zh" : "en")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-nc-border bg-nc-surface text-[14px] font-bold uppercase text-nc-text shadow-sm transition-all hover:bg-nc-panel hover:text-nc-text-secondary"
        >
          {lang}
        </button>

        {user ? (
          <button
            onClick={logout}
            className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nc-accent text-[14px] font-bold text-white shadow-md transition-all hover:bg-nc-accent-hover hover:scale-105"
            title={`Logout (${user.email})`}
          >
            <span className="group-hover:hidden">ZH</span>
            <svg className="hidden h-4 w-4 group-hover:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        ) : (
          <button
            onClick={() => setSidebarPage("settings")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-nc-panel-hover text-nc-text-secondary shadow-sm transition-all hover:bg-nc-panel"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-nc-border bg-nc-surface px-8 shadow-sm">
      <span className="text-[14px] font-bold uppercase tracking-wider text-nc-text-secondary">{label}</span>
      {children}
    </div>
  );
}

const VIEW_ICONS: Record<WorkspaceView, { label: string; icon: React.ReactNode }> = {
  storyboard: {
    label: "Storyboard",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <rect x="0.5" y="0.5" width="5.5" height="5.5" rx="1" />
        <rect x="8" y="0.5" width="5.5" height="5.5" rx="1" />
        <rect x="0.5" y="8" width="5.5" height="5.5" rx="1" />
        <rect x="8" y="8" width="5.5" height="5.5" rx="1" />
      </svg>
    ),
  },
  canvas: {
    label: "Pipeline",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="3" cy="7" r="2" />
        <circle cx="11" cy="4" r="2" />
        <circle cx="11" cy="10" r="2" />
        <path d="M5 7l4-2.5M5 7l4 2.5" />
      </svg>
    ),
  },
  split: {
    label: "Split",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1" y="1" width="12" height="12" rx="1.5" />
        <line x1="7" y1="1" x2="7" y2="13" />
      </svg>
    ),
  },
};

function ViewToggle() {
  const { workspaceView, setWorkspaceView } = useAppStore();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-nc-border bg-nc-surface p-1 shadow-sm">
      {(Object.keys(VIEW_ICONS) as WorkspaceView[]).map((view) => {
        const { label, icon } = VIEW_ICONS[view];
        const isActive = workspaceView === view;
        return (
          <button
            key={view}
            onClick={() => setWorkspaceView(view)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium transition-colors",
              isActive
                ? "bg-nc-panel text-nc-text ring-1 ring-nc-border-strong shadow-sm"
                : "text-nc-text-tertiary hover:bg-nc-panel hover:text-nc-text-secondary"
            )}
            title={label}
          >
            {icon}
            <span className={cn(isActive ? "inline" : "hidden sm:inline")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function WorkspaceLayout() {
  const sidebarPage = useAppStore((s) => s.sidebarPage);
  const workspaceView = useAppStore((s) => s.workspaceView);
  const inspectorCollapsed = useAppStore((s) => s.inspectorCollapsed);
  const [canvasWidth, setCanvasWidth] = useState(55);
  const [timelineHeight, setTimelineHeight] = useState(28);
  const [isDraggingH, setIsDraggingH] = useState(false);
  const [isDraggingV, setIsDraggingV] = useState(false);

  const handleHDrag = useCallback((e: React.MouseEvent) => {
    if (!isDraggingH) return;
    const container = (e.target as HTMLElement).closest("[data-workspace]");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setCanvasWidth(Math.max(25, Math.min(75, pct)));
  }, [isDraggingH]);

  const handleVDrag = useCallback((e: React.MouseEvent) => {
    if (!isDraggingV) return;
    const container = (e.target as HTMLElement).closest("[data-workspace]");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = ((rect.bottom - e.clientY) / rect.height) * 100;
    setTimelineHeight(Math.max(15, Math.min(50, pct)));
  }, [isDraggingV]);

  if (sidebarPage === "home") {
    return (
      <div className="relative flex flex-col flex-1 h-full overflow-hidden bg-nc-bg">
        <MainHeader />
        <HomePage />
      </div>
    );
  }

  if (sidebarPage === "projects") {
    return (
      <div className="relative flex flex-col flex-1 h-full overflow-hidden bg-nc-bg">
        <MainHeader />
        <ProjectsPanel />
      </div>
    );
  }

  if (sidebarPage === "library") {
    return (
      <div className="relative flex flex-col flex-1 h-full overflow-hidden bg-nc-bg">
        <MainHeader />
        <LibraryPanel />
      </div>
    );
  }

  if (sidebarPage === "templates") {
    return (
      <div className="relative flex flex-col flex-1 h-full overflow-hidden bg-nc-bg">
        <MainHeader />
        <TemplatePanel />
      </div>
    );
  }

  if (sidebarPage === "edit") {
    return (
      <div className="relative flex flex-1 h-full overflow-hidden bg-nc-bg flex-col">
        <MainHeader />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col border-r border-nc-border">
            <SectionHeader label="Video Editor" />
            <EditVideoPanel />
          </div>
          <div className="flex w-80 flex-col">
            <SectionHeader label="Preview" />
            <PreviewMonitor />
          </div>
        </div>
      </div>
    );
  }

  if (sidebarPage === "settings") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-nc-bg">
        <MainHeader />
        <div className="flex-1 flex flex-col">
          <SectionHeader label="Pipeline Configuration" />
          <SettingsPanel />
        </div>
      </div>
    );
  }

  if (sidebarPage === "agents") {
    return (
      <div className="relative flex flex-1 h-full overflow-hidden bg-nc-bg flex-col">
        <MainHeader />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col border-r border-nc-border">
            <DirectorInput />
          </div>
          <div className="flex w-[320px] flex-col border-l border-nc-border bg-nc-surface">
            <AgentLogPanel />
          </div>
        </div>
      </div>
    );
  }

  // Default fallback for "workspace" or any unhandled sidebar page
  return (
    <div
      data-workspace
      className="relative flex flex-1 flex-col overflow-hidden bg-nc-bg"
      onMouseMove={(e) => { handleHDrag(e); handleVDrag(e); }}
      onMouseUp={() => { setIsDraggingH(false); setIsDraggingV(false); }}
      onMouseLeave={() => { setIsDraggingH(false); setIsDraggingV(false); }}
    >
      <MainHeader />
      {/* Top toolbar with view toggle */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-nc-border bg-nc-surface px-8 shadow-sm">
        <ViewToggle />
        <div className="flex items-center gap-2">
          <button
            onClick={() => useAppStore.getState().setPreviewFullscreen(!useAppStore.getState().previewFullscreen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-nc-text-tertiary transition-colors hover:border-nc-border hover:bg-nc-panel hover:text-nc-text-secondary"
            title="Toggle preview"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="1,4 1,1 4,1" />
              <polyline points="8,1 11,1 11,4" />
              <polyline points="11,8 11,11 8,11" />
              <polyline points="4,11 1,11 1,8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden" style={{ height: `${100 - timelineHeight}%` }}>
        {workspaceView === "storyboard" && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <StoryboardPanel />
            </div>
            {!inspectorCollapsed && (
              <>
                <div className="w-px shrink-0 bg-nc-border" />
                <div className="w-[340px] shrink-0 overflow-hidden">
                  <PreviewMonitor />
                </div>
              </>
            )}
          </div>
        )}

        {workspaceView === "canvas" && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <NodeCanvas />
            </div>
            {!inspectorCollapsed && (
              <>
                <div className="w-px shrink-0 bg-nc-border" />
                <div className="flex w-[340px] shrink-0 flex-col overflow-hidden">
                  <PreviewMonitor />
                </div>
              </>
            )}
          </div>
        )}

        {workspaceView === "split" && (
          <>
            <div className="overflow-hidden" style={{ width: `${canvasWidth}%` }}>
              <StoryboardPanel />
            </div>
            {/* Horizontal resize handle */}
            <div
              className="relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-nc-surface transition-colors hover:bg-nc-panel-hover"
              onMouseDown={() => setIsDraggingH(true)}
            >
              <div className={cn("h-8 w-0.5 rounded-full", isDraggingH ? "bg-nc-accent" : "bg-nc-border-strong")} />
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <PreviewMonitor />
              </div>
              <InspectorPanel />
            </div>
          </>
        )}
      </div>

      {/* Vertical resize handle */}
      <div
        className="relative z-10 flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-nc-surface transition-colors hover:bg-nc-panel-hover"
        onMouseDown={() => setIsDraggingV(true)}
      >
        <div className={cn("h-0.5 w-8 rounded-full", isDraggingV ? "bg-nc-accent" : "bg-nc-border-strong")} />
      </div>

      {/* Bottom: Timeline */}
      <div style={{ height: `${timelineHeight}%` }} className="overflow-hidden">
        <TimelineEditor />
      </div>
    </div>
  );
}
