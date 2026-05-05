import { Titlebar } from "@/components/shell/Titlebar";
import { Sidebar } from "@/components/shell/Sidebar";
import { StatusBar } from "@/components/shell/StatusBar";
import { WorkspaceLayout } from "@/components/shell/WorkspaceLayout";
import { UpdateBanner } from "@/components/shell/UpdateBanner";
import { Toast } from "@/components/shell/Toast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export function AppShell() {
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen flex-col bg-nc-bg text-sm select-none antialiased">
      <Titlebar />
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <WorkspaceLayout />
        </main>
      </div>
      <StatusBar />
      <Toast />
    </div>
  );
}
