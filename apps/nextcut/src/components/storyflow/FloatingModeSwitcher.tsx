import { Columns3, Focus, GitBranch, Rows3 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StoryflowMode } from "@/stores/app-store";

const MODES: Array<{ id: StoryflowMode; label: string; desc: string; icon: React.ReactNode }> = [
  { id: "storyflow", label: "Storyflow", desc: "结构编排", icon: <GitBranch className="h-4 w-4" /> },
  { id: "focus", label: "Focus Canvas", desc: "沉浸创作", icon: <Focus className="h-4 w-4" /> },
  { id: "review", label: "Split Review", desc: "分屏复核", icon: <Columns3 className="h-4 w-4" /> },
  { id: "timeline", label: "Timeline Edit", desc: "精修时间线", icon: <Rows3 className="h-4 w-4" /> },
];

export function FloatingModeSwitcher({
  mode,
  onChange,
  compact = false,
}: {
  mode: StoryflowMode;
  onChange: (mode: StoryflowMode) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center rounded-[16px] border border-nc-border bg-white/90 p-1.5 shadow-[0_12px_34px_rgba(15,23,42,0.10)] backdrop-blur", compact ? "gap-1" : "gap-1.5")}>
      {MODES.map((item) => {
        const active = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-[12px] px-3 text-left transition-all",
              active
                ? "bg-nc-accent text-white shadow-[0_10px_24px_rgba(108,77,255,0.24)]"
                : "text-nc-text-secondary hover:bg-nc-bg hover:text-nc-text"
            )}
          >
            {item.icon}
            {!compact && (
              <span>
                <span className="block text-[13px] font-semibold leading-4">{item.label}</span>
                <span className={cn("block text-[11px] leading-4", active ? "text-white/78" : "text-nc-text-tertiary")}>{item.desc}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
