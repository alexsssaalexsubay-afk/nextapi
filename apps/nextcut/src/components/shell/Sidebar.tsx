import { cn } from "@/lib/cn";
import { useAppStore, type SidebarPage } from "@/stores/app-store";
import { useI18nStore } from "@/stores/i18n-store";

const NAV_ITEMS: { id: SidebarPage; labelKey: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    id: "home",
    labelKey: "nav.create",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5,3 17,10 5,17" />
      </svg>
    ),
  },
  {
    id: "projects",
    labelKey: "nav.projects",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M3 8h14" />
        <path d="M8 4v4" />
      </svg>
    ),
  },
  {
    id: "agents",
    labelKey: "nav.director",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l7-4 7 4v6l-7 4-7-4V7z" />
        <path d="M10 3v14" />
        <path d="M3 7l7 4 7-4" />
      </svg>
    ),
  },
  {
    id: "library",
    labelKey: "nav.library",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="11" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="11" width="6" height="6" rx="1" />
        <rect x="11" y="11" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    id: "templates",
    labelKey: "nav.templates",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <path d="M3 8h14" />
        <path d="M8 8v9" />
      </svg>
    ),
  },
  {
    id: "edit",
    labelKey: "nav.edit",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3l3 3L7 16H4v-3L14 3z" />
        <path d="M11 6l3 3" />
      </svg>
    ),
  },
  {
    id: "workspace",
    labelKey: "nav.workspace",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <path d="M3 14l4-4 4 4 6-6" />
      </svg>
    ),
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="3" />
        <path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18" />
        <path d="M4.93 4.93l1.77 1.77M13.3 13.3l1.77 1.77M15.07 4.93l-1.77 1.77M6.7 13.3l-1.77 1.77" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const { sidebarPage, setSidebarPage } = useAppStore();
  const { t } = useI18nStore();

  return (
    <div className="flex w-[240px] shrink-0 flex-col border-r border-nc-border bg-nc-surface shadow-sm">
      {/* Logo mark */}
      <div className="flex h-[72px] w-full items-center gap-3 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-nc-accent text-nc-surface font-sans font-bold shadow-sm">
          N
        </div>
        <span className="text-[18px] font-bold text-nc-text tracking-tight">NextCut</span>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col gap-1.5 px-4 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = sidebarPage === item.id;
          const label = t(item.labelKey);
          return (
            <button
              key={item.id}
              onClick={() => setSidebarPage(item.id)}
              className={cn(
                "group flex h-11 w-full items-center gap-3 rounded-xl px-4 transition-all duration-200",
                isActive
                  ? "bg-nc-accent/10 text-nc-accent font-bold"
                  : "text-nc-text-secondary hover:bg-nc-panel hover:text-nc-text font-medium"
              )}
            >
              <div className="shrink-0">
                {item.icon(isActive)}
              </div>
              <span className="text-[14px] truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom: account / language */}
      <div className="flex flex-col gap-4 p-4 border-t border-nc-border">
        {/* Quota mock */}
        <div className="rounded-xl border border-nc-border bg-nc-panel/50 p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-nc-text-secondary">本月渲染时长</span>
          </div>
          <div className="mb-2 text-[14px] font-bold text-nc-text">
            32h <span className="text-[12px] font-medium text-nc-text-tertiary">/ 100h</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-nc-border overflow-hidden mb-3">
            <div className="h-full bg-nc-accent w-[32%]" />
          </div>
          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-nc-accent/10 py-2 text-[13px] font-bold text-nc-accent transition-colors hover:bg-nc-accent/20">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            升级套餐
          </button>
        </div>
      </div>
    </div>
  );
}
