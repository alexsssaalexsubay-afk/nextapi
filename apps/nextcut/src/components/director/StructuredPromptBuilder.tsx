import { memo, useCallback } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore, type StructuredPrompt } from "@/stores/director-store";
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

export const StructuredPromptBuilder = memo(function StructuredPromptBuilder({
  disabled,
}: {
  disabled?: boolean;
}) {
  const { structuredPrompt, setStructuredPrompt, setPrompt } = useDirectorStore();
  const { lang } = useI18nStore();

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

  const insertPreset = useCallback((field: keyof StructuredPrompt, preset: string) => {
    const current = structuredPrompt[field];
    const value = current ? `${current}, ${preset.toLowerCase()}` : preset;
    setStructuredPrompt({ [field]: value });
  }, [structuredPrompt, setStructuredPrompt]);

  return (
    <div className="flex flex-col gap-6">
      {FIELDS.map((field) => (
        <div key={field.key} className="relative rounded-[16px] border border-nc-border bg-nc-surface p-6 shadow-sm transition-all hover:shadow-md hover:border-nc-accent">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-nc-bg text-nc-text-secondary border border-nc-border">
                {field.key === "subject" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>}
                {field.key === "action" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>}
                {field.key === "camera" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>}
                {field.key === "style" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>}
                {field.key === "constraints" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>}
              </div>
              <label className="text-[16px] font-semibold text-nc-text flex items-center gap-2">
                {lang === "zh" ? field.labelZh : field.label}
                <span className="text-[12px] font-medium text-nc-text-tertiary">
                  {lang === "zh" ? field.label : field.labelZh}
                </span>
              </label>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[12px] font-mono text-nc-text-tertiary">0/300</span>
              <button className="flex items-center gap-1.5 text-[13px] font-semibold text-nc-accent hover:text-nc-accent-hover transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                AI 补全
              </button>
            </div>
          </div>
          <textarea
            value={structuredPrompt[field.key]}
            onChange={(e) => setStructuredPrompt({ [field.key]: e.target.value })}
            placeholder={field.placeholder}
            rows={field.rows}
            disabled={disabled}
            className={cn(
              "w-full min-h-[80px] resize-none rounded-[12px] bg-nc-bg p-[16px] text-[14px] leading-[22px] text-nc-text border border-transparent",
              "placeholder:text-nc-text-tertiary outline-none transition-all duration-200",
              "focus:border-nc-accent focus:bg-white focus:ring-1 focus:ring-nc-accent/20 focus:shadow-[0_0_0_2px_rgba(109,94,248,0.1)]",
              "disabled:opacity-40"
            )}
          />
          {/* Preset chips */}
          {field.presets && (
            <div className="mt-4 flex flex-wrap gap-2.5 px-1">
              {field.presets.slice(0, 8).map((preset) => (
                <button
                  key={preset}
                  onClick={() => insertPreset(field.key, preset)}
                  disabled={disabled}
                  className="rounded-[999px] bg-nc-bg px-[12px] py-[6px] text-[13px] font-medium text-nc-text-secondary transition-all hover:bg-[#F5F3FF] hover:text-nc-accent disabled:opacity-40 border border-transparent hover:border-nc-accent/20"
                >
                  {preset}
                </button>
              ))}
              {field.presets.length > 8 && (
                <button className="rounded-[999px] bg-nc-bg px-[12px] py-[6px] text-[13px] font-medium text-nc-text-secondary transition-all hover:bg-[#F5F3FF] hover:text-nc-accent">
                  更多 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline ml-1"><path d="M6 9l6 6 6-6"/></svg>
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Seedance tips */}
      <div className="rounded-[16px] border border-nc-border bg-nc-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-[16px] font-semibold text-nc-text">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-nc-accent">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
          Seedance 2.0 提示
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-nc-text-tertiary"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-nc-text mb-1">
              <span className="text-nc-accent">✨</span> 使用 SVO 句子结构
            </div>
            <div className="text-[12px] text-nc-text-secondary">主语 + 谓语 + 宾语，描述更清晰</div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-nc-text mb-1">
              <span className="text-nc-accent">🎯</span> 每个镜头聚焦一个动作
            </div>
            <div className="text-[12px] text-nc-text-secondary">避免多个动作叠加，效果更稳定</div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-nc-text mb-1">
              <span className="text-nc-accent">💡</span> 物理描述越具体越好
            </div>
            <div className="text-[12px] text-nc-text-secondary">光线、材质、环境会影响真实感</div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-nc-text mb-1">
              <span className="text-nc-accent">🖼️</span> 参考图决定 70%+ 效果
            </div>
            <div className="text-[12px] text-nc-text-secondary">上传参考图可显著提升一致性</div>
          </div>
        </div>
      </div>

      {/* Action bar (Floating style) */}
      <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row items-center justify-between rounded-[20px] border border-nc-border bg-nc-surface/90 backdrop-blur-xl p-4 shadow-md mx-auto w-full">
        <div className="flex items-center gap-4 w-full sm:w-auto mb-4 sm:mb-0">
          <span className="text-[14px] font-semibold text-nc-text whitespace-nowrap">提示词预览</span>
          <div className="text-[14px] text-nc-text-secondary truncate max-w-md">
            {compileToText()}
          </div>
          <span className="text-[12px] font-mono text-nc-text-tertiary ml-auto">68/1200</span>
          <button className="text-nc-text-tertiary hover:text-nc-text transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={compileToText}
            className="flex flex-1 sm:flex-none h-[40px] items-center justify-center gap-2 rounded-[12px] border border-nc-border bg-white px-5 text-[14px] font-medium text-nc-text-secondary transition-colors hover:bg-nc-surface hover:text-nc-text shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            保存草稿
          </button>
          <button
            onClick={compileToText}
            className="flex flex-1 sm:flex-none h-[44px] items-center justify-center gap-2 rounded-[12px] bg-nc-accent px-6 text-[14px] font-semibold text-white transition-colors hover:bg-nc-accent-hover shadow-sm active:bg-[#4E42CC]"
          >
            <span className="text-[16px]">✨</span>
            生成镜头
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-1"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
      </div>
    </div>
  );
});
