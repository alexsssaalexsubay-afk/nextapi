import { useState } from "react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { useI18nStore } from "@/stores/i18n-store";

type AuthTab = "login" | "license";

export function LoginPanel() {
  const [tab, setTab] = useState<AuthTab>("login");
  const [licenseKey, setLicenseKey] = useState("");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const { loginWithPassword, isLoading, error, clearError, user } = useAuthStore();
  const { setSidebarPage } = useAppStore();
  const { t } = useI18nStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    try {
      await loginWithPassword(email, password);
      // Optional: Redirect to workspace on success
      setSidebarPage("workspace");
    } catch (err) {
      // Error is handled in the store
    }
  };

  if (user) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-nc-accent/10 text-nc-accent">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-nc-text">{t("auth.signedIn")}</h2>
          <p className="mb-8 text-sm text-nc-text-tertiary">{user.email}</p>
          <button 
            onClick={() => setSidebarPage("workspace")}
            className="h-10 w-full rounded-[var(--radius-md)] bg-nc-accent text-sm font-semibold text-nc-bg hover:bg-nc-accent-hover"
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
          <span className="text-[16px] font-semibold text-nc-text">NextCut</span>
        </div>

        {/* Tab switcher */}
        <div className="mb-5 flex rounded-[var(--radius-md)] border border-nc-border bg-nc-panel p-0.5">
          {(["login", "license"] as AuthTab[]).map((tId) => (
            <button
              key={tId}
              onClick={() => { setTab(tId); clearError(); }}
              className={cn(
                "h-7 flex-1 rounded-[var(--radius-sm)] text-[11px] font-medium",
                tab === tId ? "bg-nc-panel-active text-nc-text" : "text-nc-text-ghost hover:text-nc-text-tertiary"
              )}
            >
              {tId === "login" ? t("auth.account") : t("auth.license")}
            </button>
          ))}
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <p className="mb-2 text-[12px] leading-relaxed text-nc-text-tertiary">
              {t("auth.unlockMessage")}
            </p>
            
            {error && (
              <div className="rounded-[var(--radius-sm)] bg-red-500/10 px-3 py-2 text-[12px] text-red-500">
                {error}
              </div>
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.email")}
              className="h-9 rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel px-3 text-[12px] text-nc-text outline-none placeholder:text-nc-text-ghost focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10"
              required
            />
            
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.password")}
              className="h-9 rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel px-3 text-[12px] text-nc-text outline-none placeholder:text-nc-text-ghost focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10"
              required
            />

            <button 
              type="submit"
              disabled={isLoading || !email || !password}
              className={cn(
                "mt-2 h-9 rounded-[var(--radius-md)] text-[12px] font-semibold transition-colors",
                isLoading || !email || !password 
                  ? "bg-nc-panel text-nc-text-ghost cursor-not-allowed" 
                  : "bg-nc-accent text-nc-bg hover:bg-nc-accent-hover"
              )}
            >
              {isLoading ? t("auth.signingIn") : t("auth.signInNextAPI")}
            </button>
            <div className="mt-2 text-center text-[10px] text-nc-text-ghost">
              {t("auth.orFree")}
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] leading-relaxed text-nc-text-tertiary">
              {t("auth.enterLicense")}
            </p>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="NEXTCUT-XXXX-XXXX-XXXX"
              className="h-8 rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel px-3 font-mono text-[12px] text-nc-text outline-none placeholder:text-nc-text-ghost focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10"
            />
            <button
              disabled={!licenseKey.trim()}
              className={cn(
                "h-9 rounded-[var(--radius-md)] text-[12px] font-semibold",
                licenseKey.trim()
                  ? "bg-nc-accent text-nc-bg hover:bg-nc-accent-hover"
                  : "bg-nc-panel text-nc-text-ghost cursor-not-allowed"
              )}
            >
              {t("auth.activateLicense")}
            </button>
          </div>
        )}

        <div className="mt-8 text-center">
          <div className="text-[10px] text-nc-text-ghost">{t("auth.freeFeatures")}</div>
          <div className="mt-1 text-[10px] text-nc-accent/60">{t("auth.proFeatures")}</div>
        </div>
      </div>
    </div>
  );
}
