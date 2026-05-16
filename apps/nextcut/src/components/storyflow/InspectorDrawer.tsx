import { Camera, CheckCircle2, ChevronDown, Clock3, FileText, History, Image, RotateCcw, Save, Sparkles, Tags, Wand2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button, Pill } from "@/components/ui/kit";
import type { Shot, ShotGenerationCard } from "@/stores/director-store";
import type { StoryflowNodeData } from "./storyflow-types";

type SectionId = "info" | "prompt" | "camera" | "references" | "style" | "status" | "version" | "actions";

const sectionMeta: Record<SectionId, { title: string; icon: React.ReactNode }> = {
  info: { title: "镜头信息", icon: <Sparkles className="h-4 w-4" /> },
  prompt: { title: "提示词", icon: <FileText className="h-4 w-4" /> },
  camera: { title: "镜头语言", icon: <Camera className="h-4 w-4" /> },
  references: { title: "参考素材", icon: <Image className="h-4 w-4" /> },
  style: { title: "风格 / 情绪 / 标签", icon: <Tags className="h-4 w-4" /> },
  status: { title: "生成状态", icon: <CheckCircle2 className="h-4 w-4" /> },
  version: { title: "版本记录", icon: <History className="h-4 w-4" /> },
  actions: { title: "快捷操作", icon: <Wand2 className="h-4 w-4" /> },
};

function limitText(value: string, max: number) {
  return value.slice(0, max);
}

function clampDuration(value: string) {
  return Math.min(30, Math.max(2, Number(value) || 2));
}

