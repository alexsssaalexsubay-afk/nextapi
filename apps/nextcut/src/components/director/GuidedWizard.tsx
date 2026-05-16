import { memo, useState } from "react";
import {
  Aperture,
  ArrowRight,
  BookOpen,
  Box,
  CheckCircle2,
  Clapperboard,
  Film,
  Frame,
  Lightbulb,
  MonitorPlay,
  Moon,
  Music,
  Paintbrush,
  Play,
  Smartphone,
  Sparkles,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useDirectorStore, type SeedanceWorkflow } from "@/stores/director-store";
import { useAppStore } from "@/stores/app-store";
import { useDirector } from "@/hooks/useDirector";
import { useI18nStore } from "@/stores/i18n-store";

type WizardStep = "goal" | "content" | "style" | "confirm";

interface GoalOption {
  id: string;
  label: string;
  labelZh: string;
  desc: string;
  descZh: string;
  icon: React.ReactNode;
  accent: string;
  workflow: SeedanceWorkflow;
  defaultShots: number;
  defaultDuration: number;
}

const GOALS: GoalOption[] = [
  {
    id: "story",
    label: "Tell a Story",
    labelZh: "讲一个故事",
    desc: "A short narrative with characters and plot.",
    descZh: "角色、冲突、转折和结尾都交给 AI 编剧扩写。",
    icon: <BookOpen className="h-5 w-5" />,
    accent: "from-[#6C4DFF] to-[#8B7BFF]",
    workflow: "multimodal_story",
    defaultShots: 6,
    defaultDuration: 5,
  },
  {
    id: "product",
    label: "Showcase a Product",
    labelZh: "产品展示",
    desc: "Product reveal, unboxing, or advertisement.",
    descZh: "适合新品发布、广告片、开箱和卖点展示。",
    icon: <Box className="h-5 w-5" />,
    accent: "from-[#00D4E0] to-[#38BDF8]",
    workflow: "image_to_video",
    defaultShots: 3,
    defaultDuration: 5,
  },
  {
    id: "music",
    label: "Music Video",
    labelZh: "音乐 MV",
    desc: "Visual accompaniment to a song or beat.",
    descZh: "根据节奏、氛围和情绪生成镜头结构。",
    icon: <Music className="h-5 w-5" />,
    accent: "from-[#A855F7] to-[#EC4899]",
    workflow: "multimodal_story",
    defaultShots: 8,
    defaultDuration: 5,
  },
  {
    id: "concept",
    label: "Quick Concept",
    labelZh: "快速创意",
    desc: "Rapidly explore a visual idea or mood.",
    descZh: "一句话快速生成方向、分镜和提示词草案。",
    icon: <Lightbulb className="h-5 w-5" />,
    accent: "from-[#F59E0B] to-[#FACC15]",
    workflow: "text_to_video",
    defaultShots: 4,
    defaultDuration: 5,
  },
  {
    id: "social",
    label: "Social Media Clip",
    labelZh: "社交媒体短视频",
    desc: "Vertical or square content for short platforms.",
    descZh: "适合竖屏短视频、口播、UGC 和高节奏内容。",
    icon: <Smartphone className="h-5 w-5" />,
    accent: "from-[#22C55E] to-[#00D4E0]",
    workflow: "text_to_video",
    defaultShots: 4,
    defaultDuration: 5,
  },
  {
    id: "trailer",
    label: "Cinematic Trailer",
    labelZh: "电影预告",
    desc: "Epic trailer with dramatic arc and tension.",
    descZh: "强调气氛、悬念、镜头推进和强节奏剪辑。",
    icon: <Clapperboard className="h-5 w-5" />,
    accent: "from-[#0F172A] to-[#6C4DFF]",
    workflow: "multimodal_story",
    defaultShots: 12,
    defaultDuration: 5,
  },
];

const STYLE_OPTIONS = [
  { id: "cinematic", label: "Cinematic", labelZh: "电影感", icon: <Film className="h-5 w-5" /> },
  { id: "anime", label: "Anime", labelZh: "动画", icon: <Paintbrush className="h-5 w-5" /> },
  { id: "documentary", label: "Documentary", labelZh: "纪录片", icon: <Video className="h-5 w-5" /> },
  { id: "commercial", label: "Commercial", labelZh: "广告", icon: <MonitorPlay className="h-5 w-5" /> },
  { id: "dreamy", label: "Dreamy", labelZh: "梦幻", icon: <Sparkles className="h-5 w-5" /> },
  { id: "noir", label: "Film Noir", labelZh: "黑色电影", icon: <Moon className="h-5 w-5" /> },
  { id: "cyberpunk", label: "Cyberpunk", labelZh: "赛博朋克", icon: <Aperture className="h-5 w-5" /> },
  { id: "vintage", label: "Vintage", labelZh: "复古", icon: <Frame className="h-5 w-5" /> },
];

