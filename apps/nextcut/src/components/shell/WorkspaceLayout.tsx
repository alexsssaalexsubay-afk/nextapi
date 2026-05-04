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

function SectionHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between border-b border-nc-border px-4">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">{label}</span>
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
    <div className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-nc-border bg-nc-panel p-0.5">
      {(Object.keys(VIEW_ICONS) as WorkspaceView[]).map((view) => {
        const { label, icon } = VIEW_ICONS[view];
        const isActive = workspaceView === view;
        return (
          <button
            key={view}
            onClick={() => setWorkspaceView(view)}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[10px] font-medium transition-all duration-150",
              isActive
                ? "bg-nc-panel-active text-nc-text shadow-sm"
                : "text-nc-text-ghost hover:text-nc-text-tertiary"
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
    return <HomePage />;
  }

  if (sidebarPage === "projects") {
    return <ProjectsPanel />;
  }

  if (sidebarPage === "library") {
    return <LibraryPanel />;
  }

  if (sidebarPage === "templates") {
    return <TemplatePanel />;
  }

  if (sidebarPage === "edit") {
    return (
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
    );
  }

  if (sidebarPage === "settings") {
    return (
      <div className="flex-1 overflow-hidden">
        <SectionHeader label="Pipeline Configuration" />
        <SettingsPanel />
      </div>
    );
  }

  if (sidebarPage === "agents") {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col border-r border-nc-border">
          <SectionHeader label="Director">
            <ViewToggle />
          </SectionHeader>
          <DirectorInput />
        </div>
        <div className="flex w-80 flex-col">
          <SectionHeader label="Pipeline Log" />
          <AgentLogPanel />
        </div>
      </div>
    );
  }

  // Library view (default workspace)
  return (
    <div
      data-workspace
      className="flex flex-1 flex-col overflow-hidden"
      onMouseMove={(e) => { handleHDrag(e); handleVDrag(e); }}
      onMouseUp={() => { setIsDraggingH(false); setIsDraggingV(false); }}
      onMouseLeave={() => { setIsDraggingH(false); setIsDraggingV(false); }}
    >
      {/* Top toolbar with view toggle */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-nc-border px-4">
        <ViewToggle />
        <div className="flex items-center gap-2">
          <button
            onClick={() => useAppStore.getState().setPreviewFullscreen(!useAppStore.getState().previewFullscreen)}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-nc-text-ghost hover:bg-nc-panel-hover hover:text-nc-text-tertiary"
            title="Toggle preview"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
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
            <div
              className={cn(
                "w-px shrink-0 cursor-col-resize",
                isDraggingH ? "bg-nc-accent/40" : "bg-nc-border hover:bg-nc-border-strong"
              )}
              onMouseDown={() => setIsDraggingH(true)}
            />
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
        className={cn(
          "h-px shrink-0 cursor-row-resize",
          isDraggingV ? "bg-nc-accent/40" : "bg-nc-border hover:bg-nc-border-strong"
        )}
        onMouseDown={() => setIsDraggingV(true)}
      />

      {/* Bottom: Timeline */}
      <div style={{ height: `${timelineHeight}%` }} className="overflow-hidden">
        <TimelineEditor />
      </div>
    </div>
  );
}
