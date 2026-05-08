import { Camera, CheckCircle2, Clock3, Copy, Crosshair, FileText, GitBranch, Image, Layers3, MessageSquareText, Play, Sparkles, Trash2 } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/cn";
import { Button, MediaThumb, Pill } from "@/components/ui/kit";
import { safeMediaSrc } from "./media";
import type { StoryflowNode, StoryflowNodeKind } from "./storyflow-types";

const iconByKind: Record<StoryflowNodeKind, React.ReactNode> = {
  intent: <MessageSquareText className="h-4 w-4" />,
  prompt: <FileText className="h-4 w-4" />,
  reference: <Image className="h-4 w-4" />,
  camera: <Camera className="h-4 w-4" />,
  scene: <Layers3 className="h-4 w-4" />,
  shot: <Play className="h-4 w-4" />,
  output: <GitBranch className="h-4 w-4" />,
  review: <CheckCircle2 className="h-4 w-4" />,
  version: <Clock3 className="h-4 w-4" />,
};

const toneByKind: Record<StoryflowNodeKind, string> = {
  intent: "from-[#F5F3FF] to-white text-nc-accent",
  prompt: "from-[#ECFEFF] to-white text-nc-info",
  reference: "from-[#FFF7ED] to-white text-nc-warning",
  camera: "from-[#F5F3FF] to-white text-nc-accent",
  scene: "from-[#F8FAFC] to-white text-nc-text-secondary",
  shot: "from-white to-[#F8FAFC] text-nc-accent",
  output: "from-[#ECFDF5] to-white text-nc-success",
  review: "from-[#FFFBEB] to-white text-nc-warning",
  version: "from-[#F8FAFC] to-white text-nc-text-secondary",
};

export function StoryflowNodeCard({ data, selected }: NodeProps<StoryflowNode>) {
  const isShot = data.kind === "shot";
  const thumbnailSrc = typeof data.thumbnail === "string" ? safeMediaSrc(data.thumbnail) : undefined;
  const score = typeof data.score === "number" ? Math.round(data.score) : null;
  const runAction = (action: "focus" | "duplicate" | "delete") => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    data.onAction?.(action, data);
  };

  return (
    <div
      className={cn(
        "group nc-card-safe relative overflow-hidden rounded-[18px] border bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06),0_18px_46px_rgba(15,23,42,0.05)] transition-all duration-200",
        selected
          ? "border-nc-accent ring-4 ring-nc-accent/12 shadow-[0_0_0_4px_rgba(108,77,255,0.12),0_22px_56px_rgba(108,77,255,0.18)]"
          : "border-nc-border hover:-translate-y-0.5 hover:border-nc-accent/35 hover:shadow-[0_20px_52px_rgba(15,23,42,0.10)]"
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-nc-accent" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-nc-accent" />

      {thumbnailSrc && isShot && (
        <div className="relative aspect-video overflow-hidden bg-nc-bg">
          <MediaThumb src={thumbnailSrc} title={data.title} className="h-full rounded-none border-0 shadow-none" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/46 to-transparent" />
          <Pill tone="accent" className="absolute left-3 top-3 border-white/60 bg-white/92">{data.metric}</Pill>
          {data.status && <Pill tone={data.status === "已生成" ? "success" : "neutral"} className="absolute right-3 top-3 border-white/60 bg-white/92">{data.status}</Pill>}
        </div>
      )}

      <div className={cn("border-b border-nc-border bg-gradient-to-br px-4 py-3.5", toneByKind[data.kind])}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/70 bg-white/82 shadow-sm">
            {iconByKind[data.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="nc-text-safe truncate text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-nc-text-tertiary">{data.eyebrow}</span>
              {data.metric && !isShot && <Pill tone="accent" className="min-h-6 px-2 py-0.5 text-[11px]">{data.metric}</Pill>}
            </div>
            <h3 className="nc-text-safe mt-1 line-clamp-1 text-[15px] font-semibold leading-6 text-nc-text">{data.title}</h3>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <p className={cn("nc-text-safe text-[13px] leading-6 text-nc-text-secondary", isShot ? "line-clamp-2 min-h-[48px]" : "line-clamp-3 min-h-[72px]")}>
          {data.description}
        </p>

        {data.kind === "camera" && (
          <div className="rounded-[12px] border border-nc-border bg-nc-bg px-3 py-2">
            <svg viewBox="0 0 180 36" className="h-9 w-full text-nc-accent" fill="none">
              <path d="M5 24 C32 8, 56 30, 84 16 S132 10, 175 22" stroke="currentColor" strokeWidth="2.4" />
              <circle cx="84" cy="16" r="4" fill="currentColor" />
            </svg>
          </div>
        )}

        {data.kind === "reference" && (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="aspect-video rounded-[9px] border border-nc-border bg-[linear-gradient(135deg,#F5F3FF,#ECFEFF)]" />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(data.tags || []).filter(Boolean).slice(0, 3).map((tag: string) => (
            <span key={tag} className="nc-text-safe max-w-full rounded-full border border-nc-border bg-nc-bg px-2.5 py-1 text-[11px] font-semibold leading-4 text-nc-text-tertiary">
              {tag}
            </span>
          ))}
          {score !== null && <span className="rounded-full border border-nc-success/25 bg-nc-success/10 px-2.5 py-1 text-[11px] font-semibold leading-4 text-nc-success">{score}/100</span>}
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 flex translate-y-1 gap-1 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
        <Button size="icon" variant="secondary" className="h-8 w-8 rounded-[10px]" title="聚焦节点" aria-label="聚焦节点" onClick={runAction("focus")}>
          <Crosshair className="h-3.5 w-3.5" />
        </Button>
        {isShot && (
          <>
            <Button size="icon" variant="secondary" className="h-8 w-8 rounded-[10px]" title="复制镜头" aria-label="复制镜头" onClick={runAction("duplicate")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="danger" className="h-8 w-8 rounded-[10px]" title="删除镜头" aria-label="删除镜头" onClick={runAction("delete")}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {selected && <Sparkles className="absolute bottom-3 right-3 h-4 w-4 text-nc-accent" />}
    </div>
  );
}
