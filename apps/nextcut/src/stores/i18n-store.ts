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