const STEP_ORDER: WizardStep[] = ["goal", "content", "style", "confirm"];

const STEP_META: Record<WizardStep, { title: string; subtitle: string }> = {
  goal: { title: "目标", subtitle: "选择生产意图" },
  content: { title: "创意", subtitle: "输入 brief" },
  style: { title: "风格", subtitle: "画面与比例" },
  confirm: { title: "生成", subtitle: "确认计划" },
};

export const GuidedWizard = memo(function GuidedWizard({
  onClose,
}: {
  onClose: () => void;
}) {
  const { setPrompt, setSelectedWorkflow, setStyle, setNumShots, setDuration, setAspectRatio } = useDirectorStore();
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const { runPipeline } = useDirector();
  const { t, lang } = useI18nStore();

  const [step, setStep] = useState<WizardStep>("goal");
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [ideaText, setIdeaText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [ratio, setRatio] = useState("16:9");

  const goal = GOALS.find((g) => g.id === selectedGoal);
  const activeStepIndex = STEP_ORDER.indexOf(step);
  const selectedStyleMeta = STYLE_OPTIONS.find((s) => s.id === selectedStyle);

  const handleNext = () => {
    if (step === "goal" && selectedGoal) setStep("content");
    else if (step === "content" && ideaText.trim()) setStep("style");
    else if (step === "style") setStep("confirm");
  };

  const handleBack = () => {
    if (step === "content") setStep("goal");
    else if (step === "style") setStep("content");
    else if (step === "confirm") setStep("style");
  };

  const handleGenerate = async () => {
    if (!goal) return;
    setPrompt(ideaText);
    setSelectedWorkflow(goal.workflow);
    setStyle(selectedStyle);
    setNumShots(goal.defaultShots);
    setDuration(goal.defaultDuration);
    setAspectRatio(ratio);
    onClose();
    setSidebarPage("agents");
    await runPipeline();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/34 p-5 backdrop-blur-md">
      <div className="relative grid max-h-[92vh] w-full max-w-[1120px] overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_34px_120px_rgba(15,23,42,0.30)] lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(108,77,255,0.10),transparent_34%),linear-gradient(180deg,#FFFFFF_0%,#F7F8FC_100%)]" />
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-20 flex h-10 w-10 items-center justify-center rounded-[14px] border border-transparent text-nc-text-tertiary transition hover:border-nc-border hover:bg-white hover:text-nc-text hover:shadow-sm"
          aria-label="关闭向导"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative z-10 flex min-h-0 flex-col overflow-y-auto p-8 lg:p-9">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4 pr-12">
            <div className="min-w-0">
              <div className="mb-2 inline-flex min-h-8 items-center gap-2 rounded-full border border-nc-accent/20 bg-[#F5F3FF] px-3 text-[12px] font-bold uppercase tracking-[0.12em] text-nc-accent">
                <WandSparkles className="h-4 w-4" />
                快速导演
              </div>
              <h2 className="nc-text-safe text-[32px] font-bold leading-[1.14] tracking-[-0.01em] text-nc-text">
                {step === "goal" ? t("wizard.step1Title") : step === "content" ? t("wizard.step2Title") : step === "style" ? t("wizard.step3Title") : t("wizard.step4Title")}
              </h2>
              <p className="nc-text-safe mt-2 max-w-[640px] text-[15px] leading-7 text-nc-text-secondary">
                {step === "goal"
                  ? "选择一个创作目标，NextAPI Studio 会自动配置工作流、镜头数量和默认生产链路。"
                  : step === "content"
                    ? "用中文也可以。写清主体、场景、动作、情绪和用途，AI 导演会扩展成可执行分镜。"
                    : step === "style"
                      ? "选择风格和画幅，后续仍可以在流程画布、分镜板和时间线里逐镜头修改。"
                      : "确认后会进入 AI 导演流程，生成分镜、镜头语言、提示词和预检建议。"}
              </p>
            </div>
          </div>

          <div className="mb-7 grid gap-2 sm:grid-cols-4">
            {STEP_ORDER.map((s, i) => {
              const done = activeStepIndex > i;
              const current = activeStepIndex === i;
              return (
                <div
                  key={s}
                  className={cn(
                    "flex min-h-[64px] items-center gap-3 rounded-[16px] border px-3 transition",
                    current ? "border-nc-accent bg-[#F5F3FF] shadow-sm" : done ? "border-nc-success/20 bg-nc-success/10" : "border-nc-border bg-white/70"
                  )}
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", current ? "bg-nc-accent text-white" : done ? "bg-nc-success text-white" : "bg-nc-panel text-nc-text-tertiary")}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold leading-5 text-nc-text">{STEP_META[s].title}</span>
                    <span className="block truncate text-[12px] leading-5 text-nc-text-tertiary">{STEP_META[s].subtitle}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="min-h-[390px]">
            {step === "goal" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGoal(g.id)}
                    className={cn(
                      "group flex min-h-[164px] flex-col items-start rounded-[20px] border bg-white p-5 text-left shadow-[0_12px_34px_rgba(15,23,42,0.045)] transition-all hover:-translate-y-1 hover:border-nc-accent/30 hover:shadow-[0_18px_48px_rgba(15,23,42,0.09)]",
                      selectedGoal === g.id && "border-nc-accent bg-[#FBFAFF] ring-2 ring-nc-accent/14"
                    )}
                  >
                    <div className="mb-4 flex w-full items-center justify-between gap-3">
                      <span className={cn("flex h-12 w-12 items-center justify-center rounded-[16px] bg-gradient-to-br text-white shadow-[0_14px_34px_rgba(108,77,255,0.22)]", g.accent)}>
                        {g.icon}
                      </span>
                      {selectedGoal === g.id && <CheckCircle2 className="h-5 w-5 text-nc-accent" />}
                    </div>
                    <div className="nc-text-safe text-[18px] font-bold leading-7 text-nc-text">{lang === "zh" ? g.labelZh : g.label}</div>
                    <div className="mt-1 text-[13px] font-semibold leading-5 text-nc-text-tertiary">{lang === "zh" ? g.label : g.labelZh}</div>
                    <p className="nc-text-safe mt-3 line-clamp-2 text-[13px] leading-6 text-nc-text-secondary">{lang === "zh" ? g.descZh : g.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {step === "content" && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="relative rounded-[24px] border border-nc-border bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <textarea
                    value={ideaText}
                    onChange={(e) => setIdeaText(e.target.value)}
                    placeholder={
                      goal?.id === "product" ? "例如：为一款磨砂黑智能相机制作 30 秒产品广告。突出轻便设计、户外拍摄、AI 防抖和专业感。画面要干净、高级、有科技感。"
                      : goal?.id === "story" ? "例如：一个年轻摄影师在雨夜城市里追踪一封神秘信件，最后发现它来自未来的自己。整体气氛悬疑、电影感、带一点温暖。"
                      : goal?.id === "music" ? "例如：电子音乐 MV，霓虹光线随节奏脉冲，一个剪影人物在镜面空间中缓慢起舞，镜头从远景推进到特写。"
                      : "例如：我们要做一支 30 秒短片，主题是未来城市里的个人创作者如何用 AI 把灵感变成视频。要有分镜、参考图、镜头语言和清晰节奏。"
                    }
                    rows={10}
                    className="min-h-[340px] w-full resize-none rounded-[18px] border border-transparent bg-[#F7F8FC] p-5 text-[16px] leading-8 text-nc-text outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent focus:bg-white focus:ring-2 focus:ring-nc-accent/10"
                    autoFocus
                  />
                  <div className="absolute bottom-8 right-8 rounded-full border border-nc-border bg-white/90 px-3 py-1 text-[12px] font-bold text-nc-text-tertiary shadow-sm backdrop-blur">
                    {ideaText.trim().length} 字
                  </div>
                </div>
                <div className="space-y-3">
                  <WizardHint title="建议写清楚" items={["主体是谁", "场景在哪里", "发生什么动作", "情绪和风格", "最终用途"]} />
                  <div className="rounded-[20px] border border-nc-accent/18 bg-[#F5F3FF] p-4">
                    <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-nc-accent">
                      <Sparkles className="h-4 w-4" />
                      语言不用担心
                    </div>
                    <p className="text-[13px] leading-6 text-nc-text-secondary">中文、英文或混合输入都可以。NextAPI Studio 会在后续提示词节点里生成更适合视频模型的结构化英文提示。</p>
                  </div>
                </div>
              </div>
            )}

            {step === "style" && (
              <div className="space-y-6">
                <div>
                  <div className="mb-3 text-[12px] font-bold text-nc-text-tertiary">视觉风格</div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {STYLE_OPTIONS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStyle(s.id)}
                        className={cn(
                          "flex min-h-[112px] flex-col items-start justify-between rounded-[18px] border bg-white p-4 text-left shadow-[0_10px_30px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-nc-accent/30",
                          selectedStyle === s.id && "border-nc-accent bg-[#FBFAFF] ring-2 ring-nc-accent/12"
                        )}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-nc-accent/15 bg-[#F5F3FF] text-nc-accent">{s.icon}</span>
                        <span>
                          <span className="block text-[14px] font-bold leading-5 text-nc-text">{lang === "zh" ? s.labelZh : s.label}</span>
                          <span className="mt-0.5 block text-[12px] font-semibold leading-5 text-nc-text-tertiary">{s.label}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-[12px] font-bold text-nc-text-tertiary">画面比例</div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { id: "16:9", label: "横屏", sub: "Landscape" },
                      { id: "9:16", label: "竖屏", sub: "Portrait" },
                      { id: "1:1", label: "方形", sub: "Square" },
                    ].map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setRatio(r.id)}
                        className={cn(
                          "flex min-h-16 items-center justify-between rounded-[18px] border bg-white px-5 text-left shadow-sm transition hover:-translate-y-0.5",
                          ratio === r.id ? "border-nc-accent bg-[#FBFAFF] ring-2 ring-nc-accent/12" : "border-nc-border"
                        )}
                      >
                        <span>
                          <span className="block text-[16px] font-bold text-nc-text">{r.id}</span>
                          <span className="text-[12px] font-semibold text-nc-text-tertiary">{lang === "zh" ? r.label : r.sub}</span>
                        </span>
                        {ratio === r.id && <CheckCircle2 className="h-5 w-5 text-nc-accent" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === "confirm" && goal && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-[24px] border border-nc-border bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div className="mb-5 flex items-center gap-3">
                    <span className={cn("flex h-12 w-12 items-center justify-center rounded-[16px] bg-gradient-to-br text-white shadow-[0_14px_34px_rgba(108,77,255,0.22)]", goal.accent)}>
                      {goal.icon}
                    </span>
                    <div>
                      <div className="text-[18px] font-bold leading-7 text-nc-text">{lang === "zh" ? goal.labelZh : goal.label}</div>
                      <div className="text-[13px] font-semibold leading-5 text-nc-text-tertiary">{goal.workflow.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ConfirmRow label={t("wizard.style")} value={selectedStyleMeta ? (lang === "zh" ? selectedStyleMeta.labelZh : selectedStyleMeta.label) : selectedStyle} />
                    <ConfirmRow label={t("wizard.formatVal")} value={ratio} />
                    <ConfirmRow label={t("wizard.shots")} value={`${goal.defaultShots} 个镜头`} />
                    <ConfirmRow label={t("wizard.duration")} value={`每镜约 ${goal.defaultDuration}s`} />
                  </div>
                  <div className="mt-5 rounded-[18px] border border-nc-border bg-[#F7F8FC] p-4">
                    <div className="mb-2 text-[12px] font-bold text-nc-text-tertiary">{t("wizard.yourIdea")}</div>
                    <p className="nc-text-safe whitespace-pre-wrap text-[14px] leading-7 text-nc-text">{ideaText}</p>
                  </div>
                </div>
                <div className="rounded-[24px] border border-nc-border bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex items-center gap-2 text-[15px] font-bold text-nc-text">
                    <Sparkles className="h-4 w-4 text-nc-accent" />
                    下一步会生成
                  </div>
                  <div className="space-y-3">
                    {["剧本与场景拆解", "角色与一致性锚点", "分镜与首尾帧提示", "镜头语言与运镜", "生成前预检"].map((item, index) => (
                      <div key={item} className="flex items-center gap-3 rounded-[14px] bg-nc-bg px-3 py-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nc-accent text-[12px] font-bold text-white">{index + 1}</span>
                        <span className="text-[13px] font-semibold text-nc-text-secondary">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-nc-border pt-6">
            <button
              onClick={step === "goal" ? onClose : handleBack}
              className="rounded-[13px] px-5 py-3 text-[14px] font-bold text-nc-text-secondary transition hover:bg-white hover:text-nc-text hover:shadow-sm"
            >
              {step === "goal" ? t("wizard.cancel") : t("wizard.back")}
            </button>

            {step === "confirm" ? (
              <button
                onClick={handleGenerate}
                className="inline-flex min-h-12 items-center gap-2.5 rounded-[14px] bg-nc-accent px-7 text-[14px] font-bold text-white shadow-[0_18px_44px_rgba(108,77,255,0.28)] transition hover:-translate-y-0.5 hover:bg-nc-accent-hover"
              >
                <Play className="h-4 w-4 fill-current" />
                {t("wizard.generate")}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={(step === "goal" && !selectedGoal) || (step === "content" && !ideaText.trim())}
                className={cn(
                  "inline-flex min-h-12 items-center gap-2 rounded-[14px] px-7 text-[14px] font-bold transition",
                  ((step === "goal" && selectedGoal) || (step === "content" && ideaText.trim()) || step === "style")
                    ? "bg-nc-accent text-white shadow-[0_18px_44px_rgba(108,77,255,0.24)] hover:-translate-y-0.5 hover:bg-nc-accent-hover"
                    : "cursor-not-allowed bg-nc-panel text-nc-text-tertiary"
                )}
              >
                {t("wizard.next")}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <aside className="relative z-10 hidden min-h-[680px] border-l border-nc-border bg-[#F8FAFF] p-5 lg:block">
          <div className="sticky top-5 space-y-4">
            <div className="relative h-[220px] overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_18px_56px_rgba(15,23,42,0.10)]">
              <img src="/onboarding/setup-config-hero.png" alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.55))]" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="rounded-[18px] border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
                  <div className="text-[13px] font-bold text-nc-text">NextAPI Studio 会为你编排</div>
                  <div className="mt-1 text-[12px] leading-5 text-nc-text-secondary">提示词、参考素材、运镜、分镜和时间线</div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-nc-border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-nc-text">
                <Sparkles className="h-4 w-4 text-nc-accent" />
                当前方案
              </div>
              <div className="space-y-3">
                <PreviewFact label="目标" value={goal ? (lang === "zh" ? goal.labelZh : goal.label) : "待选择"} />
                <PreviewFact label="风格" value={selectedStyleMeta ? (lang === "zh" ? selectedStyleMeta.labelZh : selectedStyleMeta.label) : selectedStyle} />
                <PreviewFact label="画幅" value={ratio} />
                <PreviewFact label="镜头" value={goal ? `${goal.defaultShots} 个镜头` : "-"} />
              </div>
            </div>

            <div className="rounded-[22px] border border-nc-border bg-white p-4 shadow-sm">
              <div className="mb-3 text-[14px] font-bold text-nc-text">生产链路</div>
              <div className="space-y-2">
                {["创意简报", "脚本生成", "分镜", "镜头语言", "生成前检查"].map((item, index) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", activeStepIndex >= Math.min(index, 3) ? "bg-nc-accent" : "bg-nc-border-strong")} />
                    <span className="text-[12px] font-semibold text-nc-text-secondary">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
});

function WizardHint({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[20px] border border-nc-border bg-white p-4 shadow-sm">
      <div className="mb-3 text-[14px] font-bold text-nc-text">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-[12px] bg-nc-bg px-3 py-2 text-[12px] font-semibold text-nc-text-secondary">
            <CheckCircle2 className="h-3.5 w-3.5 text-nc-success" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[13px] bg-nc-bg px-3 py-2">
      <span className="text-[12px] font-semibold text-nc-text-tertiary">{label}</span>
      <span className="line-clamp-1 text-right text-[12px] font-bold text-nc-text">{value}</span>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-nc-border bg-nc-bg px-4 py-3">
      <span className="text-[12px] font-bold text-nc-text-tertiary">{label}</span>
      <span className="mt-1 block text-[14px] font-bold capitalize leading-5 text-nc-text">{value}</span>
    </div>
  );
}
