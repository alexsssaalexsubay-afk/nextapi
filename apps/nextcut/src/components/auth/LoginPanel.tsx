import { useState } from "react";
import { cn } from "@/lib/cn";

type AuthTab = "login" | "license";

export function LoginPanel() {
  const [tab, setTab] = useState<AuthTab>("login");
  const [licenseKey, setLicenseKey] = useState("");

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
          {(["login", "license"] as AuthTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "h-7 flex-1 rounded-[var(--radius-sm)] text-[11px] font-medium",
                tab === t ? "bg-nc-panel-active text-nc-text" : "text-nc-text-ghost hover:text-nc-text-tertiary"
              )}
            >
              {t === "login" ? "NextAPI Account" : "License Key"}
            </button>
          ))}
        </div>

        {tab === "login" ? (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] leading-relaxed text-nc-text-tertiary">
              Sign in to unlock Seedance 2.0, unlimited projects, and Pro features.
            </p>
            <button className="h-9 rounded-[var(--radius-md)] bg-nc-accent text-[12px] font-semibold text-nc-bg hover:bg-nc-accent-hover">
              Sign in with NextAPI
            </button>
            <div className="text-center text-[10px] text-nc-text-ghost">
              or continue with free tier
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] leading-relaxed text-nc-text-tertiary">
              Enter your enterprise license for air-gapped or OEM deployment.
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
              Activate License
            </button>
          </div>
        )}

        <div className="mt-8 text-center">
          <div className="text-[10px] text-nc-text-ghost">Free: 3 projects · 5 shots · watermark</div>
          <div className="mt-1 text-[10px] text-nc-accent/60">Pro: Unlimited · Seedance 2.0 · No watermark</div>
        </div>
      </div>
    </div>
  );
}
