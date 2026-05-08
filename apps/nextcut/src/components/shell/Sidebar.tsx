import {
  BookOpen,
  Box,
  ChevronDown,
  Clapperboard,
  FolderKanban,
  Grid2X2,
  Home,
  Image,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Settings,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { useAppStore, type SidebarPage } from "@/stores/app-store";
import { useI18nStore } from "@/stores/i18n-store";
import { Button } from "@/components/ui/kit";

const NAV_ITEMS: { id: SidebarPage; labelKey: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: "home", labelKey: "nav.create", icon: Home },
  { id: "projects", labelKey: "nav.projects", icon: FolderKanban },
  { id: "agents", labelKey: "nav.director", icon: Box },
  { id: "library", labelKey: "nav.library", icon: Grid2X2 },
  { id: "templates", labelKey: "nav.templates", icon: Clapperboard },
  { id: "edit", labelKey: "nav.edit", icon: PenLine },
  { id: "workspace", labelKey: "nav.workspace", icon: Image },
  { id: "guide", labelKey: "nav.guide", icon: BookOpen },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
];

function NextCutMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <img
        src="/brand/nextcut-logo-icon.png"
        alt="NextCut"
        draggable={false}
        className="h-9 w-9 shrink-0 rounded-[11px] object-cover"
      />
    );
  }

  return (
    <img
      src="/brand/nextcut-logo-lockup-sidebar.png"
      alt="NextCut"
      draggable={false}
      className="h-11 w-[172px] min-w-0 shrink object-contain object-left"
    />
  );
}

export function Sidebar() {
  const { sidebarPage, setSidebarPage, sidebarCollapsed, setSidebarCollapsed, sidecarStatus, comfyuiStatus } = useAppStore();
  const { t } = useI18nStore();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  return (
    <div className={cn(
      "flex shrink-0 flex-col border-r border-nc-border bg-white transition-[width] duration-200",
      sidebarCollapsed ? "w-[88px]" : "w-[260px]"
    )}>
      <div className={cn("flex h-16 w-full items-center justify-between border-b border-nc-border/70", sidebarCollapsed ? "justify-center px-4" : "px-4")}>
        <NextCutMark compact={sidebarCollapsed} />
        {!sidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-[10px] shadow-none"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="收起侧边栏"
            title="收起侧边栏"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {sidebarCollapsed && (
        <div className="mb-3 px-3">
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-full rounded-[12px]"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="展开侧边栏"
            title="展开侧边栏"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className={cn("pt-4", sidebarCollapsed ? "px-3" : "px-4")}>
        <button
          type="button"
          onClick={() => sidebarCollapsed ? setSidebarCollapsed(false) : setWorkspaceOpen((open) => !open)}
          className={cn(
            "flex w-full min-w-0 items-center rounded-[14px] border border-nc-border bg-white text-left shadow-[0_8px_24px_rgba(15,23,42,0.045)] transition-all hover:-translate-y-0.5 hover:border-nc-border-strong hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)]",
            sidebarCollapsed ? "h-12 justify-center px-2" : "min-h-[62px] gap-3 px-3.5 py-3"
          )}
          aria-expanded={!sidebarCollapsed && workspaceOpen}
          aria-label="打开工作区菜单"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#F5F3FF] text-nc-accent">
            <UserRound className="h-4.5 w-4.5" />
          </span>
          {!sidebarCollapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold leading-5 text-nc-text">本地工作区</span>
                <span className="mt-0.5 block truncate text-[12px] leading-4 text-nc-text-secondary">未登录 · 配置保存在本机</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-nc-text-tertiary transition-transform", workspaceOpen && "rotate-180")} />
            </>
          )}
        </button>

        {!sidebarCollapsed && workspaceOpen && (
          <div className="mt-2 overflow-hidden rounded-[14px] border border-nc-border bg-white p-1 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
            <button
              type="button"
              onClick={() => {
                setSidebarPage("settings");
                setWorkspaceOpen(false);
              }}
              className="flex min-h-10 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[13px] font-medium text-nc-text-secondary hover:bg-nc-bg hover:text-nc-text"
            >
              <Settings className="h-4 w-4" />
              模型与账户设置
            </button>
            <button
              type="button"
              onClick={() => {
                setSidebarPage("projects");
                setWorkspaceOpen(false);
              }}
              className="flex min-h-10 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[13px] font-medium text-nc-text-secondary hover:bg-nc-bg hover:text-nc-text"
            >
              <FolderKanban className="h-4 w-4" />
              查看项目空间
            </button>
          </div>
        )}
      </div>

      <div className={cn("flex flex-1 flex-col gap-2 py-6", sidebarCollapsed ? "px-3" : "px-4")}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = sidebarPage === item.id;
          const label = t(item.labelKey);
          return (
            <button
              key={item.id}
              onClick={() => setSidebarPage(item.id)}
              title={label}
              className={cn(
                "group flex min-h-11 w-full items-center rounded-[12px] transition-all duration-200",
                sidebarCollapsed ? "justify-center px-3" : "gap-3 px-3.5",
                isActive
                  ? "bg-[#F1EDFF] text-nc-accent font-semibold shadow-sm ring-1 ring-nc-accent/10"
                  : "text-nc-text-secondary hover:bg-nc-panel hover:text-nc-text font-medium"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.1 : 1.8} />
              {!sidebarCollapsed && <span className="text-[14px] truncate">{label}</span>}
            </button>
          );
        })}
      </div>

      <div className={cn("border-t border-nc-border/70", sidebarCollapsed ? "p-3" : "p-4")}>
        <div className={cn("flex items-center gap-2 text-[12px] font-medium text-nc-text-tertiary", sidebarCollapsed ? "justify-center" : "justify-between")}>
          {!sidebarCollapsed && <span>运行状态</span>}
          <span className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", sidecarStatus === "connected" ? "bg-nc-success" : sidecarStatus === "connecting" ? "bg-nc-warning" : "bg-nc-text-tertiary")} />
            {!sidebarCollapsed && <span>Sidecar {sidecarStatus === "connected" ? "在线" : sidecarStatus === "connecting" ? "连接中" : "离线"}</span>}
          </span>
        </div>
        {!sidebarCollapsed && (
          <div className="mt-2 flex items-center gap-2 text-[12px] font-medium text-nc-text-tertiary">
            <span className={cn("h-2 w-2 rounded-full", comfyuiStatus === "connected" ? "bg-nc-success" : comfyuiStatus === "connecting" ? "bg-nc-warning" : "bg-nc-text-tertiary")} />
            <span>ComfyUI {comfyuiStatus === "connected" ? "在线" : comfyuiStatus === "connecting" ? "连接中" : "未连接"}</span>
          </div>
        )}
        {!sidebarCollapsed && (
          <Button variant="ghost" className="mt-3 h-9 w-full justify-start px-2 text-[13px] shadow-none" onClick={() => setSidebarPage("settings")}>
            <Settings className="h-4 w-4" />
            打开配置
          </Button>
        )}
        {sidebarCollapsed && (
          <Button variant="ghost" size="icon" className="mt-3 h-10 w-full rounded-[12px] shadow-none" onClick={() => setSidebarPage("settings")} aria-label="打开配置">
            <Settings className="h-4 w-4" />
          </Button>
        )}
        </div>
    </div>
  );
}
