import { cn } from "@/lib/cn";
import { useAppStore, type SidebarPage } from "@/stores/app-store";

const NAV_ITEMS: { id: SidebarPage; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    id: "home",
    label: "Create",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5,3 17,10 5,17" />
      </svg>
    ),
  },
  {
    id: "projects",
    label: "Projects",
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
    label: "Director",
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
    label: "Library",
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
    label: "Templates",
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
    label: "Edit",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={a ? "1.8" : "1.4"} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3l3 3L7 16H4v-3L14 3z" />
        <path d="M11 6l3 3" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
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

  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center border-r border-nc-border bg-nc-sidebar">
      {/* Logo mark */}
      <div className="flex h-10 w-full items-center justify-center">
        <div className="relative h-2.5 w-2.5">
          <div className="absolute inset-0 rounded-full bg-nc-accent" />
          <div className="absolute inset-0 animate-glow-pulse rounded-full bg-nc-accent" />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col items-center gap-0.5 py-1">
        {NAV_ITEMS.map((item) => {
          const isActive = sidebarPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSidebarPage(item.id)}
              className={cn(
                "group relative flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] transition-all duration-150",
                isActive
                  ? "bg-nc-accent-dim text-nc-accent"
                  : "text-nc-text-tertiary hover:bg-nc-panel-hover hover:text-nc-text-secondary"
              )}
              title={item.label}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-nc-accent" />
              )}
              {item.icon(isActive)}

              {/* Tooltip */}
              <div className="pointer-events-none absolute left-full ml-2 rounded-[var(--radius-sm)] bg-nc-elevated px-2 py-1 text-[10px] font-medium text-nc-text opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {item.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom: account */}
      <div className="flex flex-col items-center gap-1 pb-3">
        <button
          className="group relative flex h-8 w-8 items-center justify-center rounded-full bg-nc-panel-hover text-[11px] font-medium text-nc-text-secondary transition-all hover:bg-nc-panel-active hover:ring-1 hover:ring-nc-accent/20"
          title="Account"
        >
          U
        </button>
      </div>
    </div>
  );
}
