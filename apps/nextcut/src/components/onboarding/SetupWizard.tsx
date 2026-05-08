import { useState, useEffect, useCallback } from "react";
import { ArrowRight, CheckCircle2, Clapperboard, Film, Sparkles, WandSparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSetupStore, SetupStatus } from "@/stores/setup-store";
import { sidecarFetch } from "@/lib/sidecar";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "detect", label: "System" },
  { id: "keys", label: "Configure" },
  { id: "ready", label: "Ready" },
];

export function SetupWizard() {
  const { wizardStep, setWizardStep, setSetupComplete, setupStatus, setSetupStatus, savedKeys, setSavedKeys } =
    useSetupStore();
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localKeys, setLocalKeys] = useState(savedKeys);

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

  const canFinish = setupStatus?.ready || (setupStatus?.api_keys.nextapi && (setupStatus.api_keys.openai || setupStatus.ollama.available));

  if (wizardStep === 0) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-[#F7F8FC]">
        <WelcomeStep onNext={() => setWizardStep(1)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-nc-bg">
      <div className="w-full max-w-[560px] px-6">
        {/* Step indicator — minimal dots */}
        <div className="mb-10 flex items-center justify-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold",
                  i < wizardStep
                    ? "bg-nc-accent text-nc-bg"
                    : i === wizardStep
                    ? "border border-nc-accent text-nc-accent"
                    : "border border-nc-border text-nc-text-ghost"
                )}
              >
                {i < wizardStep ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1.5,5.5 3.8,7.8 8.5,2.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("h-px w-6", i < wizardStep ? "bg-nc-accent/50" : "bg-nc-border")} />
              )}
            </div>
          ))}
        </div>

        {wizardStep === 1 && (
          <DetectStep status={setupStatus} detecting={detecting} onRetry={runDetection} onNext={() => setWizardStep(2)} />
        )}
        {wizardStep === 2 && (
          <KeysStep
            keys={localKeys}
            onChange={setLocalKeys}
            status={setupStatus}
            saving={saving}
            onSave={handleSaveKeys}
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
            <div className="text-[12px] font-medium leading-5 text-nc-text-tertiary">AI Video Studio</div>
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

function DetectStep({
  status,
  detecting,
  onRetry,
  onNext,
}: {
  status: SetupStatus | null;
  detecting: boolean;
  onRetry: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h2 className="mb-1 text-[18px] font-semibold text-nc-text">System Check</h2>
      <p className="mb-2 text-[12px] text-nc-text-tertiary">Detecting your environment...</p>
      <p className="mb-6 text-[11px] leading-relaxed text-nc-text-ghost">
        Pulled a new Ollama model? Run <span className="font-mono text-[10px]">ollama pull …</span> then tap{" "}
        <span className="text-nc-text-secondary">Re-scan</span> — no restart required.
      </p>

      {detecting && (
        <div className="mb-6 flex items-center gap-3 text-[12px] text-nc-text-tertiary">
          <div className="h-3.5 w-3.5 animate-[spin_1.5s_linear_infinite] rounded-full border-[1.5px] border-nc-accent border-t-transparent" />
          Scanning...
        </div>
      )}

      {status && !detecting && (
        <div className="mb-6 space-y-2">
          <DetectRow label="System" value={`${status.system.os} ${status.system.arch}`} ok />
          <DetectRow label="CPU / RAM" value={`${status.system.cpu_count} cores / ${status.system.ram_gb} GB`} ok />
          <DetectRow
            label="GPU"
            value={status.system.gpu_name || "Not detected"}
            ok={!!status.system.gpu_backend}
            hint={status.system.gpu_backend ? status.system.gpu_backend.toUpperCase() : "Optional"}
          />
          <DetectRow
            label="Local LLM"
            value={status.ollama.available ? `Ollama (${status.ollama.models.length} models)` : "Not detected"}
            ok={status.ollama.available}
            hint={status.ollama.available ? status.ollama.recommended_model : "Optional"}
          />
          <DetectRow
            label="ComfyUI"
            value={status.comfyui.available ? "Connected" : "Not detected"}
            ok={status.comfyui.available}
            hint="Optional"
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[var(--radius-md)] border border-nc-border px-4 py-2 text-[12px] text-nc-text-tertiary hover:border-nc-border-strong hover:text-nc-text-secondary"
        >
          Re-scan
        </button>
        <button onClick={onNext} className="rounded-[var(--radius-md)] bg-nc-accent px-6 py-2 text-[13px] font-semibold text-nc-bg hover:bg-nc-accent-hover">
          Next
        </button>
      </div>
    </div>
  );
}

function DetectRow({ label, value, ok, hint }: { label: string; value: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-nc-border bg-nc-surface px-4 py-3">
      <div className={cn("h-[6px] w-[6px] shrink-0 rounded-full", ok ? "bg-nc-success" : "bg-nc-text-ghost/30")} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-nc-text">{label}</div>
        <div className="truncate text-[10px] text-nc-text-tertiary">{value}</div>
      </div>
      {hint && <div className="shrink-0 text-[9px] text-nc-text-ghost">{hint}</div>}
    </div>
  );
}

function KeysStep({
  keys,
  onChange,
  status,
  saving,
  onSave,
  onNext,
}: {
  keys: { nextapi_key: string; openai_key: string; openai_base_url: string; openai_model: string };
  onChange: (k: typeof keys) => void;
  status: SetupStatus | null;
  saving: boolean;
  onSave: () => void;
  onNext: () => void;
}) {
  const hasOllama = status?.ollama.available && (status.ollama.models.length > 0);
  return (
    <div>
      <h2 className="mb-1 text-[18px] font-semibold text-nc-text">Configure</h2>
      <p className="mb-2 text-[12px] text-nc-text-tertiary">
        Keys stay on this device. NextAPI video uses the same key as the dashboard API (
        <span className="font-mono text-[10px]">sk_live_…</span> / <span className="font-mono text-[10px]">sk_test_…</span>
        ).
      </p>
      <p className="mb-6 text-[11px] text-nc-text-ghost">
        LLM: OpenAI-compatible key + optional base URL (DeepSeek, Qwen, local gateways). Ollama alone is fine for planning if detected.
      </p>

      <div className="mb-6 space-y-5">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-nc-accent">
            NextAPI Key
          </label>
          <input
            type="password"
            value={keys.nextapi_key}
            onChange={(e) => onChange({ ...keys, nextapi_key: e.target.value })}
            placeholder="sk_live_…"
            className="w-full rounded-[var(--radius-md)] border border-nc-border bg-nc-panel px-3 py-2.5 text-[13px] text-nc-text placeholder:text-nc-text-ghost focus:border-nc-accent/40 focus:outline-none focus:ring-1 focus:ring-nc-accent/10"
          />
          <div className="mt-1.5 text-[10px] text-nc-text-ghost">
            From <span className="text-nc-accent">app.nextapi.top</span> — same token as{" "}
            <span className="font-mono">Authorization: Bearer</span> on{" "}
            <span className="font-mono">api.nextapi.top/v1</span>.
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-nc-border bg-nc-surface p-4">
          <div className="mb-3 text-[12px] font-medium text-nc-text">
            Language Model
            {hasOllama && <span className="ml-2 text-nc-success">(Ollama detected)</span>}
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={keys.openai_key}
              onChange={(e) => onChange({ ...keys, openai_key: e.target.value })}
              placeholder="API key (OpenAI / DeepSeek / Qwen)"
              className="w-full rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel px-3 py-2 text-[12px] text-nc-text placeholder:text-nc-text-ghost focus:border-nc-accent/40 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={keys.openai_base_url}
                onChange={(e) => onChange({ ...keys, openai_base_url: e.target.value })}
                placeholder="Base URL (optional)"
                className="w-full rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel px-3 py-2 text-[12px] text-nc-text placeholder:text-nc-text-ghost focus:border-nc-accent/40 focus:outline-none"
              />
              <input
                type="text"
                value={keys.openai_model}
                onChange={(e) => onChange({ ...keys, openai_model: e.target.value })}
                placeholder="Model (gpt-4o)"
                className="w-full rounded-[var(--radius-sm)] border border-nc-border bg-nc-panel px-3 py-2 text-[12px] text-nc-text placeholder:text-nc-text-ghost focus:border-nc-accent/40 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-[var(--radius-md)] border border-nc-accent/40 px-4 py-2 text-[12px] font-semibold text-nc-accent hover:bg-nc-accent-muted disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save & Verify"}
        </button>
        <button onClick={onNext} className="rounded-[var(--radius-md)] bg-nc-accent px-6 py-2 text-[13px] font-semibold text-nc-bg hover:bg-nc-accent-hover">
          Next
        </button>
      </div>
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
    <div>
      <h2 className="mb-2 text-[20px] font-semibold text-nc-text">
        {canFinish ? "Ready to create" : "Almost there"}
      </h2>

      {canFinish ? (
        <div className="mb-8">
          <p className="mb-5 text-[13px] text-nc-text-tertiary">
            Your studio is configured. Start by describing a scene.
          </p>
          <div className="space-y-2 rounded-[var(--radius-md)] border border-nc-border bg-nc-surface p-4">
            <StatusRow label="Video" value="Seedance 2.0" ok />
            <StatusRow
              label="LLM"
              value={status?.api_keys.openai ? "OpenAI API" : status?.ollama.available ? `Ollama (${status.ollama.recommended_model})` : "Configured"}
              ok
            />
            {status?.comfyui.available && <StatusRow label="ComfyUI" value="Connected" ok />}
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <p className="mb-4 text-[13px] text-nc-text-tertiary">
            You need a NextAPI key for video generation and an LLM source.
          </p>
          {status?.recommendations.map((r, i) => (
            <div key={i} className="mb-1.5 text-[12px] text-nc-accent">{r}</div>
          ))}
        </div>
      )}

      <button
        onClick={onFinish}
        className={cn(
          "rounded-[var(--radius-md)] px-7 py-2.5 text-[13px] font-semibold",
          canFinish
            ? "bg-nc-accent text-nc-bg hover:bg-nc-accent-hover shadow-lg shadow-nc-accent/10"
            : "border border-nc-border text-nc-text-tertiary hover:bg-nc-panel-hover"
        )}
      >
        {canFinish ? "Start Creating" : "Skip for now"}
      </button>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px]">
      <span className={cn("h-[5px] w-[5px] rounded-full", ok ? "bg-nc-success" : "bg-nc-text-ghost/30")} />
      <span className="text-nc-text-tertiary">{label}:</span>
      <span className="text-nc-text-secondary">{value}</span>
    </div>
  );
}
