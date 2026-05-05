import { memo, useCallback } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore, type StructuredPrompt } from "@/stores/director-store";
import { sidecarFetch } from "@/lib/sidecar";
import { useI18nStore } from "@/stores/i18n-store";

const CAMERA_PRESETS = [
  "Wide establishing shot", "Medium shot", "Close-up", "Extreme close-up",
  "Over-the-shoulder", "Bird's eye view", "Low angle", "Dutch angle",
  "Tracking shot", "Dolly zoom", "Handheld", "Steadicam",
  "Crane shot", "POV shot", "Slow pan", "Whip pan",
];

const STYLE_PRESETS = [
  "Cinematic realistic", "Anime cel-shaded", "Film noir high contrast",
  "Dreamy soft focus", "Documentary natural", "Cyberpunk neon",
  "Vintage film grain", "Commercial clean", "Wuxia epic",
  "Minimal flat", "Music video stylized", "Social media vibrant",
];

const CONSTRAINT_PRESETS = [
  "No text or watermarks", "No sudden scene changes",
  "Maintain character appearance", "Keep lighting consistent",
  "Avoid fast camera shaking", "No morphing artifacts",
  "Keep background stable", "Maintain eye contact with camera",
];

const FIELDS: {
  key: keyof StructuredPrompt;
  label: string;
  labelZh: string;
  placeholder: string;
  presets?: string[];
  rows: number;
}[] = [
  {
    key: "subject",
    label: "Subject",
    labelZh: "主体",
    placeholder: "Who/what is in the shot? e.g. A young woman in a red dress, a golden retriever, a steaming coffee cup...",
    rows: 2,
  },
  {
    key: "action",
    label: "Action",
    labelZh: "动作",
    placeholder: "What happens? Use SVO: Subject + Verb + Object. e.g. walks through a bamboo forest, pours coffee slowly, turns to face the camera...",
    rows: 2,
  },
  {
    key: "camera",
    label: "Camera",
    labelZh: "镜头",
    placeholder: "Camera angle and movement. e.g. Slow tracking shot from left, close-up with shallow depth of field...",
    presets: CAMERA_PRESETS,
    rows: 1,
  },
  {
    key: "style",
    label: "Style",
    labelZh: "风格",
    placeholder: "Visual style and mood. e.g. Cinematic warm tones, dramatic lighting, 35mm film look...",
    presets: STYLE_PRESETS,
    rows: 1,
  },
  {
    key: "constraints",
    label: "Constraints",
    labelZh: "约束",
    placeholder: "What to avoid. e.g. No text overlays, maintain character appearance, avoid fast cuts...",
    presets: CONSTRAINT_PRESETS,
    rows: 1,
  },
];

interface PromptAction {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const PROMPT_ACTIONS: PromptAction[] = [
  {
    id: "simplify",
    label: "Simplify",
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M2 5h6" />
      </svg>
    ),
  },
  {
    id: "enhance",
    label: "Enhance",
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M5 2v6M2 5h6" />
      </svg>
    ),
  },
  {
    id: "translate",
    label: "中/En",
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M1 3h5M3.5 1v5M6 6l1.5 3 1.5-3" />
      </svg>
    ),
  },
];

