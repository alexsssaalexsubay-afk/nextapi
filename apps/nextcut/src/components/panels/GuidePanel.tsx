import { ArrowRight, CheckCircle2, Compass, Film, KeyRound, LayoutDashboard, Maximize2, PanelTopOpen, Sparkles, Wand2 } from "lucide-react";
import { Button, PageHeader, PageShell, Pill, SectionCard, Surface } from "@/components/ui/kit";
import { useAppStore, type SidebarPage, type StoryflowMode, type WorkspaceView } from "@/stores/app-store";

type GuideStep = {
  id: string;
  title: string;
  image: string;
  when: string;
  how: string[];
  page: SidebarPage;
  view?: WorkspaceView;
  storyflowMode?: StoryflowMode;
  cta: string;
};

const GUIDE_STEPS: GuideStep[] = [
  {
    id: "setup",
    title: "1. 首次配置与项目入口",
    image: "/tutorial/setup-guide.jpg",
    when: "首次使用、换账号、模型连接失败、生成请求无法提交时，先看这里。",
    how: [
      "进入「设置」，粘贴 NextAPI Key，确认视频模型、质量和基础地址。",
      "连接正常后回到「创建」或「AI 导演」，用一句话开始生成规划。",
      "团队环境中，建议先统一模型和导出规格，再开始批量生成。",
    ],
    page: "settings",
    cta: "打开设置",
  },
  {
    id: "director",
    title: "2. AI 导演生成规划",
    image: "/tutorial/director-guide.jpg",
    when: "从零开始构思、需要快速获得分镜、镜头清单和创作方向时使用。",
    how: [
      "在大输入框写清楚目标、受众、时长、风格和必须出现的内容。",
      "选择生成模式，配置比例、风格、时长、镜头数量和参考素材。",
      "点击「生成规划」，观察右侧 Pipeline Status 与 AI Director Team 进度。",
    ],
    page: "agents",
    cta: "打开 AI 导演",
  },
  {
    id: "storyboard",
    title: "3. 分镜板与镜头合约",
    image: "/tutorial/storyboard-guide.jpg",
    when: "AI 已生成初版规划，需要检查叙事顺序、镜头意图和提示词质量时使用。",
    how: [
      "逐张检查镜头卡片的标题、画面、时长、状态和质量提示。",
      "拖拽卡片调整顺序，点击镜头查看 Prompt、动作分解、Camera Contract 和 Reference Instructions。",
      "对问题镜头单独重生成或保存版本，避免整条流程反复返工。",
    ],
    page: "workspace",
    view: "storyboard",
    cta: "打开分镜板",
  },
  {
    id: "workbench",
    title: "4. Storyflow 无限画布",
    image: "/tutorial/workbench-normal.png",
    when: "需要把创意意图、参考素材、提示词策略、运镜、场景组、镜头和输出时间线放在一张结构图里梳理时使用。",
    how: [
      "从「无限画布 / 工作台」进入，默认进入 Storyflow 模式。",
      "点击节点会同步右侧 Inspector、预览和底部 mini timeline。",
      "运行 Prompt Decomposition、Reference Stack、Camera Motion、Storyboard Keyframes、Preflight 或 Generate Shot，结果会写回当前镜头。",
      "用底部时间线检查时长、顺序和节奏是否顺滑。",
    ],
    page: "workspace",
    view: "canvas",
    storyflowMode: "storyflow",
    cta: "打开工作台",
  },
  {
    id: "clean",
    title: "5. 工作台纯净模式",
    image: "/tutorial/workbench-clean.png",
    when: "节点很多、想专注编排 Prompt Decomposition / Reference Stack / Camera Motion 时使用。",
    how: [
      "在工作台按 P 或切换 Focus Canvas，隐藏左侧栏和固定面板。",
      "专注缩放、拖拽、框选、连接和聚焦节点，检查创作链条是否清楚。",
      "用浮动控制条运行节点、打开 Inspector 或退出纯净模式。",
    ],
    page: "workspace",
    view: "canvas",
    storyflowMode: "focus",
    cta: "进入流程画布",
  },
  {
    id: "split",
    title: "6. 分屏检查模式",
    image: "/tutorial/workbench-split.png",
    when: "交付前复核，或需要一边看分镜、一边看预览和属性时使用。",
    how: [
      "切到 Split Review，左侧看镜头列表，中间看 Storyflow + Timeline，右侧看预览和检查器。",
      "点击镜头卡片后，预览、属性、时间线会围绕同一个镜头同步。",
      "适合检查节奏断点、提示词缺漏、时长不合理和镜头状态异常。",
    ],
    page: "workspace",
    view: "split",
    storyflowMode: "review",
    cta: "打开分屏",
  },
  {
    id: "editor",
    title: "7. 编辑、生成与导出",
    image: "/tutorial/editor-export-guide.png",
    when: "分镜已经稳定，需要精修成片、补生成、发布或导出时使用。",
    how: [
      "从镜头库选择镜头，在预览区检查画面、运动和字幕。",
      "在时间线调整顺序、转场、字幕和音频，右侧修改镜头参数和导出设置。",
      "对单个镜头补生成，最后导出预览或发布完整视频。",
    ],
    page: "edit",
    cta: "打开编辑器",
  },
];

