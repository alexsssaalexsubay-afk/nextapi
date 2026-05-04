import { useUpdater } from "@/hooks/useUpdater";

export function UpdateBanner() {
  const { update, installing, installUpdate } = useUpdater();

  if (!update?.available) return null;

  return (
    <div className="flex h-7 items-center justify-between border-b border-nc-accent/15 bg-nc-accent-muted px-4">
      <span className="text-[11px] text-nc-accent">
        NextCut {update.version} available
      </span>
      <button
        onClick={installUpdate}
        disabled={installing}
        className="text-[11px] font-medium text-nc-accent hover:text-nc-accent-hover"
      >
        {installing ? "Installing..." : "Update now"}
      </button>
    </div>
  );
}
