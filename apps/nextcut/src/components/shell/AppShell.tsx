import { Sidebar } from "@/components/shell/Sidebar";
import { WorkspaceLayout } from "@/components/shell/WorkspaceLayout";
import { UpdateBanner } from "@/components/shell/UpdateBanner";
import { Toast } from "@/components/shell/Toast";
import { WindowTitleBar } from "@/components/shell/WindowTitleBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAppStore } from "@/stores/app-store";

export function AppShell() {
  useKeyboardShortcuts();
  const sidebarPage = useAppStore((s) => s.sidebarPage);
  const workspaceCleanMode = useAppStore((s) => s.workspaceCleanMode);
  const hideSidebar = workspaceCleanMode && sidebarPage === "workspace";

  return (
    <div className="flex h-screen flex-col bg-nc-bg text-sm select-none antialiased">
      <WindowTitleBar />
      <UpdateBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!hideSidebar && <Sidebar />}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkspaceLayout />
        </main>
      </div>
      <Toast />
    </div>
  );
}
