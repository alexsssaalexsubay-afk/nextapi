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
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-nc-text">
        Seedance Workflow
        <span className="ml-1 font-normal normal-case tracking-normal text-nc-text-secondary">
          生成工作流
        </span>
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {WORKFLOW_PRESETS.map((preset) => {
          const isActive = selectedWorkflow === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelect(preset.id)}
              disabled={disabled}
              className={cn(
                "group flex flex-col gap-2 rounded-[var(--radius-lg)] border border-nc-border p-4 text-left shadow-sm transition-all duration-200 hover:shadow-md",
                "disabled:opacity-40",
                isActive
                  ? "border-nc-accent/40 bg-nc-accent-dim shadow-md shadow-nc-accent/10 ring-1 ring-nc-accent/15"
                  : "hover:border-nc-border-strong hover:bg-nc-panel-hover"
              )}
            >
              <div className="flex items-start justify-between">
                {WORKFLOW_ICONS[preset.id]}
                <span className="rounded-full bg-nc-surface px-1.5 py-0.5 text-xs tabular-nums text-nc-text-secondary">
                  {preset.duration}
                </span>
              </div>

              <div>
                <div className="text-sm font-semibold text-nc-text">{preset.label}</div>
                <div className="text-xs text-nc-text-secondary">{preset.labelZh}</div>
              </div>

              <p className="text-xs leading-relaxed text-nc-text-secondary">
                {preset.description}
              </p>

              {/* Requirements */}
              <div className="flex items-center gap-2 text-xs">
                {preset.needsRefImage && (
                  <span className="flex items-center gap-0.5 text-nc-accent">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1">
                      <rect x="1" y="1" width="6" height="6" rx="0.5" />
                    </svg>
                    Ref image
                  </span>
                )}
                {preset.needsRefVideo && (
                  <span className="flex items-center gap-0.5 text-nc-info">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1">
                      <polygon points="3,2 6.5,4 3,6" />
                    </svg>
                    Ref video
                  </span>
                )}
                {!preset.needsRefImage && !preset.needsRefVideo && (
                  <span className="text-nc-text-secondary">Text only</span>
                )}
              </div>

              {/* Tips (visible when active) */}
              {isActive && (
                <div className="mt-1 border-t border-nc-border pt-2">
                  {preset.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs leading-relaxed text-nc-text-secondary">
                      <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-nc-accent/40" />
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
