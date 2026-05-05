import { memo } from "react";
import { cn } from "@/lib/cn";
import {
  useDirectorStore,
  WORKFLOW_PRESETS,
  type SeedanceWorkflow,
} from "@/stores/director-store";

const WORKFLOW_ICONS: Record<SeedanceWorkflow, React.ReactNode> = {
  text_to_video: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-info">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M6 8h8M6 11h5" />
    </svg>
  ),
  image_to_video: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-accent">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="M3 14l4-4 2 2 3-3 5 5" />
    </svg>
  ),
  multimodal_story: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nc-success">
      <rect x="2" y="3" width="7" height="6" rx="1" />
      <rect x="11" y="3" width="7" height="6" rx="1" />
      <rect x="2" y="11" width="7" height="6" rx="1" />
      <path d="M13 13l2 2 2-2" />
      <path d="M15 11v4" />
    </svg>
  ),
};

export const WorkflowPresets = memo(function WorkflowPresets({
  disabled,
}: {
  disabled?: boolean;
}) {
  const { selectedWorkflow, setSelectedWorkflow, setPipeline } = useDirectorStore();

  const handleSelect = (workflow: SeedanceWorkflow) => {
    setSelectedWorkflow(workflow);
    const preset = WORKFLOW_PRESETS.find((p) => p.id === workflow);
    if (preset) {
      setPipeline({ video_model: preset.model });
    }
  };

  return (
    <div className="pt-2">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {WORKFLOW_PRESETS.map((preset) => {
          const isActive = selectedWorkflow === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelect(preset.id)}
              disabled={disabled}
              className={cn(
                "group flex flex-col gap-4 rounded-2xl border p-6 text-left shadow-sm transition-all duration-300",
                "disabled:opacity-40",
                isActive
                  ? "border-nc-text bg-nc-surface shadow-md ring-1 ring-nc-text/20 scale-[1.02]"
                  : "border-nc-border bg-nc-bg hover:border-nc-border-strong hover:bg-nc-surface hover:shadow-sm"
              )}
            >
              <div className="flex items-start justify-between w-full">
                <div className={cn("rounded-xl p-3", isActive ? "bg-nc-text text-nc-bg shadow-md" : "bg-nc-panel text-nc-text-tertiary group-hover:text-nc-text group-hover:bg-nc-panel-hover")}>
                  {WORKFLOW_ICONS[preset.id]}
                </div>
                <span className="rounded-lg border border-nc-border bg-nc-surface px-3 py-1 font-mono text-[12px] font-bold text-nc-text-secondary shadow-sm">
                  {preset.duration}
                </span>
              </div>

              <div className="mt-2">
                <div className="text-[16px] font-bold text-nc-text">{preset.label}</div>
                <div className="text-[13px] font-medium text-nc-text-tertiary mt-1">{preset.labelZh}</div>
              </div>

              <p className="text-[14px] leading-relaxed text-nc-text-secondary">
                {preset.description}
              </p>

              {/* Requirements */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider mt-auto pt-4 border-t border-nc-border">
                {preset.needsRefImage && (
                  <span className="flex items-center gap-1.5 text-nc-text bg-nc-panel px-2.5 py-1 rounded-lg border border-nc-border">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="1" width="8" height="8" rx="1.5" />
                    </svg>
                    Ref image
                  </span>
                )}
                {preset.needsRefVideo && (
                  <span className="flex items-center gap-1.5 text-nc-text bg-nc-panel px-2.5 py-1 rounded-lg border border-nc-border">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="3,2 8,5 3,8" />
                    </svg>
                    Ref video
                  </span>
                )}
                {!preset.needsRefImage && !preset.needsRefVideo && (
                  <span className="text-nc-text-secondary bg-nc-bg border border-nc-border px-2.5 py-1 rounded-lg">Text only</span>
                )}
              </div>

              {/* Tips (visible when active) */}
              {isActive && (
                <div className="mt-3 border-t border-nc-border pt-4">
                  {preset.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-3 py-1.5 text-[13px] leading-relaxed text-nc-text-secondary">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" className="mt-1 shrink-0 text-nc-text/40">
                        <path d="M3 7l2.5 2.5L11 4" />
                      </svg>
                      {tip}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
