import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore } from "@/stores/director-store";

export function Toast() {
  const lastError = useDirectorStore((s) => s.lastError);
  const setLastError = useDirectorStore((s) => s.setLastError);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (lastError) {
      setMessage(lastError);
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setLastError(null), 300);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastError, setLastError]);

  if (!message) return null;

  return (
    <div
      className={cn(
        "fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-lg)] border border-nc-error/30 bg-nc-surface px-5 py-3.5 shadow-2xl shadow-nc-error/10",
        "flex items-center gap-3 transition-all duration-300",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-nc-error" />
      <span className="text-sm text-nc-text">{message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => setLastError(null), 300);
        }}
        className="ml-2 rounded-md p-1 text-nc-text-tertiary transition-colors hover:bg-nc-error/10 hover:text-nc-text-secondary"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5">
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </button>
    </div>
  );
}
