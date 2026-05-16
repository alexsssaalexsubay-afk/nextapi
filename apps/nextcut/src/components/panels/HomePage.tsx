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

const PRODUCTION_STAGES = [
  { label: "创意", detail: "创意约束" },
  { label: "导演", detail: "镜头约束" },
  { label: "流程", detail: "画布编排" },
  { label: "复核", detail: "提示词质检" },
  { label: "生成", detail: "交付输出" },
];

const QUALITY_SIGNALS = [
  { label: "镜头级规划", value: "镜头约束" },
  { label: "一致性链路", value: "身份锁定" },
  { label: "可审阅状态", value: "提示词质检" },
];

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
        eyebrow="NextAPI Studio"
        title="从一句创意到可交付影片"
        subtitle="NextAPI Studio 把创意简报、AI 导演、分镜画布、提示词检查和剪辑时间线收进同一个创作工作台，让团队看清每个镜头如何被规划、审阅和交付。"
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

      <section className="mb-6 overflow-hidden rounded-[28px] border border-white/75 bg-[radial-gradient(circle_at_18%_10%,rgba(108,77,255,0.22),transparent_34%),radial-gradient(circle_at_84%_16%,rgba(0,212,224,0.20),transparent_30%),linear-gradient(135deg,#0f172a_0%,#1f2347_48%,#34135f_100%)] p-1 shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <div className="grid gap-5 rounded-[24px] border border-white/10 bg-white/[0.06] p-5 text-white backdrop-blur-xl lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="min-w-0 p-2 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="info" className="border-white/20 bg-white/12 text-white">高阶预览</StatusBadge>
              <StatusBadge tone="accent" className="border-white/20 bg-white/12 text-white">闭环视频工作台</StatusBadge>
            </div>
            <h2 className="mt-5 max-w-[760px] text-[36px] font-bold leading-[44px] tracking-[-0.03em] sm:text-[44px] sm:leading-[52px]">
              不是表单生成器，是镜头级 AI 生产中控台。
            </h2>
            <p className="mt-4 max-w-[680px] text-[15px] leading-7 text-white/72">
              首页直接呈现从创意到分镜、质检和交付的主航道，减少廉价占位感；所有入口都回到真实可执行的 AI 导演、流程画布、素材库和剪辑流程。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="primary" onClick={handleDirectorPath} className="bg-white text-[#351a74] shadow-[0_18px_42px_rgba(255,255,255,0.22)] hover:bg-white/95">
                <SparkIcon />
                打开 AI 导演
              </Button>
              <Button variant="secondary" onClick={() => setSidebarPage("workspace")} className="border-white/20 bg-white/10 text-white hover:border-white/35 hover:bg-white/16">
                <FlowIcon />
                查看流程画布
              </Button>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/14 bg-white/[0.09] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/12 pb-4">
              <div>
                <p className="text-[13px] font-semibold leading-5 text-white/58">生产路线</p>
                <p className="mt-1 text-[17px] font-semibold leading-6 text-white">{stylePreset === "commercial" ? "商业广告链路" : stylePreset === "vlog" ? "创作者叙事链路" : "电影短片链路"}</p>
              </div>
              <StatusBadge tone={localPrompt.trim() ? "success" : "warning"} className="border-white/20 bg-white/12 text-white">{localPrompt.trim() ? "创意已就绪" : "等待创意"}</StatusBadge>
            </div>

            <div className="mt-5 grid gap-3">
              {PRODUCTION_STAGES.map((stage, index) => (
                <div key={stage.label} className="flex items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.07] px-3.5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-bold text-[#351a74]">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold leading-5 text-white">{stage.label}</p>
                    <p className="text-[12px] leading-5 text-white/56">{stage.detail}</p>
                  </div>
                  <div className="ml-auto h-1.5 w-14 rounded-full bg-white/12">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#8F7AFF] to-[#00D4E0]" style={{ width: `${52 + index * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {QUALITY_SIGNALS.map((signal) => (
                <div key={signal.label} className="rounded-[16px] border border-white/10 bg-black/10 px-3.5 py-3">
                  <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-white/45">{signal.label}</p>
                  <p className="mt-1 truncate text-[13px] font-semibold leading-5 text-white">{signal.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
