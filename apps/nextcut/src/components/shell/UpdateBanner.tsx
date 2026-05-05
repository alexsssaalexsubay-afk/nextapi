import { useUpdater } from "@/hooks/useUpdater";

export function UpdateBanner() {
  const { update, installing, installUpdate } = useUpdater();

  if (!update?.available) return null;

  return (
    <div className="flex h-9 items-center justify-between border-b border-nc-accent/20 bg-nc-accent-muted px-4 shadow-sm">
      <span className="text-sm text-nc-accent">
        NextCut {update.version} available
      </span>
      <button
        onClick={installUpdate}
        disabled={installing}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-nc-accent shadow-sm transition-all hover:bg-nc-accent/10 hover:text-nc-accent-hover hover:shadow-md disabled:opacity-50"
      >
        {installing ? "Installing..." : "Update now"}
      </button>
    </div>
  );
}
