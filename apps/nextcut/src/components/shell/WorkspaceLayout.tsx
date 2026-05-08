import { useRef, useState } from "react";
import { Bell, Globe2, Search, Upload, UserRound } from "lucide-react";
import { useAppStore, type WorkspaceView } from "@/stores/app-store";
import { NodeCanvas } from "@/components/canvas/NodeCanvas";
import { PreviewMonitor } from "@/components/preview/PreviewMonitor";
import { TimelineEditor } from "@/components/timeline/TimelineEditor";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { SettingsPanel } from "@/components/panels/SettingsPanel";
import { DirectorInput } from "@/components/panels/DirectorInput";
import { HomePage } from "@/components/panels/HomePage";
import { ProjectsPanel } from "@/components/panels/ProjectsPanel";
import { StoryboardPanel } from "@/components/panels/StoryboardPanel";
import { LibraryPanel } from "@/components/panels/LibraryPanel";
import { TemplatePanel } from "@/components/panels/TemplatePanel";
import { GuidePanel } from "@/components/panels/GuidePanel";
import { StoryflowWorkspace } from "@/components/storyflow/StoryflowWorkspace";
import { useI18nStore } from "@/stores/i18n-store";
import { useAuthStore } from "@/stores/auth-store";
import { useDirectorStore } from "@/stores/director-store";
import { Button, FieldShell, Pill, Segmented } from "@/components/ui/kit";

