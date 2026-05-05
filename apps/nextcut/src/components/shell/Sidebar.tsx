import { cn } from "@/lib/cn";
import { useAppStore, type SidebarPage } from "@/stores/app-store";
import { useI18nStore } from "@/stores/i18n-store";
import { useAuthStore } from "@/stores/auth-store";

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
  const { t, lang, setLang } = useI18nStore();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center border-r border-nc-border bg-nc-sidebar shadow-sm">
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
          const label = t(item.labelKey);
          return (
            <button
              key={item.id}
              onClick={() => setSidebarPage(item.id)}
              className={cn(
                "group relative flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] transition-all duration-150",
                isActive
                  ? "bg-nc-accent-dim text-nc-accent shadow-sm"
                  : "text-nc-text-tertiary hover:bg-nc-panel-hover hover:text-nc-text-secondary hover:shadow-sm"
              )}
              title={label}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-nc-accent" />
              )}
              {item.icon(isActive)}

              {/* Tooltip */}
              <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-lg border border-nc-border bg-nc-elevated px-2.5 py-1.5 text-sm font-medium text-nc-text opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                {label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom: account / language */}
      <div className="flex flex-col items-center gap-2 pb-3">
        <button
          onClick={() => setLang(lang === "en" ? "zh" : "en")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold uppercase text-nc-text-secondary ring-1 ring-nc-border/60 transition-all hover:bg-nc-panel-hover hover:text-nc-text hover:shadow-sm"
          title={t("nav.toggleLang")}
        >
          {lang}
        </button>
        
        {user ? (
          <button
            onClick={logout}
            className="group relative flex h-9 w-9 items-center justify-center rounded-full bg-nc-accent/20 text-sm font-medium text-nc-accent shadow-sm transition-all hover:bg-red-500/20 hover:text-red-500 hover:shadow-md hover:ring-1 hover:ring-red-500/30"
            title={`${t("nav.logout")} (${user.email})`}
          >
            <span className="group-hover:hidden">{user.email.charAt(0).toUpperCase()}</span>
            <svg className="hidden h-3.5 w-3.5 group-hover:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        ) : (
          <button
            onClick={() => setSidebarPage("settings")}
            className="group relative flex h-9 w-9 items-center justify-center rounded-full bg-nc-panel-hover text-sm font-medium text-nc-text-secondary shadow-sm ring-1 ring-nc-border/50 transition-all hover:bg-nc-panel-active hover:shadow-md hover:ring-nc-accent/30"
            title={t("nav.signIn")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
