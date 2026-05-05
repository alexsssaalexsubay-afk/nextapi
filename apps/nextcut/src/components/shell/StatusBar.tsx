import { cn } from "@/lib/cn";
import { useAppStore, type ConnectionStatus } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";

function StatusIndicator({ status, label }: { status: ConnectionStatus; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "inline-block h-[5px] w-[5px] rounded-full transition-colors",
          status === "connected" && "bg-nc-success",
          status === "connecting" && "bg-nc-warning animate-pulse",
          status === "disconnected" && "bg-nc-text-tertiary/40"
        )}
      />
      <span className={cn(
        "transition-colors",
        status === "connected" ? "text-nc-text-secondary" : "text-nc-text-tertiary"
      )}>
        {label}
      </span>
    </span>
  );
}

export function StatusBar() {
  const { sidecarStatus, comfyuiStatus } = useAppStore();
  const { isRunning, shots } = useDirectorStore();

  const completedShots = shots.filter((s) => s.video_url).length;
  const totalShots = shots.length;

  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-t border-nc-border bg-nc-sidebar px-4 text-xs shadow-[0_-1px_0_0_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-5">
        <StatusIndicator status={sidecarStatus} label="Engine" />
        <StatusIndicator status={comfyuiStatus} label="ComfyUI" />
        {isRunning && (
          <span className="flex items-center gap-1.5 text-nc-accent">
            <span className="inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-nc-accent" />
            Pipeline active
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {totalShots > 0 && (
          <span className="tabular-nums text-nc-text-tertiary">
            {completedShots}/{totalShots} shots
          </span>
        )}
        <span className="text-nc-text-tertiary">v0.1.0</span>
      </div>
    </div>
  );
}