function MainHeader() {
  const { lang, setLang } = useI18nStore();
  const { user, logout } = useAuthStore();
  const setPipeline = useDirectorStore((s) => s.setPipeline);
  const { setSidebarPage } = useAppStore();
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleImport = () => {
    uploadInputRef.current?.click();
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    (window as Window & { __nextcutPendingImportFiles?: File[] }).__nextcutPendingImportFiles = selectedFiles;
    window.dispatchEvent(new CustomEvent("nextcut:import-files"));
    setSidebarPage("library");
  };

  const handleLogout = () => {
    setPipeline({ video_api_key: "" });
    logout();
  };

  return (
    <div className="relative z-10 flex h-[64px] shrink-0 items-center gap-4 border-b border-nc-border bg-white/94 px-6 shadow-[0_8px_28px_rgba(15,23,42,0.035)] backdrop-blur">
      <div className="flex min-w-0 flex-1 justify-center">
        <FieldShell className="h-11 w-full max-w-[620px] rounded-[16px] bg-white/95 shadow-[0_8px_24px_rgba(15,23,42,0.055)]">
          <Search className="h-4 w-4 shrink-0 text-nc-text-tertiary" />
          <input
            onFocus={() => setSidebarPage("projects")}
            placeholder="搜索项目、素材、模板..."
            className="min-w-0 flex-1 bg-transparent text-[14px] leading-6 text-nc-text outline-none placeholder:text-nc-text-tertiary"
          />
          <span className="nc-kbd shrink-0">⌘ K</span>
        </FieldShell>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(event) => handleFilesSelected(event.target.files)}
        />
        <Button className="h-11" onClick={handleImport}>
          <Upload className="h-4 w-4" />
          导入素材
        </Button>
        
        <Button size="icon" aria-label="通知" title="通知" onClick={() => setSidebarPage("guide")}>
          <Bell className="h-[18px] w-[18px]" />
        </Button>

        <Button
          onClick={() => setLang(lang === "en" ? "zh" : "en")}
          className="uppercase"
        >
          <Globe2 className="h-4 w-4" />
          {lang}
        </Button>

        {user ? (
          <button
            onClick={handleLogout}
            className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-nc-accent text-[14px] font-bold text-white shadow-md transition-all hover:bg-nc-accent-hover hover:scale-105"
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
            className="flex h-11 w-11 items-center justify-center rounded-full bg-nc-panel-hover text-nc-text-secondary shadow-sm transition-all hover:bg-nc-panel"
            aria-label="账户与设置"
            title="账户与设置"
          >
            <UserRound className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

const VIEW_ICONS: Record<WorkspaceView, { label: string; icon: React.ReactNode }> = {
  storyboard: {
    label: "分镜",
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
    label: "流程",
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
    label: "分屏",
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
    <Segmented
      value={workspaceView}
      onChange={setWorkspaceView}
      options={(Object.keys(VIEW_ICONS) as WorkspaceView[]).map((view) => ({ value: view, label: VIEW_ICONS[view].label }))}
    />
  );
}

export function WorkspaceLayout() {
  const sidebarPage = useAppStore((s) => s.sidebarPage);
  const workspaceView = useAppStore((s) => s.workspaceView);
  const [showShortcuts, setShowShortcuts] = useState(false);

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

  if (sidebarPage === "guide") {
    return (
      <div className="relative flex flex-col flex-1 h-full overflow-hidden bg-nc-bg">
        <MainHeader />
        <GuidePanel />
      </div>
    );
  }

  if (sidebarPage === "edit") {
    return (
      <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-nc-bg">
        <MainHeader />
        <div className="flex min-h-[72px] shrink-0 items-center justify-between border-b border-nc-border bg-nc-surface px-7">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-semibold leading-5 text-nc-text-tertiary">编辑视频 /</span>
              <h1 className="truncate text-[19px] font-semibold leading-7 text-nc-text">AI 导演生成项目</h1>
              <Pill tone="success">自动保存成功</Pill>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => setShowShortcuts(true)}>
              快捷键
            </Button>
            <ViewToggle />
            <Button variant="primary">导出视频</Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              {workspaceView === "canvas" ? <NodeCanvas /> : <StoryboardPanel />}
            </div>
            <div className="h-[32%] min-h-[220px] border-t border-nc-border">
              <TimelineEditor />
            </div>
          </div>
          <div className="flex w-[390px] shrink-0 flex-col border-l border-nc-border bg-nc-surface">
            <div className="h-[44%] min-h-[300px] shrink-0 border-b border-nc-border">
              <PreviewMonitor />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <InspectorPanel />
            </div>
          </div>
        </div>
        {showShortcuts && (
          <div className="absolute right-7 top-[150px] z-30 w-[320px] rounded-[18px] border border-nc-border bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-[16px] font-semibold leading-6 text-nc-text">工作区快捷键</h2>
              <button onClick={() => setShowShortcuts(false)} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-nc-text-tertiary hover:bg-nc-bg hover:text-nc-text" aria-label="关闭快捷键">
                ×
              </button>
            </div>
            <div className="grid gap-2">
              {[
                ["⌘/Ctrl + 1", "切换到分镜"],
                ["⌘/Ctrl + 2", "切换到流程画布"],
                ["⌘/Ctrl + 3", "切换到分屏"],
                ["← / →", "切换上一个 / 下一个镜头"],
                ["Esc", "取消当前镜头选择"],
              ].map(([key, label]) => (
                <div key={key} className="flex min-h-10 items-center justify-between gap-4 rounded-[12px] bg-nc-bg px-3 py-2">
                  <span className="text-[13px] leading-5 text-nc-text-secondary">{label}</span>
                  <span className="rounded-[8px] border border-nc-border bg-white px-2.5 py-1 font-mono text-[12px] font-semibold leading-4 text-nc-text">{key}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (sidebarPage === "settings") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-nc-bg">
        <MainHeader />
        <div className="flex min-h-0 flex-1 flex-col">
          <SettingsPanel />
        </div>
      </div>
    );
  }

  if (sidebarPage === "agents") {
    return (
      <div className="relative flex flex-1 h-full overflow-hidden bg-nc-bg flex-col">
        <MainHeader />
        <div className="relative flex flex-1 overflow-hidden">
          <DirectorInput />
        </div>
      </div>
    );
  }

  return <StoryflowWorkspace />;
}
