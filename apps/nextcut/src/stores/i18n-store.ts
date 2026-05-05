import { create } from "zustand";

export type Language = "en" | "zh";

// Simple fallback translations to avoid missing keys
const translations: Record<Language, Record<string, string>> = {
  en: {
    "nav.create": "Create",
    "nav.projects": "Projects",
    "nav.director": "Director",
    "nav.library": "Library",
    "nav.templates": "Templates",
    "nav.edit": "Edit",
    "nav.settings": "Settings",
    "nav.workspace": "Workspace",
    
    // HomePage
    "home.hero.poweredBy": "Powered by Seedance 2.0",
    "home.hero.title1": "Describe it. Direct it.",
    "home.hero.title2": "Render it.",
    "home.hero.subtitle": "Choose your path: go fast with a single sentence, or take precise control over every shot.",
    "home.hero.wizard": "New to video AI? Start with the Guided Wizard",
    
    "home.quick.title": "Quick Path",
    "home.quick.subtitle": "One sentence → auto everything → preview",
    "home.quick.placeholder": "Describe your video idea in one sentence or a full brief...",
    "home.quick.generate": "Generate Now",
    "home.quick.processing": "Processing...",
    "home.quick.example": "Example",
    
    "home.precise.title": "Precise Director Mode",
    "home.precise.subtitle": "Structured prompt → edit each step → full control",
    "home.precise.step1.title": "Script",
    "home.precise.step1.desc": "AI writes screenplay, you edit scenes & characters",
    "home.precise.step2.title": "Storyboard",
    "home.precise.step2.desc": "Visual shotlist, drag to reorder, split/merge",
    "home.precise.step3.title": "Prompts",
    "home.precise.step3.desc": "Fine-tune each shot: Subject → Action → Camera → Style",
    "home.precise.step4.title": "Generate",
    "home.precise.step4.desc": "Render with Seedance 2.0, review quality scores",
    "home.precise.step5.title": "Assemble",
    "home.precise.step5.desc": "Edit timeline, export final video",
    "home.precise.btn": "Open Director Studio",
    
    "home.templates.title": "Start from a Template",
    "home.templates.viewAll": "View all templates →",
    "home.templates.shots": "shots",
    
    "home.tips.title": "Seedance 2.0 Best Practices",
    "home.tips.tip1.title": "Keep clips short",
    "home.tips.tip1.desc": "Individual clips under 10 seconds produce the best visual quality.",
    "home.tips.tip2.title": "Reference > Prompt",
    "home.tips.tip2.desc": "Reference images determine 70%+ of output. Invest in good references.",
    "home.tips.tip3.title": "One change per shot",
    "home.tips.tip3.desc": "Change only one variable (action OR camera) per shot for consistency."
  },
  zh: {
    "nav.create": "创建",
    "nav.projects": "项目",
    "nav.director": "AI 导演",
    "nav.library": "素材库",
    "nav.templates": "模板",
    "nav.edit": "编辑视频",
    "nav.settings": "设置",
    "nav.workspace": "无限画布 / 工作台",
    
    // HomePage
    "home.hero.poweredBy": "由 Seedance 2.0 驱动",
    "home.hero.title1": "描述它。导演它。",
    "home.hero.title2": "渲染它。",
    "home.hero.subtitle": "选择你的路径：用一句话快速生成，或者精准控制每一个镜头。",
    "home.hero.wizard": "AI 视频新手？从向导开始",
    
    "home.quick.title": "快速生成",
    "home.quick.subtitle": "一句话 → 自动规划一切 → 预览",
    "home.quick.placeholder": "用一句话或完整的策划案描述你的视频想法...",
    "home.quick.generate": "立即生成",
    "home.quick.processing": "处理中...",
    "home.quick.example": "示例",
    
    "home.precise.title": "专业导演模式",
    "home.precise.subtitle": "结构化提示词 → 编辑每一步 → 完全控制",
    "home.precise.step1.title": "剧本",
    "home.precise.step1.desc": "AI 编写剧本，你可以编辑场景和角色",
    "home.precise.step2.title": "分镜",
    "home.precise.step2.desc": "可视化镜头列表，拖拽排序，拆分/合并",
    "home.precise.step3.title": "提示词",
    "home.precise.step3.desc": "精调每个镜头：主体 → 动作 → 运镜 → 风格",
    "home.precise.step4.title": "生成",
    "home.precise.step4.desc": "使用 Seedance 2.0 渲染，查看质量评分",
    "home.precise.step5.title": "组装",
    "home.precise.step5.desc": "编辑时间线，导出最终视频",
    "home.precise.btn": "打开导演工作室",
    
    "home.templates.title": "从模板开始",
    "home.templates.viewAll": "查看所有模板 →",
    "home.templates.shots": "个镜头",
    
    "home.tips.title": "Seedance 2.0 最佳实践",
    "home.tips.tip1.title": "控制单段时长",
    "home.tips.tip1.desc": "单段素材控制在 10 秒以内，视觉质量最佳。",
    "home.tips.tip2.title": "参考图大于提示词",
    "home.tips.tip2.desc": "参考图决定了 70% 以上的画面效果，请提供优质参考图。",
    "home.tips.tip3.title": "每次只改变一个变量",
    "home.tips.tip3.desc": "为了保持连贯性，每个镜头请只改变一个变量（动作或运镜）。"
  }
};

interface I18nState {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

export const useI18nStore = create<I18nState>((set, get) => ({
  lang: "zh", // Default to Chinese as user complained in Chinese
  setLang: (lang) => {
    set({ lang });
    // Save to localStorage if possible
    if (typeof window !== "undefined") {
      localStorage.setItem("nextcut-lang", lang);
    }
  },
  t: (key) => {
    const { lang } = get();
    return translations[lang][key] || key;
  },
}));

// Initialize from localStorage
if (typeof window !== "undefined") {
  const stored = localStorage.getItem("nextcut-lang") as Language;
  if (stored && (stored === "en" || stored === "zh")) {
    useI18nStore.getState().setLang(stored);
  }
}
