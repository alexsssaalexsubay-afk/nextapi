import { useState, useEffect, useCallback } from "react";
import { Activity, AlertCircle, ArrowRight, CheckCircle2, Clapperboard, Cpu, ExternalLink, Film, FolderPlus, HardDrive, KeyRound, PlayCircle, RefreshCw, Server, Settings2, ShieldCheck, Sparkles, TerminalSquare, WalletCards, WandSparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSetupStore, SetupStatus } from "@/stores/setup-store";
import { sidecarFetch } from "@/lib/sidecar";
import { openExternalUrl } from "@/lib/open-external";

const STEPS = [
  { id: "welcome", label: "Welcome", labelZh: "欢迎" },
  { id: "detect", label: "System", labelZh: "体检" },
  { id: "keys", label: "Configure", labelZh: "配置" },
  { id: "ready", label: "Ready", labelZh: "就绪" },
];

export function SetupWizard() {
  const { wizardStep, setWizardStep, setSetupComplete, setupStatus, setSetupStatus, savedKeys, setSavedKeys } =
    useSetupStore();
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localKeys, setLocalKeys] = useState(savedKeys);
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "warning" | "info"; text: string } | null>(null);

  const runDetection = useCallback(async () => {
    setDetecting(true);
    try {
      const status = await sidecarFetch<SetupStatus>("/setup/detect");
      setSetupStatus(status);
    } catch {
      /* sidecar not ready yet */
    }
    setDetecting(false);
  }, [setSetupStatus]);

  useEffect(() => {
    if (wizardStep === 1) {
      runDetection();
    }
  }, [wizardStep, runDetection]);

  const handleSaveKeys = async () => {
    setSaving(true);
    try {
      await sidecarFetch("/setup/keys", {
        method: "POST",
        body: JSON.stringify({
          nextapi_key: localKeys.nextapi_key,
          openai_key: localKeys.openai_key,
          openai_base_url: localKeys.openai_base_url,
          openai_model: localKeys.openai_model,
        }),
      });
      setSavedKeys(localKeys);
      await runDetection();
    } catch {
      /* ignore */
    }
    setSaving(false);
  };

  const runSetupAction = async (action: string, payload: Record<string, string> = {}) => {
    setActionMessage({ tone: "info", text: "正在执行配置动作..." });
    try {
      const res = await sidecarFetch<{ status: string; message: string; url?: string }>("/setup/actions", {
        method: "POST",
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.url) {
        await openExternalUrl(res.url);
      }
      setActionMessage({ tone: res.status === "error" ? "warning" : "success", text: res.message });
      await runDetection();
    } catch {
      setActionMessage({ tone: "warning", text: "配置动作失败，请确认 sidecar 已启动。" });
    }
  };

  const prepareLocalFactory = async () => {
    setActionMessage({ tone: "info", text: "正在准备本地目录与默认端点..." });
    try {
      await sidecarFetch("/setup/actions", {
        method: "POST",
        body: JSON.stringify({ action: "prepare_local_factory" }),
      });
      setActionMessage({ tone: "success", text: "本地导出目录、视频/生图模型目录、默认端点和 FFmpeg 检测已准备好。" });
      await runDetection();
    } catch {
      setActionMessage({ tone: "warning", text: "自动准备失败，请重新检查 sidecar。" });
    }
  };

  const canFinish = setupStatus?.ready || (setupStatus?.api_keys.nextapi && (setupStatus.api_keys.openai || setupStatus.ollama.available));

  if (wizardStep === 0) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-[#F7F8FC]">
        <WelcomeStep onNext={() => setWizardStep(1)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-nc-bg">
      <div className={cn("mx-auto min-h-full w-full px-6 py-8", wizardStep === 1 ? "max-w-[1240px]" : "max-w-[1040px]")}>
        <div className="mb-8 flex justify-center">
          <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[22px] border border-nc-border bg-white/82 p-1.5 shadow-[0_14px_42px_rgba(15,23,42,0.08)] backdrop-blur">
            {STEPS.map((step, i) => {
              const done = i < wizardStep;
              const current = i === wizardStep;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex min-h-10 min-w-[118px] items-center gap-2 rounded-[16px] px-3 transition",
                    done && "bg-nc-success/10 text-nc-success",
                    current && "bg-[#F5F3FF] text-nc-accent shadow-sm",
                    !done && !current && "text-nc-text-tertiary"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                      done ? "bg-nc-success text-white" : current ? "bg-nc-accent text-white" : "bg-nc-bg text-nc-text-tertiary"
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold leading-4">{step.labelZh}</span>
                    <span className="block text-[12px] font-semibold leading-5 opacity-70">{step.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {wizardStep === 1 && (
          <DetectStep
            status={setupStatus}
            detecting={detecting}
            actionMessage={actionMessage}
            onRetry={runDetection}
            onAction={runSetupAction}
            onAutoPrepare={prepareLocalFactory}
            onNext={() => setWizardStep(2)}
          />
        )}
        {wizardStep === 2 && (
          <KeysStep
            keys={localKeys}
            onChange={setLocalKeys}
            status={setupStatus}
            saving={saving}
            onSave={handleSaveKeys}
            actionMessage={actionMessage}
            onAction={runSetupAction}
            onNext={() => setWizardStep(3)}
          />
        )}
        {wizardStep === 3 && (
          <ReadyStep status={setupStatus} canFinish={!!canFinish} onFinish={() => setSetupComplete(true)} />
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(108,77,255,0.10),transparent_34%),linear-gradient(180deg,#FFFFFF_0%,#F7F8FC_68%,#F2F5FA_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[56%] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(247,248,252,0))]" />

      <header className="relative z-10 flex h-20 shrink-0 items-center justify-between px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-nc-accent text-white shadow-[0_14px_34px_rgba(108,77,255,0.24)]">
            <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.2 4.4c0-1.1 1.2-1.8 2.2-1.2l10.2 6.5c.9.6.9 2 0 2.6L9.4 18.8c-1 .6-2.2-.1-2.2-1.2V4.4Z" />
            </svg>
          </div>
          <div>
            <div className="text-[20px] font-bold leading-6 text-nc-text">NextCut</div>
            <div className="text-[12px] font-medium leading-5 text-nc-text-tertiary">视频创作工作台</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-nc-border bg-white/70 px-3.5 py-2 text-[12px] font-semibold leading-4 text-nc-text-secondary shadow-sm backdrop-blur md:flex">
          <CheckCircle2 className="h-4 w-4 text-nc-success" />
          本地配置，密钥留在设备
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-8 pb-8">
        <section className="relative mt-1 flex w-full max-w-[1180px] flex-1 flex-col items-center">
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
            <div className="pointer-events-none absolute left-1/2 top-[48%] h-[34%] w-[64%] -translate-x-1/2 rounded-[999px] bg-[radial-gradient(ellipse,rgba(108,77,255,0.18),transparent_70%)] blur-3xl" />
            <img
              src="/onboarding/welcome-hero.png"
              alt="NextCut AI 视频创作工作台预览"
              className="relative max-h-[52vh] w-full max-w-[1060px] object-contain mix-blend-multiply drop-shadow-[0_38px_80px_rgba(15,23,42,0.14)]"
              style={{
                WebkitMaskImage: "radial-gradient(ellipse at center, #000 58%, rgba(0,0,0,0.84) 72%, transparent 92%)",
                maskImage: "radial-gradient(ellipse at center, #000 58%, rgba(0,0,0,0.84) 72%, transparent 92%)",
              }}
            />
          </div>

          <div className="mt-[-8px] flex max-w-[860px] flex-col items-center text-center">
            <div className="mb-5 inline-flex min-h-9 items-center gap-2 rounded-full border border-nc-border bg-white/78 px-4 py-2 text-[13px] font-semibold leading-5 text-nc-accent shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4" />
              NextCut 创意工作流，从第一镜开始就有专业感
            </div>
            <h1 className="max-w-[840px] text-[48px] font-bold leading-[1.08] tracking-[-0.01em] text-nc-text">
              欢迎来到 NextCut
            </h1>
            <p className="mt-5 max-w-[720px] text-[17px] leading-8 text-nc-text-secondary">
              用 AI 导演把一句创意变成分镜、参考图、镜头语言、时间线和可生成的视频生产链路。
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={onNext}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-nc-accent px-6 text-[15px] font-semibold leading-5 text-white shadow-[0_18px_44px_rgba(108,77,255,0.30)] transition-all hover:-translate-y-0.5 hover:bg-nc-accent-hover hover:shadow-[0_22px_54px_rgba(108,77,255,0.34)]"
              >
                开始配置
                <ArrowRight className="h-4 w-4" />
              </button>
              <div className="inline-flex min-h-12 items-center gap-2 rounded-[14px] border border-nc-border bg-white/82 px-5 text-[14px] font-semibold leading-5 text-nc-text-secondary shadow-sm backdrop-blur">
                <WandSparkles className="h-4 w-4 text-nc-accent" />
                约 1 分钟完成
              </div>
            </div>

            <div className="mt-7 grid w-full max-w-[760px] grid-cols-1 gap-3 sm:grid-cols-3">
              <WelcomeCapability icon={<Clapperboard className="h-4 w-4" />} title="分镜规划" description="自动拆镜头与首尾帧" />
              <WelcomeCapability icon={<Film className="h-4 w-4" />} title="视频生产" description="参考、提示词、预检串联" />
              <WelcomeCapability icon={<Sparkles className="h-4 w-4" />} title="Storyflow" description="画布、时间线、质检联动" />
            </div>
          </div>

          <div className="mt-7 flex items-center gap-2">
            {[0, 1, 2, 3].map((step) => (
              <span
                key={step}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  step === 0 ? "w-8 bg-nc-accent" : "w-1.5 bg-nc-border-strong"
                )}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function WelcomeCapability({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="nc-card-safe rounded-[18px] border border-white/70 bg-white/70 px-4 py-3.5 text-left shadow-[0_12px_34px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-nc-accent/15 bg-[#F5F3FF] text-nc-accent">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold leading-5 text-nc-text">{title}</span>
          <span className="mt-0.5 block truncate text-[12px] leading-5 text-nc-text-tertiary">{description}</span>
        </span>
      </div>
    </div>
  );
}

function SetupVisualHero({
  image,
  eyebrow,
  title,
  subtitle,
  status,
  actions,
}: {
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  status: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[30px] border border-nc-border bg-white shadow-[0_26px_90px_rgba(15,23,42,0.08)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(108,77,255,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(247,248,252,0.72))]" />
      <div className="relative grid min-h-[270px] gap-5 p-5 lg:grid-cols-[minmax(0,0.98fr)_minmax(420px,1.15fr)] lg:p-6">
        <div className="flex min-w-0 flex-col justify-center px-2 py-4 lg:px-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-8 items-center rounded-full border border-nc-accent/20 bg-[#F5F3FF] px-3 text-[12px] font-bold uppercase tracking-[0.12em] text-nc-accent">
              {eyebrow}
            </span>
            <span className="inline-flex min-h-8 items-center rounded-full border border-nc-border bg-white/80 px-3 text-[12px] font-semibold text-nc-text-secondary">
              {status}
            </span>
          </div>
          <h2 className="nc-text-safe text-[34px] font-bold leading-[1.12] tracking-[-0.01em] text-nc-text lg:text-[42px]">
            {title}
          </h2>
          <p className="nc-text-safe mt-4 max-w-[560px] text-[15px] leading-7 text-nc-text-secondary">
            {subtitle}
          </p>
          {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
        </div>
        <div className="relative min-h-[210px] overflow-hidden rounded-[24px] border border-white/70 bg-white/55 shadow-[0_18px_54px_rgba(15,23,42,0.08)]">
          <img
            src={image}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.18),transparent_42%),linear-gradient(180deg,transparent_62%,rgba(255,255,255,0.24))]" />
        </div>
      </div>
    </section>
  );
}

function SetupHeroButton({
  children,
  icon,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] px-4 text-[14px] font-semibold leading-5 shadow-sm transition-all hover:-translate-y-0.5",
        variant === "primary"
          ? "bg-nc-accent text-white shadow-[0_14px_34px_rgba(108,77,255,0.26)] hover:bg-nc-accent-hover"
          : "border border-nc-border bg-white text-nc-text-secondary hover:border-nc-border-strong hover:text-nc-text"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ActionNotice({ tone, text }: { tone: "success" | "warning" | "info"; text: string }) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-[16px] border px-4 py-3 text-[13px] font-semibold leading-5 shadow-sm",
        tone === "success" && "border-nc-success/25 bg-nc-success/10 text-nc-success",
        tone === "warning" && "border-nc-warning/25 bg-nc-warning/10 text-nc-warning",
        tone === "info" && "border-nc-info/25 bg-nc-info/10 text-nc-info"
      )}
    >
      {tone === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
      <span className="nc-text-safe">{text}</span>
    </div>
  );
}

function DetectStep({
  status,
  detecting,
  actionMessage,
  onRetry,
  onAction,
  onAutoPrepare,
  onNext,
}: {
  status: SetupStatus | null;
  detecting: boolean;
  actionMessage: { tone: "success" | "warning" | "info"; text: string } | null;
  onRetry: () => void;
  onAction: (action: string, payload?: Record<string, string>) => void;
  onAutoPrepare: () => void;
  onNext: () => void;
}) {
  const blockers = status?.issues.filter((issue) => ["ffmpeg_unavailable", "exports_dir_not_writable", "no_video_api"].includes(issue)).length || 0;
  const warnings = status?.issues.filter((issue) => !["ffmpeg_unavailable", "exports_dir_not_writable", "no_video_api"].includes(issue)).length || 0;
  const productionLines = status?.production_lines || [];
  const readyLines = productionLines.filter((line) => line.ready).length;
  const imageLineReady = Boolean(productionLines.some((line) => line.ready && line.modalities.some((modality) => ["image", "storyboard_keyframe", "character_assets", "workflow"].includes(modality))));
  const allCoreReady = Boolean(status?.runtime.sidecar && status?.runtime.ffmpeg && status?.runtime.exports_writable);
  const repairItems = [
    {
      title: "FFmpeg 剪辑引擎",
      description: status?.runtime.ffmpeg ? `${status.runtime.ffmpeg_source || "system"} FFmpeg 已可用` : "缺少 FFmpeg，本地剪辑、拼接和导出会被阻断。",
      ok: Boolean(status?.runtime.ffmpeg),
      cta: status?.runtime.ffmpeg ? "重新检测" : "一键修复",
      icon: <Film className="h-4 w-4" />,
      onClick: status?.runtime.ffmpeg ? onRetry : () => onAction("prepare_ffmpeg"),
    },
    {
      title: "导出目录",
      description: status?.runtime.exports_writable ? status.runtime.exports_dir || "exports 目录可写" : "本地生成目录不可写，无法保存成片和中间资产。",
      ok: Boolean(status?.runtime.exports_writable),
      cta: "准备目录",
      icon: <FolderPlus className="h-4 w-4" />,
      onClick: () => onAction("prepare_exports"),
    },
    {
      title: "生图 / 垫图线路",
      description: imageLineReady ? "分镜图、角色资产、首尾帧线路已可用。" : "准备 ComfyUI、RunningHub 默认端点与图片模型目录。",
      ok: imageLineReady,
      soft: true,
      cta: imageLineReady ? "刷新检测" : "一键准备",
      icon: <WandSparkles className="h-4 w-4" />,
      onClick: imageLineReady ? onRetry : () => onAction("prepare_image_pipeline"),
    },
  ];

  return (
    <div className="space-y-5">
      <SetupVisualHero
        image="/onboarding/setup-detect-hero.png"
        eyebrow="启动体检"
        title="启动前体检本地视频工厂"
        subtitle="先把剪辑引擎、导出目录、模型线路和扣费账户讲清楚。能自动修复的直接修复，需要用户 Key 的明确标注，不再让你猜哪里断了。"
        status={status?.ready ? "全部就绪" : allCoreReady ? "核心可运行" : "有阻断项"}
        actions={(
          <>
            <SetupHeroButton onClick={onAutoPrepare} icon={<FolderPlus className="h-4 w-4" />}>一键准备环境</SetupHeroButton>
            <SetupHeroButton variant="secondary" onClick={onRetry} icon={<RefreshCw className={cn("h-4 w-4", detecting && "animate-spin")} />}>重新检查</SetupHeroButton>
          </>
        )}
      />

      {actionMessage && <ActionNotice tone={actionMessage.tone} text={actionMessage.text} />}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="rounded-[28px] border border-nc-border bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex min-h-8 items-center gap-2 rounded-full border border-nc-accent/20 bg-[#F5F3FF] px-3 text-[12px] font-bold text-nc-accent">
                <Activity className="h-4 w-4" />
                生产线路
              </div>
              <h3 className="mt-3 text-[24px] font-bold leading-8 text-nc-text">生产线路总览</h3>
              <p className="mt-1 max-w-[720px] text-[14px] leading-6 text-nc-text-secondary">
                这些线路决定任务在哪里跑、是否扣团队点数，以及缺什么资源。用户一眼要知道：本机跑、自己 Key 跑，还是 NextAPI 托管跑。
              </p>
            </div>
            <div className="flex min-w-[190px] items-center gap-3 rounded-[18px] border border-nc-border bg-nc-bg px-4 py-3">
              <div className={cn("flex h-11 w-11 items-center justify-center rounded-[15px]", allCoreReady ? "bg-nc-success/10 text-nc-success" : "bg-nc-error/10 text-nc-error")}>
                {allCoreReady ? <ShieldCheck className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              </div>
              <div>
                <div className="text-[20px] font-bold leading-6 text-nc-text">{readyLines}/{productionLines.length || 0}</div>
                <div className="text-[12px] font-semibold leading-5 text-nc-text-tertiary">线路可用</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <RuntimeRouteCard
              icon={<Clapperboard className="h-5 w-5" />}
              title="NextAPI 托管视频"
              status={status?.api_keys.nextapi ? "可用" : "待配置"}
              ok={!!status?.api_keys.nextapi}
              description="Seedance/托管视频生成走团队账户，提交前显示余额与预计消耗。"
              billing="扣团队点数"
              actionLabel={status?.api_keys.nextapi ? "查看 Key" : "获取 Key"}
              onAction={() => onAction("open_nextapi_key")}
            />
            <RuntimeRouteCard
              icon={<WandSparkles className="h-5 w-5" />}
              title="生图与垫图"
              status={imageLineReady ? "可用" : "待准备"}
              ok={imageLineReady}
              description={imageLineReady ? "角色图、分镜图、首尾帧线路已经接入生产链。" : "可准备 ComfyUI/RunningHub 默认端点和本地图片目录。"}
              billing="用户 Key / 本地资源"
              actionLabel={imageLineReady ? "刷新检测" : "一键准备"}
              onAction={imageLineReady ? onRetry : () => onAction("prepare_image_pipeline")}
            />
            <RuntimeRouteCard
              icon={<TerminalSquare className="h-5 w-5" />}
              title="本地 LLM / OpenAI 兼容"
              status={status?.ollama.available || status?.api_keys.openai ? "可用" : "可选"}
              ok={!!(status?.ollama.available || status?.api_keys.openai)}
              soft
              description="AI 导演、提示词优化和预检可以走用户自己的本地模型或 OpenAI-compatible 服务。"
              billing="不扣团队点数"
              actionLabel="套用默认端点"
              onAction={() => onAction("apply_default_routes")}
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-nc-border bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[20px] font-bold leading-7 text-nc-text">阻断项</h3>
              <p className="text-[13px] leading-6 text-nc-text-secondary">先修这些，开箱体验才不会断。</p>
            </div>
            <div className={cn("rounded-full px-3 py-1.5 text-[12px] font-bold", blockers ? "bg-nc-error/10 text-nc-error" : "bg-nc-success/10 text-nc-success")}>
              {blockers ? `${blockers} 项阻断` : "无阻断"}
            </div>
          </div>
          <div className="space-y-3">
            {repairItems.map((item) => (
              <RepairCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[28px] border border-nc-border bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-nc-accent/10 text-nc-accent">
                <Activity className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[20px] font-bold leading-7 text-nc-text">本机环境检查</div>
                <div className="text-[13px] leading-6 text-nc-text-secondary">Sidecar、CPU、GPU、FFmpeg、导出目录与模型连接</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-nc-border bg-white px-4 text-[13px] font-bold text-nc-text-secondary shadow-sm transition hover:-translate-y-0.5 hover:border-nc-border-strong hover:text-nc-text"
            >
              <RefreshCw className={cn("h-4 w-4", detecting && "animate-spin")} />
              重新检查
            </button>
          </div>

          {detecting && (
            <div className="mb-4 overflow-hidden rounded-[18px] border border-nc-accent/20 bg-[#F5F3FF] p-4 text-nc-accent">
              <div className="mb-3 flex items-center gap-3 text-[14px] font-bold">
                <div className="h-4 w-4 animate-[spin_1.2s_linear_infinite] rounded-full border-2 border-nc-accent border-t-transparent" />
                正在扫描本机运行环境...
              </div>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className="h-2 flex-1 animate-pulse rounded-full bg-nc-accent/25" style={{ animationDelay: `${i * 90}ms` }} />
                ))}
              </div>
            </div>
          )}

          {status && !detecting && (
            <div className="grid gap-3 md:grid-cols-2">
              <DetectRow icon={<Server className="h-4 w-4" />} label="Sidecar" value="NextCut local engine" ok={status.runtime.sidecar} hint="内置" />
              <DetectRow icon={<Cpu className="h-4 w-4" />} label="CPU / RAM" value={`${status.system.cpu_count} cores / ${status.system.ram_gb} GB`} ok />
              <DetectRow icon={<TerminalSquare className="h-4 w-4" />} label="FFmpeg" value={status.runtime.ffmpeg ? status.runtime.ffmpeg_path : "Not available"} ok={status.runtime.ffmpeg} hint={status.runtime.ffmpeg_source || "Required"} />
              <DetectRow icon={<HardDrive className="h-4 w-4" />} label="Exports" value={status.runtime.exports_dir || "exports"} ok={status.runtime.exports_writable} hint="Required" />
              <DetectRow icon={<Cpu className="h-4 w-4" />} label="GPU" value={status.system.gpu_name || "Not detected"} ok={!!status.system.gpu_backend} hint={status.system.gpu_backend ? status.system.gpu_backend.toUpperCase() : "Optional"} />
              <DetectRow icon={<KeyRound className="h-4 w-4" />} label="NextAPI Key" value={status.api_keys.nextapi ? "Configured" : "Not configured"} ok={status.api_keys.nextapi} hint="Video" />
              <DetectRow icon={<TerminalSquare className="h-4 w-4" />} label="Local LLM" value={status.ollama.available ? `Ollama (${status.ollama.models.length} models)` : "Not detected"} ok={status.ollama.available} hint={status.ollama.available ? status.ollama.recommended_model : "Optional"} />
              <DetectRow icon={<Server className="h-4 w-4" />} label="ComfyUI" value={status.comfyui.available ? "Connected" : "Not detected"} ok={status.comfyui.available} hint="Optional" />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-1">
            <RuntimeMetric label="阻断项" value={blockers} tone={blockers ? "danger" : "success"} />
            <RuntimeMetric label="注意项" value={warnings} tone={warnings ? "warning" : "success"} />
            <RuntimeMetric label="核心生产" value={allCoreReady ? "可运行" : "待修复"} tone={allCoreReady ? "success" : "danger"} />
          </div>
          <div className="rounded-[22px] border border-nc-border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[15px] font-bold text-nc-text">
              <WalletCards className="h-4 w-4 text-nc-accent" />
              扣费提醒
            </div>
            <div className="space-y-2">
              <ProductionLineMini label="NextAPI 托管视频" ready={!!status?.api_keys.nextapi} billing="team_credits" />
              <ProductionLineMini label="本地模型 / 用户 Key" ready={!!(status?.ollama.available || status?.api_keys.openai)} billing="user_provider_key" />
              <ProductionLineMini label="本地剪辑导出" ready={!!status?.runtime.ffmpeg} billing="local_resource" />
            </div>
          </div>
          <div className="rounded-[22px] border border-nc-border bg-white p-4 shadow-sm">
            <div className="mb-3 text-[15px] font-bold text-nc-text">建议</div>
            <ul className="space-y-2 text-[13px] leading-6 text-nc-text-secondary">
              {(status?.recommendations.length ? status.recommendations : ["先完成 FFmpeg、导出目录和模型 Key 配置。"]).slice(0, 4).map((item) => (
                <li key={item} className="rounded-[14px] bg-nc-bg px-3 py-2">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-3 rounded-[20px] border border-nc-border bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-nc-border px-4 py-2 text-[13px] font-semibold text-nc-text-secondary hover:border-nc-border-strong hover:text-nc-text"
        >
          <RefreshCw className={cn("h-4 w-4", detecting && "animate-spin")} />
          重新检查
        </button>
        <button onClick={onNext} className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-nc-accent px-6 py-2 text-[13px] font-semibold text-white shadow-[0_14px_34px_rgba(108,77,255,0.26)] hover:bg-nc-accent-hover">
          继续配置 Key
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function DetectRow({ icon, label, value, ok, hint }: { icon?: React.ReactNode; label: string; value: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[18px] border border-nc-border bg-white px-4 py-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]", ok ? "bg-nc-success/10 text-nc-success" : "bg-nc-error/10 text-nc-error")}>
        {icon || <div className={cn("h-[6px] w-[6px] rounded-full", ok ? "bg-nc-success" : "bg-nc-text-ghost/30")} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold leading-5 text-nc-text">{label}</div>
        <div className="truncate text-[12px] leading-5 text-nc-text-tertiary">{value}</div>
      </div>
      {hint && <div className="shrink-0 rounded-full bg-nc-bg px-2.5 py-1 text-[12px] font-bold text-nc-text-tertiary">{hint}</div>}
    </div>
  );
}

function RuntimeMetric({ label, value, tone }: { label: string; value: string | number; tone: "success" | "warning" | "danger" }) {
  return (
    <div className="min-w-[96px] rounded-[18px] border border-nc-border bg-white px-4 py-3 shadow-sm">
      <div className="text-[12px] font-bold leading-5 text-nc-text-tertiary">{label}</div>
      <div className={cn("mt-1 text-[22px] font-bold leading-7", tone === "success" ? "text-nc-success" : tone === "warning" ? "text-nc-warning" : "text-nc-error")}>{value}</div>
    </div>
  );
}

function RuntimeRouteCard({
  icon,
  title,
  status,
  description,
  ok,
  soft = false,
  billing,
  actionLabel,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  status: string;
  description: string;
  ok: boolean;
  soft?: boolean;
  billing?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={cn("flex min-h-[220px] flex-col rounded-[22px] border bg-white p-5 shadow-[0_14px_38px_rgba(15,23,42,0.055)] transition hover:-translate-y-1 hover:shadow-[0_20px_54px_rgba(15,23,42,0.10)]", ok ? "border-nc-border" : soft ? "border-nc-warning/24" : "border-nc-error/20")}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]", ok ? "bg-nc-success/10 text-nc-success" : soft ? "bg-nc-warning/10 text-nc-warning" : "bg-nc-accent/10 text-nc-accent")}>
          {icon || <Sparkles className="h-5 w-5" />}
        </span>
        <span className={cn("rounded-full px-3 py-1 text-[12px] font-bold", ok ? "bg-nc-success/10 text-nc-success" : soft ? "bg-nc-warning/10 text-nc-warning" : "bg-nc-error/10 text-nc-error")}>
          {status}
        </span>
      </div>
      <div className="text-[16px] font-bold leading-6 text-nc-text">{title}</div>
      <p className="nc-text-safe mt-2 line-clamp-3 text-[13px] leading-6 text-nc-text-secondary">{description}</p>
      {billing && <div className="mt-3 inline-flex w-fit rounded-full bg-nc-bg px-3 py-1 text-[12px] font-bold text-nc-text-tertiary">{billing}</div>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-auto inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-nc-border bg-nc-panel px-3 text-[13px] font-bold text-nc-text-secondary transition hover:border-nc-accent/30 hover:bg-[#F5F3FF] hover:text-nc-accent"
        >
          {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function RepairCard({
  title,
  description,
  ok,
  soft = false,
  cta,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  ok: boolean;
  soft?: boolean;
  cta: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div className={cn("rounded-[20px] border p-4", ok ? "border-nc-border bg-white" : soft ? "border-nc-warning/25 bg-nc-warning/5" : "border-nc-error/20 bg-nc-error/5")}>
      <div className="mb-3 flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]", ok ? "bg-nc-success/10 text-nc-success" : soft ? "bg-nc-warning/10 text-nc-warning" : "bg-nc-error/10 text-nc-error")}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold leading-5 text-nc-text">{title}</div>
          <p className="nc-text-safe mt-1 line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={cn("inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[12px] px-3 text-[13px] font-bold transition hover:-translate-y-0.5", ok ? "border border-nc-border bg-white text-nc-text-secondary hover:border-nc-border-strong" : "bg-nc-accent text-white shadow-[0_12px_30px_rgba(108,77,255,0.22)] hover:bg-nc-accent-hover")}
      >
        {ok ? <RefreshCw className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
        {cta}
      </button>
    </div>
  );
}

function ProductionLineMini({ label, ready, billing }: { label: string; ready: boolean; billing: string }) {
  const billingLabel = billing === "team_credits" ? "扣团队点数" : billing === "local_resource" ? "本地资源" : billing === "user_provider_key" ? "用户 Key" : "不扣团队点数";
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-[15px] border border-nc-border bg-white px-3.5 py-3 shadow-sm">
      <div className="min-w-0">
        <div className="line-clamp-1 text-[13px] font-bold leading-5 text-nc-text">{label}</div>
        <div className="line-clamp-1 text-[12px] leading-5 text-nc-text-tertiary">{billingLabel}</div>
      </div>
      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold", ready ? "bg-nc-success/10 text-nc-success" : "bg-nc-warning/10 text-nc-warning")}>
        {ready ? "可用" : "待配"}
      </span>
    </div>
  );
}

function KeysStep({
  keys,
  onChange,
  status,
  saving,
  onSave,
  actionMessage,
  onAction,
  onNext,
}: {
  keys: { nextapi_key: string; openai_key: string; openai_base_url: string; openai_model: string };
  onChange: (k: typeof keys) => void;
  status: SetupStatus | null;
  saving: boolean;
  onSave: () => void;
  actionMessage: { tone: "success" | "warning" | "info"; text: string } | null;
  onAction: (action: string, payload?: Record<string, string>) => void;
  onNext: () => void;
}) {
  const hasOllama = status?.ollama.available && (status.ollama.models.length > 0);
  return (
    <div className="space-y-5">
      <SetupVisualHero
        image="/onboarding/setup-config-hero.png"
        eyebrow="Provider Setup"
        title="配置 Key 与生产线路"
        subtitle="NextAPI 托管视频扣团队点数；本地 OpenAI-compatible、Ollama、ComfyUI 和 RunningHub 使用用户自己的资源或 Key。"
        status={hasOllama ? "检测到本地 LLM" : "可混合云端/本地"}
        actions={(
          <>
            <SetupHeroButton onClick={() => onAction("open_nextapi_key")} icon={<ExternalLink className="h-4 w-4" />}>获取 NextAPI Key</SetupHeroButton>
            <SetupHeroButton variant="secondary" onClick={() => onAction("apply_default_routes")} icon={<Settings2 className="h-4 w-4" />}>套用默认端点</SetupHeroButton>
          </>
        )}
      />

      {actionMessage && <ActionNotice tone={actionMessage.tone} text={actionMessage.text} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div className="rounded-[24px] border border-nc-border bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-bold leading-8 text-nc-text">必要配置</h2>
              <p className="mt-1 text-[14px] leading-6 text-nc-text-secondary">密钥只保存在本机运行时；模型和端点可以后续在设置页继续改。</p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-full border border-nc-accent/20 bg-[#F5F3FF] px-3 text-[12px] font-bold text-nc-accent">
              本地保存
            </span>
          </div>

          <div className="grid gap-5">
            <label className="block">
              <span className="mb-2 block text-[13px] font-bold leading-5 text-nc-text">NextAPI Key</span>
              <input
                type="password"
                value={keys.nextapi_key}
                onChange={(e) => onChange({ ...keys, nextapi_key: e.target.value })}
                placeholder="sk_live_..."
                className="min-h-12 w-full rounded-[14px] border border-nc-border bg-white px-4 text-[14px] leading-6 text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
              />
              <span className="mt-2 block text-[12px] leading-5 text-nc-text-tertiary">
                用于 NextAPI 托管视频生成和团队扣点。也可以先跳过，只用本地/自带 Key 线路做规划。
              </span>
            </label>

            <div className="rounded-[18px] border border-nc-border bg-nc-bg/70 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[15px] font-bold leading-6 text-nc-text">语言模型</div>
                  <div className="text-[12px] leading-5 text-nc-text-tertiary">用于 AI 导演、分镜拆解、提示词优化和预检。</div>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-[12px] font-bold", hasOllama ? "bg-nc-success/10 text-nc-success" : "bg-nc-info/10 text-nc-info")}>
                  {hasOllama ? "Ollama 可用" : "OpenAI-compatible"}
                </span>
              </div>

              <div className="grid gap-3">
                <input
                  type="password"
                  value={keys.openai_key}
                  onChange={(e) => onChange({ ...keys, openai_key: e.target.value })}
                  placeholder="API key (OpenAI / DeepSeek / Qwen / local gateway)"
                  className="min-h-11 w-full rounded-[13px] border border-nc-border bg-white px-4 text-[13px] leading-6 text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    value={keys.openai_base_url}
                    onChange={(e) => onChange({ ...keys, openai_base_url: e.target.value })}
                    placeholder="Base URL (可选，例如 http://localhost:8000/v1)"
                    className="min-h-11 w-full rounded-[13px] border border-nc-border bg-white px-4 text-[13px] leading-6 text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                  />
                  <input
                    type="text"
                    value={keys.openai_model}
                    onChange={(e) => onChange({ ...keys, openai_model: e.target.value })}
                    placeholder="gpt-4o / deepseek-chat / qwen-plus"
                    className="min-h-11 w-full rounded-[13px] border border-nc-border bg-white px-4 text-[13px] leading-6 text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-nc-border pt-5">
            <button
              onClick={onSave}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] border border-nc-accent/35 bg-white px-5 text-[14px] font-bold text-nc-accent shadow-sm hover:bg-[#F5F3FF] disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {saving ? "保存中..." : "保存并验证"}
            </button>
            <button onClick={onNext} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] bg-nc-accent px-6 text-[14px] font-bold text-white shadow-[0_14px_34px_rgba(108,77,255,0.26)] hover:bg-nc-accent-hover">
              下一步
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <ConfigHint icon={<WalletCards className="h-4 w-4" />} title="团队扣点" description="NextAPI 托管视频统一扣团队余额，适合多人协作和后台用量管理。" />
          <ConfigHint icon={<Cpu className="h-4 w-4" />} title="本地资源" description="Ollama、ComfyUI、本地模型包消耗本机 CPU/GPU/磁盘，不扣团队点数。" />
          <ConfigHint icon={<KeyRound className="h-4 w-4" />} title="自带 Key" description="RunningHub、Custom HTTP 或 OpenAI-compatible 使用用户自己的上游 Key。" />
        </div>
      </div>
    </div>
  );
}

function ConfigHint({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-[18px] border border-nc-border bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.045)]">
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-nc-accent/15 bg-[#F5F3FF] text-nc-accent">
          {icon}
        </span>
        <div className="text-[14px] font-bold leading-6 text-nc-text">{title}</div>
      </div>
      <p className="text-[12px] leading-5 text-nc-text-secondary">{description}</p>
    </div>
  );
}

function ReadyStep({
  status,
  canFinish,
  onFinish,
}: {
  status: SetupStatus | null;
  canFinish: boolean;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-5">
      <SetupVisualHero
        image="/onboarding/setup-ready-hero.png"
        eyebrow="Ready"
        title={canFinish ? "可以开始创作了" : "还差一点配置"}
        subtitle={canFinish ? "工作台、AI 导演、素材链路和本地导出已经有基础运行条件。进入产品后仍可随时切换 provider 和模型。" : "你可以先进入产品探索界面；正式生成视频前，NextAPI Key 或本地视频线路仍需要配置完成。"}
        status={canFinish ? "生产链路可用" : "允许跳过"}
        actions={(
          <SetupHeroButton onClick={onFinish} icon={canFinish ? <PlayCircle className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}>
            {canFinish ? "进入 NextCut" : "先进入产品"}
          </SetupHeroButton>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <ReadyStatusCard label="视频生成" value={status?.api_keys.nextapi ? "NextAPI 已配置" : "待配置 / 可本地"} ok={!!status?.api_keys.nextapi} />
        <ReadyStatusCard
          label="AI 导演"
          value={status?.api_keys.openai ? "OpenAI-compatible" : status?.ollama.available ? `Ollama ${status.ollama.recommended_model || ""}` : "待配置"}
          ok={!!(status?.api_keys.openai || status?.ollama.available)}
        />
        <ReadyStatusCard label="本地导出" value={status?.runtime.ffmpeg ? `${status.runtime.ffmpeg_source || "system"} FFmpeg` : "FFmpeg 未通过"} ok={!!status?.runtime.ffmpeg} />
      </div>

      {!canFinish && !!status?.recommendations.length && (
        <div className="rounded-[20px] border border-nc-warning/20 bg-nc-warning/10 p-4">
          <div className="mb-2 text-[14px] font-bold text-nc-warning">建议先处理</div>
          <div className="grid gap-2">
            {status.recommendations.slice(0, 4).map((r) => (
              <div key={r} className="rounded-[12px] bg-white/70 px-3 py-2 text-[12px] leading-5 text-nc-text-secondary">{r}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadyStatusCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-[18px] border border-nc-border bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.045)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold leading-5 text-nc-text">{label}</span>
        <span className={cn("rounded-full px-3 py-1 text-[12px] font-bold", ok ? "bg-nc-success/10 text-nc-success" : "bg-nc-warning/10 text-nc-warning")}>
          {ok ? "可用" : "待配"}
        </span>
      </div>
      <div className="line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{value}</div>
    </div>
  );
}