function InspectorSection({
  id,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const meta = sectionMeta[id];
  return (
    <div className="nc-card-safe overflow-hidden rounded-[16px] border border-nc-border bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left">
        <span className="nc-text-safe flex min-w-0 items-center gap-2 text-[14px] font-semibold leading-5 text-nc-text">
          <span className="text-nc-accent">{meta.icon}</span>
          {meta.title}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-nc-text-tertiary transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-nc-border p-4">{children}</div>}
    </div>
  );
}

export function InspectorDrawer({
  node,
  shot,
  card,
  open,
  overlay = false,
  onClose,
  onUpdateShot,
}: {
  node: StoryflowNodeData | null;
  shot: Shot | null;
  card?: ShotGenerationCard;
  open: boolean;
  overlay?: boolean;
  onClose: () => void;
  onUpdateShot: (shotId: string, patch: Partial<Shot>) => void;
}) {
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    info: true,
    prompt: true,
    camera: true,
    references: false,
    style: false,
    status: true,
    version: false,
    actions: true,
  });

  if (!open) return null;

  const toggle = (id: SectionId) => setOpenSections((state) => ({ ...state, [id]: !state[id] }));
  const title = shot?.title || node?.title || "未选择节点";

  return (
    <aside className={cn(
      "nc-card-safe flex min-h-0 flex-col overflow-hidden border border-nc-border bg-[#F7F8FC]/96 shadow-[0_24px_70px_rgba(15,23,42,0.16)] backdrop-blur",
      overlay
        ? "absolute bottom-5 right-5 top-20 z-40 w-[388px] rounded-[20px]"
        : "w-[372px] shrink-0 rounded-l-[20px] border-y-0 border-r-0"
    )}>
      <div className="flex min-h-[72px] items-start justify-between gap-4 border-b border-nc-border bg-white px-5 py-4">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-nc-accent">上下文检查</div>
          <h2 className="nc-text-safe mt-1 line-clamp-1 text-[18px] font-semibold leading-7 text-nc-text">{title}</h2>
        </div>
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onClose} aria-label="关闭检查器">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <InspectorSection id="info" open={openSections.info} onToggle={() => toggle("info")}>
          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">标题</span>
              <input
                value={shot?.title || node?.title || ""}
                maxLength={120}
                onChange={(event) => shot && onUpdateShot(shot.id, { title: limitText(event.target.value, 120) })}
                disabled={!shot}
                className="nc-text-safe min-h-11 rounded-[12px] border border-nc-border bg-white px-4 py-2 text-[14px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10 disabled:bg-nc-bg"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2">
                <span className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">时长</span>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={shot?.duration || 0}
                  onChange={(event) => shot && onUpdateShot(shot.id, { duration: clampDuration(event.target.value) })}
                  disabled={!shot}
                  className="nc-text-safe min-h-11 rounded-[12px] border border-nc-border bg-white px-4 py-2 text-[14px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10 disabled:bg-nc-bg"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">状态</span>
                <select
                  value={shot?.status || "planned"}
                  onChange={(event) => shot && onUpdateShot(shot.id, { status: event.target.value })}
                  disabled={!shot}
                  className="nc-text-safe min-h-11 rounded-[12px] border border-nc-border bg-white px-4 py-2 text-[14px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10 disabled:bg-nc-bg"
                >
                  <option value="planned">已规划</option>
                  <option value="pending">待生成</option>
                  <option value="queued">排队中</option>
                  <option value="generating">生成中</option>
                  <option value="succeeded">已生成</option>
                  <option value="failed">失败</option>
                </select>
              </label>
            </div>
          </div>
        </InspectorSection>

        <InspectorSection id="prompt" open={openSections.prompt} onToggle={() => toggle("prompt")}>
          <textarea
            value={shot?.prompt || node?.description || ""}
            maxLength={1200}
            onChange={(event) => shot && onUpdateShot(shot.id, { prompt: limitText(event.target.value, 1200) })}
            rows={5}
            className="nc-text-safe max-h-[180px] w-full resize-none rounded-[13px] border border-nc-border bg-white px-4 py-3 text-[13px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
          />
          <p className="nc-text-safe mt-2 text-[12px] leading-5 text-nc-text-tertiary">保持主体、动作、场景、光线和镜头语言清楚，避免一句话塞太多动作。</p>
        </InspectorSection>

        <InspectorSection id="camera" open={openSections.camera} onToggle={() => toggle("camera")}>
          <textarea
            value={shot?.camera || card?.camera_contract || ""}
            maxLength={520}
            onChange={(event) => shot && onUpdateShot(shot.id, { camera: limitText(event.target.value, 520) })}
            rows={4}
            className="nc-text-safe max-h-[156px] w-full resize-none rounded-[13px] border border-nc-border bg-white px-4 py-3 text-[13px] leading-6 text-nc-text outline-none focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="accent">平滑推进</Pill>
            <Pill tone="neutral">浅景深</Pill>
            <Pill tone="neutral">稳定</Pill>
          </div>
        </InspectorSection>

        <InspectorSection id="references" open={openSections.references} onToggle={() => toggle("references")}>
          <p className="nc-text-safe line-clamp-5 text-[13px] leading-6 text-nc-text-secondary">{card?.reference_contract || "暂无专用参考合约。可以从素材库拖入参考图、视频或音频。"}</p>
        </InspectorSection>

        <InspectorSection id="style" open={openSections.style} onToggle={() => toggle("style")}>
          <div className="flex flex-wrap gap-2">
            {(node?.tags || ["cinematic", "product", "clean"]).map((tag) => <Pill key={tag} tone="neutral" className="max-w-full">{tag}</Pill>)}
          </div>
        </InspectorSection>

        <InspectorSection id="status" open={openSections.status} onToggle={() => toggle("status")}>
          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-[12px] bg-white px-3 py-2">
              <span className="nc-text-safe text-[13px] text-nc-text-secondary">生成状态</span>
              <Pill tone={shot?.video_url ? "success" : shot?.status === "failed" ? "danger" : "neutral"}>{shot?.video_url ? "已生成" : shot?.status || "等待"}</Pill>
            </div>
            <div className="flex items-center justify-between rounded-[12px] bg-white px-3 py-2">
              <span className="nc-text-safe text-[13px] text-nc-text-secondary">质量分</span>
              <span className="font-mono text-[13px] font-semibold text-nc-text">{shot?.qualityScore?.overall ? Math.round(shot.qualityScore.overall) : "--"}</span>
            </div>
          </div>
        </InspectorSection>

        <InspectorSection id="version" open={openSections.version} onToggle={() => toggle("version")}>
          <div className="space-y-2">
            {["当前编辑", "AI 初版", "导出前检查"].map((item, index) => (
              <div key={item} className="flex items-center justify-between rounded-[12px] border border-nc-border bg-white px-3 py-2">
                <span className="nc-text-safe line-clamp-1 text-[13px] font-medium text-nc-text">{item}</span>
                <span className="flex items-center gap-1 text-[12px] text-nc-text-tertiary"><Clock3 className="h-3.5 w-3.5" />v{index + 1}</span>
              </div>
            ))}
          </div>
        </InspectorSection>

        <InspectorSection id="actions" open={openSections.actions} onToggle={() => toggle("actions")}>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary"><RotateCcw className="h-4 w-4" />再生成</Button>
            <Button variant="secondary"><Save className="h-4 w-4" />保存版本</Button>
            <Button variant="secondary"><Wand2 className="h-4 w-4" />套模板</Button>
            <Button variant="danger"><History className="h-4 w-4" />回滚</Button>
          </div>
        </InspectorSection>
      </div>
    </aside>
  );
}
