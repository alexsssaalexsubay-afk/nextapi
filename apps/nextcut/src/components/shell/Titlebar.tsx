import { useSidecar } from "@/hooks/useSidecar";
import { useDirectorStore } from "@/stores/director-store";

export function Titlebar() {
  useSidecar();
  const isRunning = useDirectorStore((s) => s.isRunning);

  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center justify-between border-b border-nc-border bg-nc-sidebar px-4 shadow-sm"
    >
      <div className="flex items-center gap-2.5" data-tauri-drag-region>
        <div className="flex h-5 w-5 items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5L7 1L12 3.5V7L7 13L2 7V3.5Z" fill="currentColor" className="text-nc-accent" />
            <path d="M7 1L12 3.5L7 6L2 3.5L7 1Z" fill="currentColor" className="text-nc-accent" opacity="0.6" />
          </svg>
        </div>
        <span className="text-base font-medium tracking-tight text-nc-text">
          NextCut
        </span>
        {isRunning && (
          <span className="flex items-center gap-1.5 rounded-full bg-nc-accent/10 px-2.5 py-1 text-xs font-medium text-nc-accent shadow-sm">
            <span className="h-1 w-1 animate-pulse rounded-full bg-nc-accent" />
            Processing
          </span>
        )}
      </div>

      <div data-tauri-drag-region className="flex-1" />

      <div className="flex items-center gap-1">
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-nc-text-tertiary transition-all hover:bg-nc-panel-hover hover:text-nc-text-secondary shadow-sm hover:shadow-md">
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1" /></svg>
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-nc-text-tertiary transition-all hover:bg-nc-panel-hover hover:text-nc-text-secondary shadow-sm hover:shadow-md">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="7" height="7" /></svg>
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-nc-text-tertiary transition-all hover:bg-nc-error/20 hover:text-nc-error shadow-sm hover:shadow-md">
          <svg width="8" height="8" viewBox="0 0 8 8" stroke="currentColor" strokeWidth="1.2"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>
        </button>
      </div>
    </div>
  );
}