export const StructuredPromptBuilder = memo(function StructuredPromptBuilder({
  disabled,
}: {
  disabled?: boolean;
}) {
  const { structuredPrompt, setStructuredPrompt, setPrompt } = useDirectorStore();
  const { t, lang } = useI18nStore();

  const compileToText = useCallback(() => {
    const parts: string[] = [];
    if (structuredPrompt.subject) parts.push(structuredPrompt.subject.trim());
    if (structuredPrompt.action) parts.push(structuredPrompt.action.trim());
    if (structuredPrompt.camera) parts.push(`Camera: ${structuredPrompt.camera.trim()}`);
    if (structuredPrompt.style) parts.push(`Style: ${structuredPrompt.style.trim()}`);
    if (structuredPrompt.constraints) parts.push(`Avoid: ${structuredPrompt.constraints.trim()}`);
    const compiled = parts.join(". ") + ".";
    setPrompt(compiled);
    return compiled;
  }, [structuredPrompt, setPrompt]);

  const handleAction = useCallback(async (actionId: string) => {
    const compiled = compileToText();
    try {
      const res = await sidecarFetch<{ result: string }>("/director/prompt/action", {
        method: "POST",
        body: JSON.stringify({ prompt: compiled, action: actionId }),
      });
      if (res.result) {
        setPrompt(res.result);
      }
    } catch {
      // fallback: just use compiled
    }
  }, [compileToText, setPrompt]);

  const insertPreset = useCallback((field: keyof StructuredPrompt, preset: string) => {
    const current = structuredPrompt[field];
    const value = current ? `${current}, ${preset.toLowerCase()}` : preset;
    setStructuredPrompt({ [field]: value });
  }, [structuredPrompt, setStructuredPrompt]);

  return (
    <div className="flex flex-col gap-3">
      {FIELDS.map((field) => (
        <div key={field.key}>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">
              {lang === "zh" ? field.labelZh : field.label}
              <span className="ml-1 font-normal normal-case tracking-normal text-nc-text-ghost">
                {lang === "zh" ? field.label : field.labelZh}
              </span>
            </label>
          </div>
          <textarea
            value={structuredPrompt[field.key]}
            onChange={(e) => setStructuredPrompt({ [field.key]: e.target.value })}
            placeholder={field.placeholder}
            rows={field.rows}
            disabled={disabled}
            className={cn(
              "w-full resize-none rounded-[var(--radius-md)] border border-nc-border bg-nc-panel px-3 py-2 text-[12px] leading-relaxed text-nc-text",
              "placeholder:text-nc-text-ghost/50 outline-none transition-all",
              "focus:border-nc-accent/40 focus:ring-1 focus:ring-nc-accent/10",
              "disabled:opacity-40"
            )}
          />
          {/* Preset chips */}
          {field.presets && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {field.presets.slice(0, 8).map((preset) => (
                <button
                  key={preset}
                  onClick={() => insertPreset(field.key, preset)}
                  disabled={disabled}
                  className="rounded-full border border-nc-border px-2 py-0.5 text-[9px] text-nc-text-ghost transition-colors hover:border-nc-border-strong hover:text-nc-text-tertiary disabled:opacity-40"
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Action bar */}
      <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-nc-border bg-nc-surface px-3 py-2">
        <div className="flex items-center gap-1.5">
          {PROMPT_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              disabled={disabled}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[9px] font-medium text-nc-text-ghost transition-colors hover:bg-nc-panel-hover hover:text-nc-text-tertiary disabled:opacity-40"
            >
              {action.icon}
              {action.id === "translate" ? action.label : t(`promptBuilder.${action.id}` as any)}
            </button>
          ))}
        </div>
        <button
          onClick={compileToText}
          className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-nc-accent/10 px-2.5 py-1 text-[9px] font-semibold text-nc-accent transition-colors hover:bg-nc-accent/20"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M2 8l2-6h2l2 6M2.5 6h5" />
          </svg>
          {t("promptBuilder.compile")}
        </button>
      </div>

      {/* Seedance tips */}
      <div className="rounded-[var(--radius-md)] border border-nc-accent/10 bg-nc-accent-muted p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-nc-accent">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 0l1.2 3.8H10l-3 2.2 1.2 3.8L5 7.6 1.8 9.8 3 6 0 3.8h3.8z" />
          </svg>
          {t("promptBuilder.tipsTitle")}
        </div>
        <ul className="flex flex-col gap-0.5 text-[9px] leading-relaxed text-nc-text-ghost">
          <li>{t("promptBuilder.tip1")}</li>
          <li>{t("promptBuilder.tip2")}</li>
          <li>{t("promptBuilder.tip3")}</li>
          <li>{t("promptBuilder.tip4")}</li>
          <li>{t("promptBuilder.tip5")}</li>
        </ul>
      </div>
    </div>
  );
});
