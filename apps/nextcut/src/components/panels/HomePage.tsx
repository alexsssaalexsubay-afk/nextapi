import { useState, memo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useDirectorStore } from "@/stores/director-store";
import { useDirector } from "@/hooks/useDirector";
import { cn } from "@/lib/cn";
import { GuidedWizard } from "@/components/director/GuidedWizard";

export const HomePage = memo(function HomePage() {
  const { setSidebarPage } = useAppStore();
  const { prompt, setPrompt, setUseStructuredPrompt, isRunning } = useDirectorStore();
  const { runPipeline } = useDirector();
  const [localPrompt, setLocalPrompt] = useState(prompt || "");
  const [showWizard, setShowWizard] = useState(false);

  const handleQuickGenerate = async () => {
    setPrompt(localPrompt);
    setSidebarPage("agents");
    await runPipeline();
  };

  const handlePrecisePath = () => {
    if (localPrompt) setPrompt(localPrompt);
    setUseStructuredPrompt(true);
    setSidebarPage("agents");
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-nc-bg p-8">
      {showWizard && <GuidedWizard onClose={() => setShowWizard(false)} />}

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 pb-16">
        {/* Header */}
        <div className="flex flex-col mb-4">
          <h1 className="text-[36px] leading-[44px] font-bold tracking-tight text-nc-text flex items-center gap-2">
            描述它，导演它，渲染它
            <span className="text-nc-accent text-3xl">✨</span>
          </h1>
          <p className="text-[14px] text-nc-text-secondary mt-2 font-medium">
            用一句话快速生成，或精准控制每一个镜头，创作属于你的视觉故事。
          </p>
        </div>

        {/* Two main path cards */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Quick Generate Card */}
          <div className="flex flex-1 flex-col rounded-[20px] border border-nc-border bg-nc-surface p-6 shadow-sm transition-all hover:shadow-md relative overflow-hidden group">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-nc-accent text-white shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-nc-text flex items-center gap-2">快速生成 <span className="bg-nc-accent-dim text-nc-accent text-[12px] font-medium px-2 py-0.5 rounded-[999px]">AI 一句话成片</span></h2>
                <p className="text-[14px] text-nc-text-secondary mt-0.5">输入你的想法，AI 将为你生成完整视频</p>
              </div>
            </div>

            <textarea
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              placeholder="例如：一位穿红裙的女孩在日落海边奔跑，电影感，慢镜头..."
              rows={4}
              className={cn(
                "mb-6 min-h-[120px] w-full resize-none rounded-[16px] border border-nc-border bg-nc-bg p-4 text-[14px] leading-[22px] text-nc-text",
                "placeholder:text-nc-text-tertiary outline-none transition-all duration-200",
                "focus:border-nc-accent focus:ring-1 focus:ring-nc-accent/20 focus:shadow-[0_0_0_2px_rgba(109,94,248,0.1)]"
              )}
            />

            <div className="mt-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 rounded-[999px] bg-nc-bg border border-nc-border px-3 py-1 h-[28px] text-[13px] font-medium text-nc-text-secondary hover:bg-nc-panel">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                  9:16 竖屏
                </button>
                <button className="flex items-center gap-1.5 rounded-[999px] bg-nc-bg border border-nc-border px-3 py-1 h-[28px] text-[13px] font-medium text-nc-text-secondary hover:bg-nc-panel">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  30s 时长
                </button>
                <button className="flex items-center gap-1.5 rounded-[999px] bg-nc-bg border border-nc-border px-3 py-1 h-[28px] text-[13px] font-medium text-nc-text-secondary hover:bg-nc-panel">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  电影级画质
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </button>
              </div>
              <button
                onClick={handleQuickGenerate}
                disabled={!localPrompt.trim() || isRunning}
                className={cn(
                  "flex h-[44px] items-center justify-center gap-2 rounded-[12px] px-6 text-[14px] font-semibold transition-all duration-200",
                  localPrompt.trim() && !isRunning
                    ? "bg-nc-accent text-white hover:bg-nc-accent-hover hover:-translate-y-0.5 active:bg-[#4E42CC]"
                    : "bg-[#D9D6FE] text-white cursor-not-allowed"
                )}
              >
                立即生成 <span className="text-[16px]">✨</span>
              </button>
            </div>
          </div>

          {/* Precise Path Card */}
          <div className="flex flex-1 flex-col rounded-[20px] border border-nc-border bg-nc-surface p-6 shadow-sm transition-all hover:shadow-md group">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-nc-success text-white shadow-sm">
                  <span className="font-bold text-[18px]">C</span>
                </div>
                <div>
                  <h2 className="text-[18px] font-semibold text-nc-text flex items-center gap-2">专业导演模式 <span className="bg-nc-success/10 text-nc-success text-[12px] font-medium px-2 py-0.5 rounded-[999px]">精细化创作</span></h2>
                  <p className="text-[14px] text-nc-text-secondary mt-0.5">结构化创作流程，精细控制每一步</p>
                </div>
              </div>
              <button
                onClick={handlePrecisePath}
                className="flex h-[40px] items-center gap-1.5 rounded-[12px] border border-nc-border bg-nc-surface px-4 text-[14px] font-medium text-nc-text transition-colors hover:bg-nc-bg active:bg-nc-panel"
              >
                打开导演工作台
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-4 relative flex-1 justify-center">
              <div className="absolute left-[19px] top-6 bottom-6 w-[2px] bg-nc-border z-0" />
              <StepPreview number={1} title="脚本" desc="AI 编写剧情脚本，设定角色与对话" icon="📄" />
              <StepPreview number={2} title="分镜" desc="可视化镜头列表，拖拽排序，拆分/合并" icon="🎞️" />
              <StepPreview number={3} title="提示词" desc="精调每个镜头：主体 → 动作 → 运动 → 风格" icon="🪄" />
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickLink icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-accent"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>} title="快速生成" subtitle="一句话生成视频" onClick={() => {}} />
          <QuickLink icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-success"><path d="M3 7l7-4 7 4v6l-7 4-7-4V7z" /><path d="M10 3v14" /><path d="M3 7l7 4 7-4" /></svg>} title="导演工作台" subtitle="精细化创作流程" onClick={handlePrecisePath} />
          <QuickLink icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-info"><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /></svg>} title="模板库" subtitle="热门场景模板" onClick={() => setSidebarPage("templates")} />
          <QuickLink icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>} title="项目" subtitle="管理你的作品" onClick={() => setSidebarPage("projects")} />
        </div>

        {/* Templates Section */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-[18px] font-bold text-nc-text">灵感模板</h3>
              <span className="text-[13px] text-nc-text-secondary">开箱即用，激发你的创作灵感</span>
            </div>
            <button
              onClick={() => setSidebarPage("templates")}
              className="flex items-center gap-1 text-[13px] font-medium text-nc-text-secondary hover:text-nc-text transition-colors"
            >
              查看全部模板
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Mocked template cards matching the image */}
            <TemplateCard title="竖屏剧情短视频 30s" subtitle="情感故事 | 人物叙事 | 电影感" tags={["9:16", "30s", "6 镜头"]} badge="热门" color="bg-blue-900" />
            <TemplateCard title="产品开箱 15s" subtitle="电商带货 | 产品展示 | 高转化" tags={["16:9", "15s", "3 镜头"]} badge="新品" color="bg-orange-800" />
            <TemplateCard title="电影预告片 60s" subtitle="史诗氛围 | 预告片 | 高冲击力" tags={["16:9", "60s", "12 镜头"]} badge="精选" color="bg-slate-800" />
          </div>
        </div>

        {/* Recent Projects Section */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[18px] font-bold text-nc-text">最近项目</h3>
            <button
              onClick={() => setSidebarPage("projects")}
              className="flex items-center gap-1 text-[13px] font-medium text-nc-text-secondary hover:text-nc-text transition-colors"
            >
              全部项目
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <ProjectCard title="夏日海边短片" time="更新于 2 小时前" />
            <ProjectCard title="咖啡品牌广告" time="更新于 昨天" />
            <ProjectCard title="未来城市预告片" time="更新于 3 天前" />
          </div>
        </div>

      </div>
    </div>
  );
});

