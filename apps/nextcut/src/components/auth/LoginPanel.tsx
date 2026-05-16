import { useState } from "react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { useI18nStore } from "@/stores/i18n-store";
import { useDirectorStore } from "@/stores/director-store";

type AuthTab = "login" | "license";

export function LoginPanel() {
  const [tab, setTab] = useState<AuthTab>("login");
  const [licenseKey, setLicenseKey] = useState("");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const { loginWithPassword, isLoading, error, clearError, user } = useAuthStore();
  const { setSidebarPage } = useAppStore();
  const { t } = useI18nStore();
  const { pipeline, setPipeline } = useDirectorStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    try {
      await loginWithPassword(email, password);
      const dashboardKey = useAuthStore.getState().user?.dashboardKey;
      if (dashboardKey && (!pipeline.video_api_key || pipeline.video_provider === "seedance" || pipeline.video_provider === "nextapi")) {
        setPipeline({
          video_provider: "nextapi",
          video_base_url: "https://api.nextapi.top/v1",
          video_api_key: dashboardKey,
        });
      }
      setSidebarPage("workspace");
    } catch (err) {
      // Error is handled in the store
    }
  };

  if (user) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-nc-border bg-nc-panel/40 p-8 text-center shadow-sm">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-nc-accent/10 text-nc-accent shadow-sm ring-1 ring-nc-accent/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-nc-text">{t("auth.signedIn")}</h2>
          <p className="mb-8 text-base text-nc-text-secondary">{user.email}</p>
          <button
            onClick={() => setSidebarPage("workspace")}
            className="h-11 w-full rounded-[var(--radius-lg)] bg-nc-accent text-base font-semibold text-nc-bg shadow-md transition-all hover:bg-nc-accent-hover hover:shadow-lg"
          >
            {t("auth.goWorkspace")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5L7 1L12 3.5V7L7 13L2 7V3.5Z" fill="currentColor" className="text-nc-accent" />
              <path d="M7 1L12 3.5L7 6L2 3.5L7 1Z" fill="currentColor" className="text-nc-accent" opacity="0.6" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-nc-text">NextAPI Studio</span>
        </div>

        {/* Tab switcher */}
        <div className="mb-5 flex rounded-[var(--radius-lg)] border border-nc-border bg-nc-panel p-1 shadow-sm hover:shadow-md">
          {(["login", "license"] as AuthTab[]).map((tId) => (
            <button
              key={tId}
              onClick={() => { setTab(tId); clearError(); }}
              className={cn(
                "h-9 flex-1 rounded-lg text-sm font-medium transition-all",
                tab === tId ? "bg-nc-panel-active text-nc-text shadow-sm" : "text-nc-text-tertiary hover:bg-nc-panel-hover hover:text-nc-text-secondary"
              )}
            >
              {tId === "login" ? t("auth.account") : t("auth.license")}
            </button>
          ))}
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <p className="mb-2 text-sm leading-relaxed text-nc-text-secondary">
              {t("auth.unlockMessage")}
            </p>
            
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-500 shadow-sm">
                {error}
              </div>
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.email")}
              className="h-11 rounded-lg border border-nc-border bg-nc-panel px-3.5 text-sm text-nc-text shadow-sm outline-none transition-all placeholder:text-nc-text-tertiary focus:border-nc-accent/50 focus:ring-2 focus:ring-nc-accent/15"
              required
            />
            
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.password")}
              className="h-11 rounded-lg border border-nc-border bg-nc-panel px-3.5 text-sm text-nc-text shadow-sm outline-none transition-all placeholder:text-nc-text-tertiary focus:border-nc-accent/50 focus:ring-2 focus:ring-nc-accent/15"
              required
            />

            <button 
              type="submit"
              disabled={isLoading || !email || !password}
              className={cn(
                "mt-2 h-11 rounded-[var(--radius-lg)] text-sm font-semibold transition-all",
                isLoading || !email || !password 
                  ? "cursor-not-allowed bg-nc-panel text-nc-text-tertiary" 
                  : "bg-nc-accent text-nc-bg shadow-md hover:bg-nc-accent-hover hover:shadow-lg"
              )}
            >
              {isLoading ? t("auth.signingIn") : t("auth.signInNextAPI")}
            </button>
            <div className="mt-2 text-center text-xs text-nc-text-tertiary">
              {t("auth.orFree")}
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-nc-text-secondary">
              {t("auth.enterLicense")}
            </p>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="NEXTAPI-XXXX-XXXX-XXXX"
              className="h-11 rounded-lg border border-nc-border bg-nc-panel px-3 font-mono text-sm text-nc-text shadow-sm outline-none transition-all placeholder:text-nc-text-tertiary focus:border-nc-accent/50 focus:ring-2 focus:ring-nc-accent/15"
            />
            <button
              disabled={!licenseKey.trim()}
              className={cn(
                "h-11 rounded-[var(--radius-lg)] text-sm font-semibold transition-all",
                licenseKey.trim()
                  ? "bg-nc-accent text-nc-bg shadow-md hover:bg-nc-accent-hover hover:shadow-lg"
                  : "cursor-not-allowed bg-nc-panel text-nc-text-tertiary"
              )}
            >
              {t("auth.activateLicense")}
            </button>
          </div>
        )}

        <div className="mt-8 text-center">
          <div className="text-xs text-nc-text-tertiary">{t("auth.freeFeatures")}</div>
          <div className="mt-1 text-xs text-nc-accent/80">{t("auth.proFeatures")}</div>
        </div>
      </div>
    </div>
  );
}
