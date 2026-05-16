import { memo, useCallback, useMemo } from "react";
import {
  AudioLines,
  Camera,
  Clapperboard,
  Copy,
  FileText,
  Lightbulb,
  Move3D,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";
import { Button, FieldLabel, IconFrame, Pill, SectionTitle, Surface } from "@/components/ui/kit";
import { cn } from "@/lib/cn";
import { CAMERA_MOVEMENTS, LIGHTING_STYLES, OPTICS_AND_LENSES } from "@/lib/prompt-dictionary";
import { useDirectorStore, type StructuredPrompt } from "@/stores/director-store";

const STYLE_PRESETS = [
  "production-grade SaaS commercial",
  "cinematic realistic, restrained color grade",
  "documentary natural, handheld intimacy",
  "premium product film, clean reflections",
  "social short video, strong first-frame hook",
  "soft lifestyle, warm natural light",
];

const CONSTRAINT_PRESETS = [
  "one clear action per shot",
  "stable identity and wardrobe",
  "no text overlays or watermarks",
  "avoid sudden scene changes",
  "keep product shape consistent",
  "preserve scene geography",
];

const AUDIO_PRESETS = [
  "clean ambience with soft transition accents",
  "steady pulse that rises toward the ending",
  "dialogue only when face is visible",
  "final beat leaves 0.5s breathing room",
];

const FIELD_GROUPS: Array<{
  key: keyof StructuredPrompt;
  label: string;
  eyebrow: string;
  placeholder: string;
  icon: typeof Target;
  tone: "accent" | "info" | "success" | "warning" | "neutral";
  rows?: number;
  presets?: string[];
}> = [
  {
    key: "subject",
    label: "主体锁定",
    eyebrow: "Subject",
    placeholder: "人物、产品或场景主角。写清楚可见特征，但不要堆形容词。",
    icon: Target,
    tone: "accent",
    rows: 2,
  },
  {
    key: "action",
    label: "动作事件",
    eyebrow: "Action",
    placeholder: "主体正在做的一件事。优先使用 SVO：主体 + 动作 + 对象。",
    icon: Sparkles,
    tone: "info",
    rows: 2,
  },
  {
    key: "scene",
    label: "场景语境",
    eyebrow: "Scene",
    placeholder: "空间、时间、气氛和上下文，让镜头知道发生在哪里。",
    icon: Clapperboard,
    tone: "neutral",
    rows: 2,
  },
  {
    key: "camera",
    label: "镜头语言",
    eyebrow: "镜头",
    placeholder: "机位、景别、镜头焦段，例如 close-up, 35mm, shallow depth of field。",
    icon: Camera,
    tone: "success",
    presets: OPTICS_AND_LENSES.slice(0, 5).map((item) => item.value),
  },
  {
    key: "motion",
    label: "运镜方式",
    eyebrow: "运动",
    placeholder: "镜头运动和主体运动如何配合。运动强度要可生成。",
    icon: Move3D,
    tone: "accent",
    presets: [
      ...CAMERA_MOVEMENTS.basic.slice(0, 2),
      ...CAMERA_MOVEMENTS.advanced.slice(0, 4),
      ...CAMERA_MOVEMENTS.dynamic.slice(0, 2),
    ].map((item) => item.value),
  },
  {
    key: "style",
    label: "视觉风格",
    eyebrow: "风格",
    placeholder: "画面质感、色彩、产品气质。保持专业、克制、现代。",
    icon: WandSparkles,
    tone: "info",
    presets: STYLE_PRESETS,
  },
  {
    key: "lighting",
    label: "光线质感",
    eyebrow: "光线",
    placeholder: "主光、环境光、反射、高光与阴影关系。",
    icon: Lightbulb,
    tone: "warning",
    presets: [
      ...LIGHTING_STYLES.environmental.slice(0, 3),
      ...LIGHTING_STYLES.cinematic_setups.slice(0, 3),
      ...LIGHTING_STYLES.stylized.slice(0, 2),
    ].map((item) => item.value),
  },
  {
    key: "constraints",
    label: "生成约束",
    eyebrow: "约束",
    placeholder: "明确不要发生什么，避免漂移、文字、水印、身份变化。",
    icon: FileText,
    tone: "neutral",
    presets: CONSTRAINT_PRESETS,
  },
  {
    key: "audio",
    label: "声音节奏",
    eyebrow: "声音",
    placeholder: "音乐、对白、音效和剪辑节奏，只写会影响画面的关键声音。",
    icon: AudioLines,
    tone: "success",
    presets: AUDIO_PRESETS,
  },
];

function compileStructuredPrompt(structuredPrompt: StructuredPrompt) {
  const segments = [
    structuredPrompt.subject && `Subject: ${structuredPrompt.subject.trim()}`,
    structuredPrompt.action && `Action: ${structuredPrompt.action.trim()}`,
    structuredPrompt.scene && `Scene: ${structuredPrompt.scene.trim()}`,
    structuredPrompt.camera && `Camera: ${structuredPrompt.camera.trim()}`,
    structuredPrompt.motion && `Motion: ${structuredPrompt.motion.trim()}`,
    structuredPrompt.style && `Style: ${structuredPrompt.style.trim()}`,
    structuredPrompt.lighting && `Lighting: ${structuredPrompt.lighting.trim()}`,
    structuredPrompt.audio && `Audio: ${structuredPrompt.audio.trim()}`,
    structuredPrompt.constraints && `Constraints: ${structuredPrompt.constraints.trim()}`,
  ].filter(Boolean);

  return segments.join(". ");
}

export const StructuredPromptBuilder = memo(function StructuredPromptBuilder({
  disabled,
}: {
  disabled?: boolean;
}) {
  const {
    structuredPrompt,
    setStructuredPrompt,
    setPrompt,
    useStructuredPrompt,
    setUseStructuredPrompt,
  } = useDirectorStore();

  const compiledPrompt = useMemo(() => compileStructuredPrompt(structuredPrompt), [structuredPrompt]);
  const filledCount = useMemo(
    () => FIELD_GROUPS.filter((field) => structuredPrompt[field.key]?.trim()).length,
    [structuredPrompt]
  );

  const insertPreset = useCallback((field: keyof StructuredPrompt, preset: string) => {
    const current = structuredPrompt[field]?.trim();
    setStructuredPrompt({ [field]: current ? `${current}, ${preset}` : preset });
  }, [structuredPrompt, setStructuredPrompt]);

  const applyCompiledPrompt = useCallback(() => {
    if (!compiledPrompt) return;
    setPrompt(compiledPrompt);
    setUseStructuredPrompt(true);
  }, [compiledPrompt, setPrompt, setUseStructuredPrompt]);

  return (
    <Surface className="overflow-hidden rounded-[20px]">
      <div className="flex items-start justify-between gap-5 border-b border-nc-border px-6 py-5">
        <SectionTitle
          title="提示词拆解"
          subtitle="把创意拆成可执行的主体、动作、场景、运镜、参考约束和声音节奏。"
        />
        <div className="flex shrink-0 items-center gap-2">
          <Pill tone={useStructuredPrompt ? "accent" : "neutral"}>
            {useStructuredPrompt ? "已接管主提示词" : `${filledCount}/${FIELD_GROUPS.length} 已填写`}
          </Pill>
          <Button size="sm" variant="primary" onClick={applyCompiledPrompt} disabled={disabled || !compiledPrompt}>
            <WandSparkles className="h-4 w-4" />
            应用到创意
          </Button>
        </div>
      </div>

      <div className="grid gap-5 p-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          {FIELD_GROUPS.map((field) => {
            const Icon = field.icon;
            const active = Boolean(structuredPrompt[field.key]?.trim());
            return (
              <div
                key={field.key}
                className={cn(
                  "rounded-[18px] border bg-white p-5 shadow-sm transition-all duration-200",
                  active ? "border-nc-accent/28 bg-[#FBFAFF]" : "border-nc-border hover:border-nc-accent/28"
                )}
              >
                <div className="mb-4 flex items-start gap-3">
                  <IconFrame tone={field.tone} className="h-10 w-10 rounded-[12px]">
                    <Icon className="h-5 w-5" />
                  </IconFrame>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-semibold leading-6 text-nc-text">{field.label}</h3>
                      <span className="text-[12px] font-semibold uppercase leading-4 tracking-[0.08em] text-nc-text-tertiary">
                        {field.eyebrow}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-nc-text-secondary">{field.placeholder}</p>
                  </div>
                </div>
                <FieldLabel label={field.label} className="gap-2">
                  <textarea
                    value={structuredPrompt[field.key] || ""}
                    onChange={(event) => setStructuredPrompt({ [field.key]: event.target.value })}
                    disabled={disabled}
                    rows={field.rows || 1}
                    className="min-h-[48px] w-full resize-none rounded-[14px] border border-nc-border bg-white px-4 py-3 text-[14px] leading-6 text-nc-text shadow-sm outline-none transition focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10 disabled:opacity-45"
                  />
                </FieldLabel>
                {field.presets && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {field.presets.slice(0, 6).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => insertPreset(field.key, preset)}
                        disabled={disabled}
                        className="min-h-8 rounded-[999px] border border-nc-border bg-nc-bg px-3 py-1.5 text-[12px] font-semibold leading-4 text-nc-text-secondary transition hover:border-nc-accent/35 hover:bg-[#F5F3FF] hover:text-nc-accent disabled:opacity-45"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sticky top-5 self-start rounded-[18px] border border-nc-border bg-nc-bg p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[16px] font-semibold leading-6 text-nc-text">可生成提示词</h3>
              <p className="mt-1 text-[13px] leading-5 text-nc-text-secondary">只在点击应用时写入主创意，不再在渲染中偷偷改状态。</p>
            </div>
            <Button
              size="icon"
              variant="secondary"
              aria-label="复制提示词"
              title="复制提示词"
              onClick={() => {
                void navigator.clipboard?.writeText(compiledPrompt);
              }}
              disabled={!compiledPrompt}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-[260px] rounded-[16px] border border-nc-border bg-white p-5 text-[14px] leading-7 text-nc-text-secondary shadow-sm">
            {compiledPrompt || "拆解主体、动作、场景和镜头后，这里会形成可直接送进导演链的提示词。"}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["分镜", "分镜会继承动作与场景"],
              ["参考素材", "参考图优先于文字外观"],
              ["镜头语言", "运镜和主体动作分离"],
              ["提示词复核", "约束进入质检清单"],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-[14px] border border-nc-border bg-white p-4">
                <div className="text-[13px] font-semibold leading-5 text-nc-text">{title}</div>
                <div className="mt-1 text-[12px] leading-5 text-nc-text-tertiary">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Surface>
  );
});
