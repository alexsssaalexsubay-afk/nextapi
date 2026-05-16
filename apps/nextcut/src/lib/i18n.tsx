import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Locale = "en" | "zh";

const translations = {
  en: {
    sidebar: {
      create: "Create",
      projects: "Projects",
      director: "Director",
      library: "Library",
      templates: "Templates",
      edit: "Edit",
      settings: "Settings",
    },
    canvas: {
      pipeline: "Workflow",
      storyboard: "Shot board",
      split: "Split",
    },
    director: {
      title: "AI Video Director",
      description: "Describe your vision and NextAPI Studio will break it down into a polished shot plan.",
    },
    // Add more as needed
  },
  zh: {
    sidebar: {
      create: "创作",
      projects: "项目",
      director: "导演台",
      library: "媒体库",
      templates: "模板",
      edit: "视频剪辑",
      settings: "设置",
    },
    canvas: {
      pipeline: "无限画布",
      storyboard: "分镜板",
      split: "分屏视图",
    },
    director: {
      title: "AI 视频导演",
      description: "描述您的愿景，AI 剧组将为您拆解为专业的分镜脚本。",
    },
  },
};

type I18nContextType = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh"); // Default to Chinese as user prefers it

  useEffect(() => {
    const saved = localStorage.getItem("nextcut_locale");
    if (saved === "en" || saved === "zh") {
      setLocaleState(saved);
    } else {
      const browserLang = navigator.language.startsWith("zh") ? "zh" : "en";
      setLocaleState(browserLang);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("nextcut_locale", l);
  };

  const t = (key: string) => {
    const parts = key.split(".");
    let current: any = translations[locale];
    for (const p of parts) {
      if (current[p] === undefined) return key;
      current = current[p];
    }
    return current as string;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
