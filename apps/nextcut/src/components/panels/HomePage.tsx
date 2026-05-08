import { memo, useMemo, useState } from "react";
import { useDirector } from "@/hooks/useDirector";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { TEMPLATE_CATALOG } from "@/lib/template-catalog";
import { GuidedWizard } from "@/components/director/GuidedWizard";
import {
  Button,
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

const BUILTIN_TEMPLATES = TEMPLATE_CATALOG;

type Aspect = "16:9" | "9:16" | "1:1";
type DurationPreset = "5" | "10" | "15";
type StylePreset = "cinematic" | "commercial" | "vlog";

export const HomePage = memo(function HomePage() {
  const { setSidebarPage } = useAppStore();
  const {
    prompt,
    setPrompt,
    setUseStructuredPrompt,
    setAspectRatio,
    setDuration,
    setStyle,
    setSelectedWorkflow,
    setNumShots,
    isRunning,
  } = useDirectorStore();
  const { runPipeline } = useDirector();
  const [localPrompt, setLocalPrompt] = useState(prompt || "");
  const [showWizard, setShowWizard] = useState(false);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [durationPreset, setDurationPreset] = useState<DurationPreset>("10");
  const [stylePreset, setStylePreset] = useState<StylePreset>("cinematic");
  const featuredTemplates = useMemo(() => BUILTIN_TEMPLATES.slice(0, 4), []);

  const commitCreativeSettings = () => {
    setPrompt(localPrompt.trim());
    setAspectRatio(aspect);
    setDuration(Number(durationPreset));
    setStyle(stylePreset);
  };

  const handleQuickGenerate = async () => {
    if (!localPrompt.trim() || isRunning) return;
    commitCreativeSettings();
    setSelectedWorkflow("text_to_video");
    setSidebarPage("agents");
    await runPipeline();
  };

  const handleDirectorPath = () => {
    if (localPrompt.trim()) commitCreativeSettings();
    setUseStructuredPrompt(true);
    setSidebarPage("agents");
  };

  const applyTemplate = (template: typeof BUILTIN_TEMPLATES[number]) => {
    setSelectedWorkflow(template.workflow);
    setStyle(template.style);
    setNumShots(template.shotCount);
    if (template.shotDuration) setDuration(template.shotDuration);
    if (template.aspectRatio) setAspectRatio(template.aspectRatio);
    if (template.prompt) setPrompt(template.prompt);
    setSidebarPage("agents");
  };

  return (
    <PageShell>
      {showWizard && <GuidedWizard onClose={() => setShowWizard(false)} />}

      <PageHeader
        eyebrow="NextCut Studio"
        title="描述它，导演它，渲染它"
        subtitle="面向专业创作者和团队的 AI 视频工作台。创意输入、工作流、素材和编辑器在同一套清爽设计系统下协同。"
        action={
          <>
            <Button variant="secondary" onClick={() => setShowWizard(true)}>
              <CompassIcon />
              引导创作
            </Button>
            <Button variant="primary" onClick={handleDirectorPath}>
              <SparkIcon />
              AI 导演
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
        <SectionCard
          title="创意输入"
          subtitle="先把想法说清楚，再选择比例、时长和风格。这里的每个控件都会写入生成参数。"
          action={<StatusBadge tone={localPrompt.trim() ? "success" : "neutral"}>{localPrompt.trim() ? `${localPrompt.trim().length} 字` : "等待创意"}</StatusBadge>}
          className="min-h-[520px]"
        >
          <FieldShell className="min-h-[180px] items-start px-5 py-4">
            <textarea
              value={localPrompt}
              onChange={(event) => setLocalPrompt(event.target.value)}
              placeholder="例如：为一款便携咖啡机制作 30 秒产品广告，清晨厨房自然光，突出便携设计和香气氛围..."
              rows={7}
              className="min-h-[148px] w-full resize-none bg-transparent text-[15px] leading-7 text-nc-text outline-none placeholder:text-nc-text-tertiary"
            />
          </FieldShell>

          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <ControlGroup title="画面比例">
              <Segmented<Aspect>
                value={aspect}
                onChange={setAspect}
                options={[
                  { value: "16:9", label: "16:9" },
                  { value: "9:16", label: "9:16" },
                  { value: "1:1", label: "1:1" },
                ]}
                className="w-full"
              />
            </ControlGroup>
            <ControlGroup title="镜头时长">
              <Segmented<DurationPreset>
                value={durationPreset}
                onChange={setDurationPreset}
                options={[
                  { value: "5", label: "5s" },
                  { value: "10", label: "10s" },
                  { value: "15", label: "15s" },
                ]}
                className="w-full"
              />
            </ControlGroup>
            <ControlGroup title="视觉风格">
              <Segmented<StylePreset>
                value={stylePreset}
                onChange={setStylePreset}
                options={[
                  { value: "cinematic", label: "电影" },
                  { value: "commercial", label: "广告" },
                  { value: "vlog", label: "Vlog" },
                ]}
                className="w-full"
              />
            </ControlGroup>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-nc-border bg-nc-panel px-5 py-4">
            <div>
              <p className="text-[14px] font-semibold leading-6 text-nc-text">推荐路径</p>
              <p className="text-[13px] leading-5 text-nc-text-secondary">快速生成适合探索，AI 导演适合团队交付和镜头级控制。</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={handleDirectorPath}>
                <FlowIcon />
                进入工作流
              </Button>
              <Button variant="primary" onClick={handleQuickGenerate} disabled={!localPrompt.trim() || isRunning}>
                <PlayIcon />
                {isRunning ? "生成中" : "立即生成"}
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="预览方向" subtitle="让内容成为主角，工具只在需要时出现。" contentClassName="p-5">
          <MediaThumb tone="accent" duration={`${durationPreset}s`} badge={<StatusBadge tone="info">{aspect}</StatusBadge>} className="shadow-[0_20px_60px_rgba(108,77,255,0.18)]" />
          <div className="mt-5 grid gap-3">
            <InfoRow label="工作流" value={stylePreset === "commercial" ? "产品广告" : stylePreset === "vlog" ? "创作者 Vlog" : "电影短片"} />
            <InfoRow label="输出比例" value={aspect} />
            <InfoRow label="单镜头时长" value={`${durationPreset} 秒`} />
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-4">
        <HomeShortcut title="项目" subtitle="查看草稿和交付进度" tone="accent" onClick={() => setSidebarPage("projects")} icon={<FolderIcon />} />
        <HomeShortcut title="素材库" subtitle="管理视频、图片和音频" tone="info" onClick={() => setSidebarPage("library")} icon={<GridIcon />} />
        <HomeShortcut title="模板" subtitle="从成熟镜头结构开始" tone="success" onClick={() => setSidebarPage("templates")} icon={<TemplateIcon />} />
        <HomeShortcut title="编辑器" subtitle="进入分镜与时间线" tone="warning" onClick={() => setSidebarPage("edit")} icon={<TimelineIcon />} />
      </div>

      <SectionCard
        className="mt-6"
        title="精选模板"
        subtitle="选择一个常见视频场景，快速带入镜头结构、参考素材和生成参数。"
        action={<Button variant="ghost" onClick={() => setSidebarPage("templates")}>查看全部</Button>}
      >
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {featuredTemplates.map((template, index) => (
            <Surface key={template.id} interactive className="overflow-hidden p-4">
              <button type="button" onClick={() => applyTemplate(template)} className="w-full text-left">
                <MediaThumb src={template.thumbnail} title={template.nameZh} tone={index % 2 === 0 ? "accent" : "info"} duration={template.duration} badge={<StatusBadge tone="accent">{template.shotCount} 镜头</StatusBadge>} />
                <div className="px-1 pt-5">
                  <h3 className="line-clamp-1 text-[17px] font-semibold leading-7 text-nc-text">{template.nameZh}</h3>
                  <p className="mt-2 line-clamp-2 min-h-[44px] text-[14px] leading-[22px] text-nc-text-secondary">{template.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Pill tone="neutral">{template.style}</Pill>
                    <Pill tone="info">{template.workflow === "text_to_video" ? "文生视频" : template.workflow === "image_to_video" ? "图生视频" : "多模态"}</Pill>
                  </div>
                </div>
              </button>
            </Surface>
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
});

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[16px] border border-nc-border bg-white p-4">
      <p className="mb-3 text-[13px] font-semibold leading-5 text-nc-text-secondary">{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] bg-nc-panel px-4 py-3">
      <span className="text-[13px] leading-5 text-nc-text-secondary">{label}</span>
      <span className="text-[13px] font-semibold leading-5 text-nc-text">{value}</span>
    </div>
  );
}

function HomeShortcut({ title, subtitle, icon, tone, onClick }: { title: string; subtitle: string; icon: React.ReactNode; tone: "accent" | "info" | "success" | "warning"; onClick: () => void }) {
  return (
    <Surface interactive className="p-5">
      <button type="button" onClick={onClick} className="flex w-full items-center gap-4 text-left">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] border border-nc-border bg-nc-panel text-nc-accent">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[16px] font-semibold leading-6 text-nc-text">{title}</span>
          <span className="mt-1 block text-[13px] leading-5 text-nc-text-secondary">{subtitle}</span>
        </span>
        <StatusBadge tone={tone} className="ml-auto">打开</StatusBadge>
      </button>
    </Surface>
  );
}

function SparkIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l1.4 4.3L16 8l-4.6 1.7L10 14l-1.4-4.3L4 8l4.6-1.7L10 2Z" /></svg>;
}

function CompassIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><path d="m12.5 7.5-1.4 3.6-3.6 1.4 1.4-3.6 3.6-1.4Z" /></svg>;
}

function FlowIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5h4v4H5zM11 11h4v4h-4zM9 7h2a2 2 0 0 1 2 2v2" /></svg>;
}

function PlayIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M7 5.5v9l7-4.5-7-4.5Z" /></svg>;
}

function FolderIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H8l2 2h4.5A2.5 2.5 0 0 1 17 8.5v5A2.5 2.5 0 0 1 14.5 16h-9A2.5 2.5 0 0 1 3 13.5v-7Z" /></svg>;
}

function GridIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" /></svg>;
}

function TemplateIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h12v12H4z" /><path d="M4 8h12M8 8v8" /></svg>;
}

function TimelineIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h14M3 10h9M3 14h14" /><path d="M15 9v2" /></svg>;
}