function StepPreview({ number, title, desc, icon }: { number: number; title: string; desc: string; icon: string }) {
  return (
    <div className="flex items-center gap-4 z-10">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nc-success text-white text-[14px] font-bold shadow-sm">
        {number}
      </div>
      <div className="flex-1 rounded-[14px] border border-nc-border bg-nc-bg p-4 shadow-sm flex items-center justify-between">
        <div>
          <div className="text-[16px] font-semibold text-nc-text">{title}</div>
          <div className="text-[14px] text-nc-text-secondary mt-0.5">{desc}</div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-nc-border bg-nc-surface">
          {icon === "📄" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-text-secondary"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
          {icon === "🎞️" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-success"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>}
          {icon === "🪄" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-info"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}
        </div>
      </div>
    </div>
  );
}

function QuickLink({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-4 rounded-[14px] border border-nc-border bg-nc-surface p-4 text-left shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-nc-bg border border-nc-border">
        {icon}
      </div>
      <div>
        <div className="text-[16px] font-semibold text-nc-text">{title}</div>
        <div className="text-[12px] text-nc-text-tertiary mt-0.5">{subtitle}</div>
      </div>
    </button>
  );
}

function TemplateCard({ title, subtitle, tags, badge, color }: { title: string; subtitle: string; tags: string[]; badge: string; color: string }) {
  return (
    <div className="group relative flex h-48 cursor-pointer flex-col justify-end overflow-hidden rounded-[20px] shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1 border border-nc-border">
      <div className={cn("absolute inset-0 transition-transform duration-700 group-hover:scale-105", color)}>
        {/* Placeholder for actual images */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      </div>
      <div className="absolute right-4 top-4 rounded-[999px] px-2 py-0.5 text-[12px] font-medium text-white shadow backdrop-blur-md bg-white/20">
        {badge}
      </div>
      <div className="relative z-10 p-6">
        <h4 className="text-[18px] font-semibold text-white shadow-sm">{title}</h4>
        <p className="text-[14px] text-white/80 mt-1 mb-3">{subtitle}</p>
        <div className="flex gap-2">
          {tags.map((tag, i) => (
            <span key={i} className="rounded-[999px] border border-white/20 bg-white/10 px-2 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ title, time }: { title: string; time: string }) {
  return (
    <div className="group flex cursor-pointer items-center gap-4 rounded-[14px] border border-nc-border bg-nc-surface p-4 shadow-sm transition-all hover:shadow-md">
      <div className="h-16 w-24 shrink-0 rounded-[12px] bg-nc-panel overflow-hidden border border-nc-border">
        {/* Image placeholder */}
        <div className="h-full w-full bg-gradient-to-br from-nc-border to-nc-bg opacity-50" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="text-[16px] font-semibold text-nc-text mb-1">{title}</div>
        <div className="text-[12px] text-nc-text-tertiary">{time}</div>
      </div>
      <button className="flex h-8 w-8 items-center justify-center rounded-[10px] text-nc-text-tertiary hover:bg-nc-panel hover:text-nc-text transition-colors opacity-0 group-hover:opacity-100">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
      </button>
    </div>
  );
}
