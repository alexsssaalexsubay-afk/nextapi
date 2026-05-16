import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import {
  type SeedanceWorkflow,
  type WorkflowTemplate,
  useDirectorStore,
} from "@/stores/director-store";
import { TEMPLATE_CATALOG } from "@/lib/template-catalog";
import {
  Button,
  EmptyState,
  FieldShell,
  MediaThumb,
  PageHeader,
  PageShell,
  Pill,
  SectionCard,
  Segmented,
  StatusBadge,
  Surface,
} from "@/components/ui/kit";

type Category = "all" | "system" | "studio" | "account";

const WORKFLOW_LABELS: Record<SeedanceWorkflow, string> = {
  text_to_video: "文生视频",
  image_to_video: "图生视频",
  multimodal_story: "多模态剧情",
};

const WORKFLOW_TONES: Record<SeedanceWorkflow, "accent" | "info" | "success"> = {
  text_to_video: "accent",
  image_to_video: "info",
  multimodal_story: "success",
};

const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
  { value: "all", label: "全部" },
  { value: "system", label: "系统模板" },
  { value: "studio", label: "工作室" },
  { value: "account", label: "我的模板" },
];

const CHAIN_LABELS: Record<string, string> = {
  Brief: "创意简报",
  "Shot Decomposition": "镜头拆解",
  "Scene Group": "场景分组",
  "Prompt Decomposition": "提示词拆解",
  "Prompt Strategy": "提示词策略",
  "Reference Stack": "参考素材",
  "Reference Image Pipeline": "参考图链路",
  "Camera Motion": "运镜设计",
  Storyboard: "分镜",
  Subtitle: "字幕",
  Timeline: "时间线",
  Output: "输出",
  "Character Extractor": "角色提取",
  "Character Anchor": "角色锚点",
  "Identity Lock": "身份锁定",
  "Quality Check": "质量检查",
  "Production Bible": "制作约束",
  Review: "复核",
  Version: "版本",
  "Media Library": "素材库",
  "Editing Agent": "剪辑师",
  "Audio Director": "声音导演",
  Screenwriter: "编剧",
  "Batch Generate": "批量生成",
  Preflight: "生成前检查",
};

const BUILTIN_TEMPLATES = TEMPLATE_CATALOG;
const CASE_STARTERS = TEMPLATE_CATALOG.slice(0, 4);