const ICONS = [KeyRound, Wand2, LayoutDashboard, Compass, Maximize2, PanelTopOpen, Film];

const TODAY_UPDATES = [
  {
    title: "客户端壳层与真实入口",
    image: "/tutorial/client-shell-guide.png",
    description: "品牌、窗口控件、工作区菜单、搜索和导入入口统一在新的客户端壳层里，不再把假团队信息放进侧栏。",
  },
  {
    title: "素材库只展示真实内容",
    image: "/tutorial/library-real-assets-guide.png",
    description: "素材库从本机导入和生成镜头资产出发；空库显示下一步操作，不再注入 demo 素材兜底。",
  },
  {
    title: "Provider 与提示词可配置",
    image: "/tutorial/provider-registry-guide.png",
    description: "Seedance、NextAPI、ComfyUI、RunningHub、本地 OpenAI 兼容和自定义 HTTP 走统一配置与响应 envelope。",
  },
];

const STORYFLOW_MODES: Array<{
  title: string;
  mode: StoryflowMode;
  image: string;
  description: string;
  points: string[];
}> = [
  {
    title: "Storyflow",
    mode: "storyflow",
    image: "/tutorial/workbench-normal.png",
    description: "默认无限画布，把创意生产链路从 Intent 到 Output 串起来。",
    points: ["节点选择联动 Inspector / Preview / Timeline", "节点运行会写回 prompt、references、camera 和 generationParams", "线条有运行、完成、失败和选中状态"],
  },
  {
    title: "Focus Canvas",
    mode: "focus",
    image: "/tutorial/workbench-clean.png",
    description: "纯净创作模式，把边栏和固定面板收掉，专注结构和拖拽。",
    points: ["P 切换纯净模式", "F 聚焦当前节点", "Cmd/Ctrl+0 适配画布"],
  },
  {
    title: "Split Review",
    mode: "review",
    image: "/tutorial/workbench-split.png",
    description: "分屏复核模式，用于看到问题、改参数、看结果的闭环。",
    points: ["左侧镜头列表", "中间画布和时间线", "右侧预览和分区式 Inspector"],
  },
  {
    title: "Timeline Edit",
    mode: "timeline",
    image: "/tutorial/workbench-timeline.png",
    description: "执行层时间线模式，适合镜头顺序、时长、节奏、字幕和标记精修。",
    points: ["拖拽镜头块调整顺序", "-1s / +1s 快速改时长", "选中 clip 后同步节点和 Inspector"],
  },
];

