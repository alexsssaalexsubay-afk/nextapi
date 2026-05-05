import { memo, useState } from "react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";

type MediaFilter = "all" | "video" | "image" | "audio";
type SortMode = "newest" | "oldest" | "name";

interface MediaAsset {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  thumbnail_url: string;
  name: string;
  duration?: number;
  created_at: string;
  shot_id?: string;
}

export const LibraryPanel = memo(function LibraryPanel() {
  const setSelectedShotId = useAppStore((s) => s.setSelectedShotId);
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const shots = useDirectorStore((s) => s.shots);

  const [filter, setFilter] = useState<MediaFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const assets: MediaAsset[] = shots
    .filter((s) => s.video_url)
    .map((s) => ({
      id: s.id,
      type: "video" as const,
      url: s.video_url,
      thumbnail_url: s.thumbnail_url || "",
      name: s.title || s.id,
      duration: s.duration,
      created_at: new Date().toISOString(),
      shot_id: s.id,
    }));

  const filteredAssets = assets
    .filter((a) => filter === "all" || a.type === filter)
    .filter((a) => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    if (sort === "newest") return b.created_at.localeCompare(a.created_at);
    if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
    return a.name.localeCompare(b.name);
  });

  const FILTERS: { id: MediaFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: assets.length },
    { id: "video", label: "Videos", count: assets.filter((a) => a.type === "video").length },
    { id: "image", label: "Images", count: assets.filter((a) => a.type === "image").length },
    { id: "audio", label: "Audio", count: assets.filter((a) => a.type === "audio").length },
  ];

  if (assets.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-11 items-center border-b border-nc-border px-4 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-nc-text-secondary">
            Media Library
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="relative">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="text-nc-text-tertiary/20">
              <rect x="4" y="4" width="22" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <rect x="30" y="4" width="22" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <rect x="4" y="30" width="22" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <rect x="30" y="30" width="22" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <polygon points="12,11 20,15 12,19" fill="currentColor" opacity="0.3" />
              <polygon points="38,11 46,15 38,19" fill="currentColor" opacity="0.3" />
              <circle cx="15" cy="41" r="4" stroke="currentColor" strokeWidth="1" opacity="0.3" />
              <path d="M34 36l6 4-6 4V36z" fill="currentColor" opacity="0.3" />
            </svg>
          </div>
          <div className="text-center">
            <h3 className="mb-1 text-base font-semibold text-nc-text-secondary">Library is empty</h3>
            <p className="max-w-[280px] text-sm leading-relaxed text-nc-text-tertiary">
              Generated videos and assets will appear here. Start by creating a video from the Director.
            </p>
          </div>
          <button
            onClick={() => setSidebarPage("home")}
            className="rounded-lg bg-nc-accent px-5 py-2.5 text-sm font-semibold text-nc-bg shadow-md transition-all hover:bg-nc-accent-hover hover:shadow-lg"
          >
            Create a Video
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-nc-bg">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-nc-border px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-nc-text-secondary">
            Media Library
          </span>
          <div className="flex items-center gap-0.5 rounded-lg border border-nc-border bg-nc-panel p-1 shadow-sm">
            {FILTERS.filter((f) => f.count > 0 || f.id === "all").map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                  filter === f.id
                    ? "bg-nc-panel-active text-nc-text shadow-sm"
                    : "text-nc-text-tertiary hover:text-nc-text-secondary"
                )}
              >
                {f.label}
                <span className="font-mono text-[10px] tabular-nums text-nc-text-tertiary">{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nc-text-tertiary"
            >
              <circle cx="5" cy="5" r="3.5" />
              <path d="M8 8l2.5 2.5" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="h-9 w-36 rounded-lg border border-nc-border-strong bg-nc-panel pl-9 pr-2 text-xs text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent/40 focus:w-48 transition-all"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="h-9 cursor-pointer rounded-lg border border-nc-border-strong bg-nc-panel px-3 text-xs text-nc-text-secondary shadow-sm outline-none focus:ring-2 focus:ring-nc-accent/15"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sortedAssets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => {
                setSelectedAsset(asset.id);
                if (asset.shot_id) setSelectedShotId(asset.shot_id);
              }}
              className={cn(
                "group relative cursor-pointer overflow-hidden rounded-[var(--radius-lg)] border border-nc-border-strong shadow-sm transition-all duration-200 hover:shadow-lg",
                selectedAsset === asset.id
                  ? "border-nc-accent/50 ring-2 ring-nc-accent/25 shadow-lg shadow-nc-accent/10"
                  : "hover:border-nc-accent/30 hover:shadow-md"
              )}
            >
              <div className="relative aspect-video bg-black/40">
                {asset.type === "video" && (
                  asset.thumbnail_url ? (
                    <img
                      src={asset.thumbnail_url}
                      alt={asset.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <video
                      src={asset.url}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  )
                )}

                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
                      <polygon points="3,1 11,6 3,11" />
                    </svg>
                  </div>
                </div>

                {asset.duration && (
                  <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
                    <span className="font-mono text-[10px] tabular-nums text-white/90">{asset.duration}s</span>
                  </div>
                )}

                <div className="absolute left-1.5 top-1.5">
                  {asset.type === "video" && (
                    <div className="rounded bg-nc-accent/80 p-0.5">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="white">
                        <polygon points="2,1 7,4 2,7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-medium text-nc-text">{asset.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-nc-text-tertiary">{asset.shot_id}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