export const TemplatePanel = memo(function TemplatePanel() {
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const { savedTemplates, setSelectedWorkflow, setStyle, setNumShots, setPrompt, setDuration, setAspectRatio } = useDirectorStore();
  const [category, setCategory] = useState<Category>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const allTemplates = useMemo(() => [...BUILTIN_TEMPLATES, ...savedTemplates], [savedTemplates]);
  const categoryCounts = useMemo(() => ({
    all: allTemplates.length,
    system: allTemplates.filter((t) => t.category === "system").length,
    studio: allTemplates.filter((t) => t.category === "studio").length,
    account: allTemplates.filter((t) => t.category === "account").length,
  }), [allTemplates]);

  const filtered = allTemplates
    .filter((t) => category === "all" || t.category === category)
    .filter((t) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        t.name.toLowerCase().includes(query) ||
        t.nameZh.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        (t.chain || []).some((item) => item.toLowerCase().includes(query)) ||
        (t.deliverables || []).some((item) => item.toLowerCase().includes(query)) ||
        (t.variables || []).some((item) => item.toLowerCase().includes(query))
      );
    });

  const applyTemplate = (template: WorkflowTemplate) => {
    setSelectedWorkflow(template.workflow);
    setStyle(template.style);
    setNumShots(template.shotCount);
    if (template.shotDuration) setDuration(template.shotDuration);
    if (template.aspectRatio) setAspectRatio(template.aspectRatio);
    if (template.prompt) setPrompt(template.prompt);
    setAppliedId(template.id);
    window.setTimeout(() => setSidebarPage("agents"), 220);
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Creative Templates"
        title="模板"
        subtitle="用经过整理的镜头结构、风格预设和工作流模板快速启动创作。"
        action={
          <Button variant="primary" onClick={() => setSidebarPage("agents")}>
            <SparkIcon />
            用 AI 导演创建
          </Button>
        }
      />

      <div className="mb-6 overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="grid min-h-[280px] lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <div className="flex min-w-0 flex-col justify-center px-8 py-8 lg:px-10">
            <div className="mb-5 flex flex-wrap gap-2">
              <StatusBadge tone="accent">{BUILTIN_TEMPLATES.length} 个生产模板</StatusBadge>
              <StatusBadge tone="info">流程画布就绪</StatusBadge>
              <StatusBadge tone="success">可写入 AI 导演</StatusBadge>
            </div>
            <h2 className="nc-text-safe max-w-[560px] text-[30px] font-bold leading-[38px] text-nc-text">
              从成熟视频生产链路开始，而不是从空白表单开始
            </h2>
            <p className="nc-text-safe mt-3 max-w-[620px] text-[15px] leading-7 text-nc-text-secondary">
              每个模板都预置创意简报、提示词策略、参考素材、镜头语言、分镜、生成前检查和交付物，点击后直接进入 AI 导演继续细化。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => applyTemplate(TEMPLATE_CATALOG[0])}>
                <SparkIcon />
                用首发广告启动
              </Button>
              <Button variant="secondary" onClick={() => setSearchQuery("角色")}>
                查看角色一致性模板
              </Button>
            </div>
          </div>
          <div className="relative min-h-[280px] overflow-hidden bg-[#F5F7FF]">
            <img
              src="/templates/product-launch.jpg"
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white/45 via-white/10 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 rounded-[20px] border border-white/70 bg-white/80 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur-md">
              <p className="text-[13px] font-semibold leading-5 text-nc-text">生产链路预置</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["参考素材", "分镜", "运镜", "生成前检查", "时间线"].map((item) => (
                  <Pill key={item} tone="accent">{item}</Pill>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SectionCard
        title="模板筛选"
        subtitle="按创作场景、风格和生产链路找到可复用模板。"
        action={<StatusBadge tone="neutral">{filtered.length} / {allTemplates.length}</StatusBadge>}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <Segmented
            value={category}
            options={CATEGORY_OPTIONS.map((option) => ({
              value: option.value,
              label: `${option.label} ${categoryCounts[option.value]}`,
            }))}
            onChange={setCategory}
            className="max-w-full overflow-x-auto"
          />
          <FieldShell className="w-full xl:w-[360px]">
            <SearchIcon />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索模板、标签、风格..."
              className="w-full bg-transparent text-[14px] text-nc-text outline-none placeholder:text-nc-text-tertiary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-nc-text-tertiary hover:bg-nc-panel hover:text-nc-text"
                aria-label="清空搜索"
              >
                <CloseIcon />
              </button>
            )}
          </FieldShell>
        </div>
      </SectionCard>

      <SectionCard
        className="mt-6"
        title="案例启动器"
        subtitle="面向初学者的一步式入口：选择场景后直接把工作流、风格、镜头数和创意写入 AI 导演。"
      >
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {CASE_STARTERS.map((starter) => (
            <Surface key={starter.id} selected={appliedId === starter.id} interactive className="overflow-hidden p-4">
              <button type="button" onClick={() => applyTemplate(starter)} className="flex h-full w-full flex-col text-left">
                <MediaThumb
                  src={starter.thumbnail}
                  title={starter.nameZh}
                  tone={WORKFLOW_TONES[starter.workflow]}
                  duration={starter.duration}
                  badge={<StatusBadge tone={WORKFLOW_TONES[starter.workflow]}>{starter.difficulty || "模板"}</StatusBadge>}
                />
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 pt-5">
                    <h3 className="line-clamp-1 text-[17px] font-semibold leading-7 text-nc-text">{starter.nameZh}</h3>
                    <p className="mt-1 line-clamp-2 min-h-[40px] text-[13px] leading-5 text-nc-text-secondary">{starter.description}</p>
                  </div>
                  <StatusBadge tone={WORKFLOW_TONES[starter.workflow]}>{WORKFLOW_LABELS[starter.workflow]}</StatusBadge>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Pill tone="neutral">{starter.shotCount} 镜头</Pill>
                  {starter.tags.map((tag) => <Pill key={tag} tone="accent">#{tag}</Pill>)}
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-nc-border pt-4">
                  <span className="text-[13px] font-semibold leading-5 text-nc-accent">填入 AI 导演</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-nc-accent-dim text-nc-accent">
                    <ArrowIcon />
                  </span>
                </div>
              </button>
            </Surface>
          ))}
        </div>
      </SectionCard>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<SearchIcon />}
            title="没有找到模板"
            description="可以调整关键词或分类筛选，或回到全部模板重新选择。"
            action={<Button variant="secondary" onClick={() => setSearchQuery("")}>清空筛选</Button>}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((template, index) => (
              <TemplateCard
                key={template.id}
                template={template}
                selected={appliedId === template.id}
                index={index}
                onApply={() => applyTemplate(template)}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
});

function TemplateCard({
  template,
  selected,
  index,
  onApply,
}: {
  template: WorkflowTemplate;
  selected: boolean;
  index: number;
  onApply: () => void;
}) {
  const tone = WORKFLOW_TONES[template.workflow];
  return (
    <Surface selected={selected} interactive className="flex h-full overflow-hidden p-4">
      <button
        type="button"
        onClick={onApply}
        className="flex h-full w-full flex-col text-left"
      >
        <MediaThumb
          src={template.thumbnail}
          title={template.nameZh}
          tone={tone}
          duration={template.duration}
          badge={<StatusBadge tone={tone}>{template.difficulty || WORKFLOW_LABELS[template.workflow]}</StatusBadge>}
          className={cn(index % 5 === 1 && "brightness-[1.02]", index % 5 === 3 && "saturate-[1.08]")}
        />
        <div className="flex flex-1 flex-col px-1 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="line-clamp-1 text-[18px] font-semibold leading-7 text-nc-text">{template.nameZh}</h3>
              <p className="mt-1 line-clamp-1 text-[13px] font-medium leading-5 text-nc-text-tertiary">{template.name}</p>
            </div>
            {selected && <StatusBadge tone="success">已应用</StatusBadge>}
          </div>
          <p className="mt-4 line-clamp-3 min-h-[66px] text-[14px] leading-[22px] text-nc-text-secondary">{template.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Pill tone="neutral">{template.shotCount} 镜头</Pill>
            {template.aspectRatio && <Pill tone="info">{template.aspectRatio}</Pill>}
            <Pill tone="accent">{WORKFLOW_LABELS[template.workflow]}</Pill>
          </div>
          {template.chain && template.chain.length > 0 && (
            <div className="mt-4 grid gap-2 rounded-[14px] bg-nc-panel p-3">
              <p className="text-[12px] font-semibold leading-4 text-nc-text-tertiary">链路</p>
              <div className="flex flex-wrap gap-2">
                {template.chain.slice(0, 4).map((item) => (
                  <StatusBadge key={item} tone="neutral">{CHAIN_LABELS[item] || item}</StatusBadge>
                ))}
              </div>
            </div>
          )}
          {template.deliverables && (
            <div className="mt-4 flex min-h-[28px] flex-wrap gap-2">
              {template.deliverables.slice(0, 3).map((item) => (
                <StatusBadge key={item} tone="success">{item}</StatusBadge>
              ))}
            </div>
          )}
          <div className="mt-5 flex items-center justify-between border-t border-nc-border pt-4">
            <span className="text-[13px] font-semibold leading-5 text-nc-accent">应用到 AI 导演</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-nc-accent-dim text-nc-accent">
              <ArrowIcon />
            </span>
          </div>
        </div>
      </button>
    </Surface>
  );
}

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="9" r="5" /><path d="m13 13 3 3" /></svg>;
}

function SparkIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l1.4 4.3L16 8l-4.6 1.7L10 14l-1.4-4.3L4 8l4.6-1.7L10 2Z" /><path d="M15.5 13.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Z" /></svg>;
}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5 5 15" /></svg>;
}

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10h10" /><path d="m11 6 4 4-4 4" /></svg>;
}