export function GuidePanel() {
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const setWorkspaceView = useAppStore((s) => s.setWorkspaceView);
  const setStoryflowMode = useAppStore((s) => s.setStoryflowMode);

  const openStep = (step: GuideStep) => {
    if (step.view) setWorkspaceView(step.view);
    if (step.storyflowMode) setStoryflowMode(step.storyflowMode);
    setSidebarPage(step.page);
  };

  return (
    <PageShell className="gap-7">
      <PageHeader
        eyebrow="NextCut Guide"
        title="NextCut 使用指南"
        subtitle="把整个产品的使用路径放在应用里：什么时候用哪个页面、怎么从创意走到分镜、工作台、编辑和导出。"
        action={
          <Button variant="primary" onClick={() => openStep(GUIDE_STEPS[1])}>
            <Sparkles className="h-4 w-4" />
            从 AI 导演开始
          </Button>
        }
      />

      <SectionCard
        title="当前客户端与品牌入口"
        subtitle="今天的桌面端壳层已收敛：品牌、工作区、导入素材、运行状态和设置入口都对应真实产品行为。"
        contentClassName="p-0"
      >
        <div className="grid gap-6 p-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="flex min-h-[190px] items-center justify-center rounded-[18px] border border-nc-border bg-white px-8 py-10 shadow-sm">
            <img
              src="/brand/nextcut-logo-lockup.png"
              alt="NextCut 品牌标识"
              className="max-h-[86px] w-full max-w-[520px] object-contain"
            />
          </div>
          <div className="grid gap-3">
            {[
              "侧栏顶部使用 NextCut 品牌图，不再用临时图标或假团队卡片占位。",
              "本地工作区入口可展开，直接进入模型与账户设置或项目空间。",
              "导入素材会打开本机文件选择，素材库只展示真实导入或 AI 导演生成的资产。",
              "设置页只展示用户需要理解的模型、Provider、提示词和视频生成配置。",
            ].map((item, index) => (
              <div key={item} className="flex gap-3 rounded-[14px] border border-nc-border bg-white px-4 py-3 shadow-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F5F3FF] text-[12px] font-bold text-nc-accent">{index + 1}</span>
                <p className="text-[14px] leading-6 text-nc-text-secondary">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="今天更新后的功能图"
        subtitle="这些图对应当前真实产品边界：客户端壳层、素材库数据来源、Provider Registry 和提示词配置。"
      >
        <div className="grid gap-5 xl:grid-cols-3">
          {TODAY_UPDATES.map((item) => (
            <Surface key={item.title} className="overflow-hidden rounded-[18px]">
              <div className="aspect-video overflow-hidden bg-nc-bg">
                <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
              </div>
              <div className="p-5">
                <h3 className="text-[16px] font-semibold leading-6 text-nc-text">{item.title}</h3>
                <p className="mt-2 text-[14px] leading-6 text-nc-text-secondary">{item.description}</p>
              </div>
            </Surface>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="无限画布 / Storyflow 当前能力"
        subtitle="工作台已经不是旧的卡片拼接页。它现在有四种模式，并且 Canvas、Timeline、Preview、Inspector 共用同一个镜头状态。"
      >
        <div className="grid gap-5 xl:grid-cols-4">
          {STORYFLOW_MODES.map((item) => (
            <Surface key={item.mode} className="overflow-hidden rounded-[18px]">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceView("canvas");
                  setStoryflowMode(item.mode);
                  setSidebarPage("workspace");
                }}
                className="group block w-full text-left"
              >
                <div className="aspect-video overflow-hidden bg-nc-bg">
                  <img src={item.image} alt={`${item.title} 模式`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                </div>
                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-[16px] font-semibold leading-6 text-nc-text">{item.title}</h3>
                    <Pill tone="accent">{item.mode}</Pill>
                  </div>
                  <p className="text-[13px] leading-6 text-nc-text-secondary">{item.description}</p>
                  <div className="mt-4 grid gap-2">
                    {item.points.map((point) => (
                      <div key={point} className="flex gap-2 text-[12px] leading-5 text-nc-text-tertiary">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-nc-accent" />
                        <span className="nc-text-safe line-clamp-2">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            </Surface>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="完整流程总览"
        subtitle="先看这张图：NextCut 的主线不是堆表单，而是从创意输入到镜头合约、画布编排、时间线精修和导出。"
        contentClassName="p-0"
      >
        <div className="grid gap-6 p-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="overflow-hidden rounded-[18px] border border-nc-border bg-nc-bg">
            <img src="/tutorial/product-overview.jpg" alt="NextCut 从创意到成片总览" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col justify-center gap-4">
            {[
              "配置 Key 和模型，确保后端请求可用。",
              "AI 导演把一句创意拆成角色、分镜、镜头和生成计划。",
              "分镜板负责叙事顺序和镜头质量检查。",
              "工作台负责结构化创作链路和节点编排。",
              "编辑器负责时间线精修、补生成和导出。",
            ].map((item, index) => (
              <div key={item} className="flex gap-3 rounded-[14px] border border-nc-border bg-white px-4 py-3 shadow-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F5F3FF] text-[12px] font-bold text-nc-accent">{index + 1}</span>
                <p className="text-[14px] leading-6 text-nc-text-secondary">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-6">
        {GUIDE_STEPS.map((step, index) => {
          const Icon = ICONS[index] || CheckCircle2;
          return (
            <Surface key={step.id} className="overflow-hidden rounded-[20px]">
              <div className="grid gap-0 xl:grid-cols-[minmax(0,0.95fr)_minmax(440px,1.25fr)]">
                <div className="flex flex-col gap-5 p-6">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] border border-nc-accent/20 bg-[#F5F3FF] text-nc-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Pill tone="accent">{step.page === "workspace" ? "工作台" : step.page}</Pill>
                        {step.view && <Pill tone="info">{step.view}</Pill>}
                        {step.storyflowMode && <Pill tone="neutral">{step.storyflowMode}</Pill>}
                      </div>
                      <h2 className="text-[22px] font-semibold leading-8 text-nc-text">{step.title}</h2>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-nc-border bg-nc-bg p-4">
                    <h3 className="text-[14px] font-semibold leading-6 text-nc-text">什么时候用</h3>
                    <p className="mt-2 text-[14px] leading-7 text-nc-text-secondary">{step.when}</p>
                  </div>

                  <div className="rounded-[16px] border border-nc-border bg-white p-4">
                    <h3 className="text-[14px] font-semibold leading-6 text-nc-text">怎么用</h3>
                    <div className="mt-3 grid gap-3">
                      {step.how.map((item) => (
                        <div key={item} className="flex gap-3">
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-nc-success" />
                          <p className="text-[14px] leading-7 text-nc-text-secondary">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button variant="primary" className="self-start" onClick={() => openStep(step)}>
                    {step.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="border-t border-nc-border bg-nc-bg p-5 xl:border-l xl:border-t-0">
                  <div className="overflow-hidden rounded-[18px] border border-nc-border bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                    <img src={step.image} alt={step.title} className="h-full w-full object-cover" />
                  </div>
                </div>
              </div>
            </Surface>
          );
        })}
      </div>
    </PageShell>
  );
}
