import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Folder, Grid2X2, List, Play, Search, Upload, WandSparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { Button, EmptyState, FieldShell, FilterBar, IconButton, MediaThumb, Pill, SectionTitle, SelectField, Surface } from "@/components/ui/kit";

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
  tags: string[];
  size: string;
  resolution: string;
  source: string;
  description: string;
}

function thumb(label: string, index: number) {
  const isAudio = /\.(wav|mp3|m4a)$/i.test(label);
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(label);
  const isFood = /美食|食物|料理|咖啡|饮品/.test(label);
  const isTravel = /海岸|航拍|日落|雪山|湖景|风景|旅行/.test(label);
  const palettes = [
    ["#7066F8", "#17C8D4", "#0F172A"],
    ["#22C55E", "#38BDF8", "#0B1120"],
    ["#F59E0B", "#EF4444", "#1F1307"],
    ["#7C3AED", "#DB2777", "#020617"],
  ];
  const [a, b, c] = palettes[index % palettes.length];
  const foreground = isAudio
    ? `<path d="M84 206c34-78 62 80 96 0s62 80 96 0 62 80 96 0 62 80 96 0 62 80 96 0" fill="none" stroke="#F8FAFC" stroke-width="12" stroke-linecap="round" opacity=".78"/><circle cx="500" cy="122" r="54" fill="#F8FAFC" opacity=".18"/>`
    : isFood
    ? `<ellipse cx="320" cy="230" rx="152" ry="52" fill="#FFF7ED" opacity=".90"/><ellipse cx="320" cy="220" rx="110" ry="34" fill="#92400E" opacity=".66"/><circle cx="278" cy="214" r="18" fill="#FED7AA" opacity=".88"/><circle cx="350" cy="222" r="22" fill="#F97316" opacity=".78"/>`
    : isTravel || isImage
    ? `<path d="M0 238c86-42 176-46 270-17 100 31 182 18 370-54v193H0z" fill="#F8FAFC" opacity=".28"/><path d="M0 286c128-34 252-36 362-6 96 26 174 24 278-18v98H0z" fill="#FFFFFF" opacity=".32"/><circle cx="480" cy="98" r="44" fill="#FDE68A" opacity=".80"/>`
    : `<ellipse cx="320" cy="266" rx="156" ry="18" fill="#020617" opacity=".26"/><rect x="252" y="104" width="136" height="158" rx="36" fill="#F8FAFC" opacity=".88"/><path d="M230 164c62-38 128-42 202 4" fill="none" stroke="#F8FAFC" stroke-width="10" stroke-linecap="round" opacity=".44"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${a}"/><stop offset=".56" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="r" cx=".18" cy=".16" r=".85"><stop stop-color="#FFFFFF" stop-opacity=".35"/><stop offset=".55" stop-color="#FFFFFF" stop-opacity=".05"/><stop offset="1" stop-color="#000000" stop-opacity=".16"/></radialGradient><filter id="soft"><feGaussianBlur stdDeviation="24"/></filter></defs><rect width="640" height="360" fill="url(#g)"/><rect width="640" height="360" fill="url(#r)"/><circle cx="112" cy="78" r="92" fill="#fff" opacity=".12" filter="url(#soft)"/><circle cx="542" cy="68" r="90" fill="#fff" opacity=".08" filter="url(#soft)"/>${foreground}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function mediaLabel(type: MediaAsset["type"]) {
  return type === "video" ? "视频" : type === "audio" ? "音频" : "图片";
}

function characterAssetLabel(role: string) {
  const labels: Record<string, string> = {
    turnaround: "三视图",
    character_turnaround: "三视图",
    expressions: "表情集",
    character_expressions: "表情集",
    outfits: "服装集",
    character_outfits: "服装集",
    poses: "姿态集",
    character_poses: "姿态集",
  };
  return labels[role] || role;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function getLocalFileType(file: File): MediaAsset["type"] | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

type WindowWithImports = Window & { __nextcutPendingImportFiles?: File[] };

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export const LibraryPanel = memo(function LibraryPanel() {
  const setSelectedShotId = useAppStore((s) => s.setSelectedShotId);
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const shots = useDirectorStore((s) => s.shots);
  const characters = useDirectorStore((s) => s.characters);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<MediaFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [localAssets, setLocalAssets] = useState<MediaAsset[]>([]);

  const importFiles = (files: File[]) => {
    const nextAssets = files
      .map((file) => {
        const type = getLocalFileType(file);
        if (!type) return null;
        const objectUrl = URL.createObjectURL(file);
        return {
          id: `local_${file.name}_${file.lastModified}_${file.size}`,
          type,
          url: objectUrl,
          thumbnail_url: type === "image" ? objectUrl : "",
          name: file.name,
          created_at: new Date(file.lastModified || Date.now()).toISOString(),
          tags: ["本地导入", mediaLabel(type)],
          size: formatBytes(file.size),
          resolution: type === "audio" ? "本地音频" : "本地文件",
          source: "本地导入",
          description: "这是一份从本机导入的素材。上传到项目空间后，可作为参考图、垫图、音频或视频片段进入生成链路。",
        } satisfies MediaAsset;
      })
      .filter((asset): asset is MediaAsset => Boolean(asset));

    if (!nextAssets.length) return;
    setLocalAssets((current) => {
      const existing = new Set(current.map((asset) => asset.id));
      return [...nextAssets.filter((asset) => !existing.has(asset.id)), ...current];
    });
    setSelectedAssetId(nextAssets[0]?.id || null);
  };

  useEffect(() => {
    const readPendingImports = () => {
      const pending = (window as WindowWithImports).__nextcutPendingImportFiles;
      if (!pending?.length) return;
      importFiles(pending);
      (window as WindowWithImports).__nextcutPendingImportFiles = [];
    };

    const handleExternalImport = () => readPendingImports();
    readPendingImports();
    window.addEventListener("nextcut:import-files", handleExternalImport);
    return () => window.removeEventListener("nextcut:import-files", handleExternalImport);
  }, []);

  const assets: MediaAsset[] = useMemo(() => {
    const shotAssets = shots.map((shot, index) => ({
      id: shot.id,
      type: shot.video_url ? "video" as const : "image" as const,
      url: shot.video_url || shot.thumbnail_url || "",
      thumbnail_url: shot.thumbnail_url || thumb(shot.title || `Shot ${index + 1}`, index),
      name: shot.title || `Shot ${index + 1}`,
      duration: shot.duration,
      created_at: new Date(Date.now() - index * 90_000).toISOString(),
      shot_id: shot.id,
      tags: ["分镜", shot.video_url ? "已生成" : "已规划", shot.video_url ? "视频" : "规划"].filter(Boolean),
      size: shot.video_url ? "128 MB" : "2.4 MB",
      resolution: shot.video_url ? "1920x1080" : "分镜规划",
      source: shot.video_url ? "生成视频" : "AI 导演规划",
      description: shot.generationParams?.shot_script || shot.prompt || "由 AI Director 生成的镜头资产，可继续进入分镜和编辑页。",
    }));

    const characterAssets = characters.flatMap((character, characterIndex) => {
      const structuredAssets = (character.assetPack || []).map((asset, assetIndex) => ({
        id: `character_${character.id}_${asset.id}`,
        type: "image" as const,
        url: asset.url,
        thumbnail_url: asset.url,
        name: `${character.name} · ${characterAssetLabel(asset.role)}`,
        created_at: new Date(Date.now() - (characterIndex * 20 + assetIndex) * 30_000).toISOString(),
        tags: ["角色资产", "Identity Lock", characterAssetLabel(asset.role)],
        size: "AI 生成",
        resolution: "1024x1024",
        source: "角色资产包",
        description: asset.description || `用于 ${character.name} 的身份一致性锁定。`,
      }));
      if (structuredAssets.length) return structuredAssets;
      return character.referenceImages.map((url, index) => ({
        id: `character_${character.id}_ref_${index}`,
        type: "image" as const,
        url,
        thumbnail_url: url,
        name: `${character.name} · 身份参考 ${index + 1}`,
        created_at: new Date(Date.now() - (characterIndex * 20 + index) * 30_000).toISOString(),
        tags: ["角色资产", "Identity Lock", index === 0 ? "Master" : "Reference"],
        size: "参考图",
        resolution: "角色参考",
        source: "角色身份锁",
        description: `${character.name} 的身份锁参考图，会注入生成链路以保持角色一致性。`,
      }));
    });

    return [...localAssets, ...characterAssets, ...shotAssets];
  }, [characters, localAssets, shots]);

  const collections = useMemo(() => {
    const items = [
      { label: "视频", count: assets.filter((asset) => asset.type === "video").length, tone: "accent" as const },
      { label: "图片", count: assets.filter((asset) => asset.type === "image").length, tone: "success" as const },
      { label: "音频", count: assets.filter((asset) => asset.type === "audio").length, tone: "info" as const },
      { label: "分镜资产", count: assets.filter((asset) => asset.tags.includes("分镜")).length, tone: "warning" as const },
      { label: "本地导入", count: assets.filter((asset) => asset.source === "本地导入").length, tone: "accent" as const },
    ];
    return items.filter((item) => item.count > 0);
  }, [assets]);

  const sortedAssets = useMemo(() => {
    const filteredAssets = assets
      .filter((asset) => filter === "all" || asset.type === filter)
      .filter((asset) => !searchQuery || asset.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return [...filteredAssets].sort((a, b) => {
      if (sort === "newest") return b.created_at.localeCompare(a.created_at);
      if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
      return a.name.localeCompare(b.name);
    });
  }, [assets, filter, searchQuery, sort]);

  const selectedAsset = sortedAssets.find((asset) => asset.id === selectedAssetId) || sortedAssets[0];
  const filters: { id: MediaFilter; label: string; count: number }[] = [
    { id: "all", label: "全部", count: assets.length },
    { id: "video", label: "视频", count: assets.filter((asset) => asset.type === "video").length },
    { id: "image", label: "图片", count: assets.filter((asset) => asset.type === "image").length },
    { id: "audio", label: "音频", count: assets.filter((asset) => asset.type === "audio").length },
  ];

  const handleLocalUpload = (files: FileList | null) => {
    if (!files?.length) return;
    importFiles(Array.from(files));
  };

  const downloadSelectedAsset = () => {
    if (!selectedAsset?.url) return;
    const link = document.createElement("a");
    link.href = selectedAsset.url;
    link.download = selectedAsset.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const copySelectedAssetLink = async () => {
    const link = selectedAsset?.url || selectedAsset?.thumbnail_url;
    if (!link) return;
    await navigator.clipboard?.writeText(link);
  };

  return (
    <div className="flex min-h-0 flex-1 bg-[radial-gradient(circle_at_12%_0%,rgba(109,94,248,0.08),transparent_30%),linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_70%)]">
      <main className="min-w-0 flex-1 overflow-auto px-8 py-6">
        <div className="mb-6 flex items-start justify-between gap-6">
          <SectionTitle
            title="素材库"
            subtitle="管理视频、图片、音频和项目素材；AI Director 生成的分镜也会进入这里。"
          />
          <div className="flex items-center gap-3">
            <Button><List className="h-4 w-4" />批量操作</Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={(event) => handleLocalUpload(event.target.files)}
            />
            <Button variant="primary" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" />上传素材</Button>
          </div>
        </div>

        <FilterBar className="mb-6 grid grid-cols-1 gap-3 border-0 bg-transparent p-0 shadow-none md:grid-cols-2 2xl:grid-cols-[minmax(280px,1.65fr)_repeat(4,minmax(150px,1fr))]">
          <FieldShell>
            <Search className="h-4 w-4 shrink-0 text-nc-text-tertiary" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索素材..." className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-nc-text-tertiary" />
          </FieldShell>
          <SelectField value={filter} onChange={(event) => setFilter(event.target.value as MediaFilter)}>
            {filters.map((item) => <option key={item.id} value={item.id}>类型：{item.label}（{item.count}）</option>)}
          </SelectField>
          <SelectField>
            <option>标签：全部</option>
            <option>标签：产品</option>
            <option>标签：分镜</option>
          </SelectField>
          <SelectField>
            <option>时长：全部</option>
            <option>短视频</option>
            <option>长素材</option>
          </SelectField>
          <SelectField value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            <option value="newest">排序：最新导入</option>
            <option value="oldest">排序：最早导入</option>
            <option value="name">排序：名称</option>
          </SelectField>
        </FilterBar>

        {collections.length > 0 && (
        <section className="mb-7">
          <SectionTitle
            title="素材分组"
            className="mb-3"
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
            {collections.map((collection) => (
              <button key={collection.label} className="block w-full text-left" onClick={() => setFilter(collection.label === "视频" ? "video" : collection.label === "图片" ? "image" : collection.label === "音频" ? "audio" : "all")}>
                <Surface interactive className="flex min-h-[98px] w-full items-center gap-4 p-4">
                  <span className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border shadow-sm",
                    collection.tone === "success" && "border-nc-success/25 bg-nc-success/10 text-nc-success",
                    collection.tone === "info" && "border-nc-info/25 bg-nc-info/10 text-nc-info",
                    collection.tone === "warning" && "border-nc-warning/25 bg-nc-warning/10 text-nc-warning",
                    collection.tone === "accent" && "border-nc-accent/25 bg-[#F5F3FF] text-nc-accent"
                  )}>
                    <Folder className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold leading-5 text-nc-text">{collection.label}</span>
                    <span className="mt-1 block text-[13px] leading-5 text-nc-text-tertiary">{collection.count} 个素材</span>
                  </span>
                </Surface>
              </button>
            ))}
          </div>
        </section>
        )}

        <section>
          <SectionTitle
            title="全部素材"
            action={
              <div className="flex items-center gap-1 rounded-[13px] border border-nc-border bg-white p-1 shadow-sm">
                <IconButton label="网格视图" variant="ghost" className="h-9 w-9 rounded-[10px] bg-[#F5F3FF] text-nc-accent">
                  <Grid2X2 className="h-4 w-4" />
                </IconButton>
                <IconButton label="列表视图" variant="ghost" className="h-9 w-9 rounded-[10px] text-nc-text-secondary">
                  <List className="h-4 w-4" />
                </IconButton>
              </div>
            }
            className="mb-3"
          />
          {sortedAssets.length === 0 ? (
            <EmptyState
              icon={<Upload className="h-6 w-6" />}
              title={assets.length === 0 ? "素材库还没有内容" : "没有匹配的素材"}
              description={assets.length === 0 ? "导入本机素材，或先到 AI 导演生成分镜。真实素材进入后才会显示在这里，不再用演示素材占位。" : "可以换一个关键词，或清除类型筛选后再看。"}
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="primary" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" />导入素材</Button>
                  <Button onClick={() => setSidebarPage("agents")}><WandSparkles className="h-4 w-4" />去 AI 导演</Button>
                </div>
              }
            />
          ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
            {sortedAssets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => {
                  setSelectedAssetId(asset.id);
                  if (asset.shot_id) setSelectedShotId(asset.shot_id);
                }}
                className="group min-w-0 text-left"
              >
                <Surface selected={selectedAsset?.id === asset.id} interactive className="nc-card-safe overflow-hidden">
                  <div className="relative aspect-video overflow-hidden bg-nc-panel">
                    <MediaThumb
                      src={asset.thumbnail_url}
                      videoSrc={asset.type === "video" ? asset.url : undefined}
                      title={asset.name}
                      fit={asset.type === "audio" ? "contain" : "cover"}
                      className="h-full rounded-none border-0 shadow-none transition duration-300 group-hover:scale-[1.03]"
                    />
                    <Pill tone={asset.type === "audio" ? "info" : asset.type === "image" ? "success" : "accent"} className="absolute left-3 top-3 bg-white/95">
                      {mediaLabel(asset.type)}
                    </Pill>
                    {formatDuration(asset.duration) && <span className="absolute bottom-3 right-3 rounded-[10px] bg-black/58 px-3 py-1.5 font-mono text-[12px] leading-4 text-white">{formatDuration(asset.duration)}</span>}
                  </div>
                  <div className="p-5">
                    <div className="nc-text-safe line-clamp-1 text-[16px] font-semibold leading-7 text-nc-text">{asset.name}</div>
                    <div className="nc-text-safe mt-2 line-clamp-1 text-[13px] leading-5 text-nc-text-tertiary">{asset.resolution} · {asset.size}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {asset.tags.slice(0, 3).map((tag) => <Pill key={tag} tone="accent" className="max-w-full">#{tag}</Pill>)}
                    </div>
                  </div>
                </Surface>
              </button>
            ))}
          </div>
          )}
        </section>
      </main>

      <aside className="hidden w-[372px] shrink-0 border-l border-nc-border bg-white/78 p-5 backdrop-blur xl:block">
        {selectedAsset && (
          <Surface className="nc-card-safe overflow-hidden">
            <div className="p-5">
              <div className="relative aspect-video overflow-hidden rounded-[14px] bg-nc-panel">
                <MediaThumb
                  src={selectedAsset.thumbnail_url}
                  videoSrc={selectedAsset.type === "video" ? selectedAsset.url : undefined}
                  title={selectedAsset.name}
                  fit={selectedAsset.type === "audio" ? "contain" : "cover"}
                  className="h-full rounded-none border-0 shadow-none"
                />
                {selectedAsset.type !== "image" && <div className="absolute inset-0 flex items-center justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white shadow-lg"><Play className="ml-0.5 h-6 w-6 fill-current" /></span></div>}
              </div>
              <h2 className="nc-text-safe mt-5 line-clamp-2 text-[17px] font-semibold leading-6 text-nc-text">{selectedAsset.name}</h2>
              <p className="nc-text-safe mt-2 line-clamp-2 text-[13px] leading-5 text-nc-text-secondary">{mediaLabel(selectedAsset.type)} · {selectedAsset.resolution} · {selectedAsset.size}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedAsset.tags.map((tag) => <Pill key={tag} tone="accent" className="max-w-full">#{tag}</Pill>)}
              </div>
            </div>
            <div className="grid grid-cols-3 border-y border-nc-border bg-nc-bg/70 text-center text-[13px] font-semibold leading-5 text-nc-text-secondary">
              {["详情", "元数据", "使用记录"].map((tab, index) => <button key={tab} className={cn("min-h-12 px-3 py-2", index === 0 && "border-b-2 border-nc-accent bg-white text-nc-accent")}>{tab}</button>)}
            </div>
            <div className="space-y-5 p-5">
              <div>
                <div className="mb-2 text-[13px] font-semibold leading-5 text-nc-text-secondary">描述</div>
                <p className="nc-text-safe line-clamp-5 text-[14px] leading-7 text-nc-text-secondary">{selectedAsset.description}</p>
              </div>
              <dl className="grid grid-cols-[92px_1fr] gap-y-3.5 text-[14px] leading-6">
                <dt className="text-nc-text-tertiary">来源</dt><dd className="nc-text-safe line-clamp-1 text-nc-text">{selectedAsset.source}</dd>
                <dt className="text-nc-text-tertiary">路径</dt><dd className="nc-text-safe line-clamp-2 text-nc-text">/素材库/{selectedAsset.tags[0] || "all"}/{selectedAsset.name}</dd>
                <dt className="text-nc-text-tertiary">创建时间</dt><dd className="nc-text-safe line-clamp-1 text-nc-text">{new Date(selectedAsset.created_at).toLocaleString("zh-CN")}</dd>
                <dt className="text-nc-text-tertiary">时长</dt><dd className="nc-text-safe line-clamp-1 text-nc-text">{selectedAsset.duration ? `${selectedAsset.duration}s` : "-"}</dd>
              </dl>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => {
                  if (selectedAsset.shot_id) setSelectedShotId(selectedAsset.shot_id);
                  setSidebarPage("workspace");
                }}
              >
                <WandSparkles className="h-4 w-4" />
                添加到项目
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={downloadSelectedAsset} disabled={!selectedAsset.url}><Upload className="h-4 w-4" />下载</Button>
                <Button onClick={copySelectedAssetLink} disabled={!selectedAsset.url && !selectedAsset.thumbnail_url}><Folder className="h-4 w-4" />复制链接</Button>
              </div>
            </div>
          </Surface>
        )}
      </aside>
    </div>
  );
});
