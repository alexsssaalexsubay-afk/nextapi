"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { locales, defaultLocale, type Locale } from "./config"
import { en } from "./messages/en"
import { zh } from "./messages/zh"
import type { Messages } from "./messages/en"

const messages: Record<Locale, Messages> = { en, zh }

type I18nContextType = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Messages
}

const I18nContext = createContext<I18nContextType | null>(null)

const STORAGE_KEY = "nextapi-locale"

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale

  // Check localStorage first
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && locales.includes(stored as Locale)) {
    return stored as Locale
  }

  // Check browser language
  const browserLang = navigator.language.split("-")[0]
  if (locales.includes(browserLang as Locale)) {
    return browserLang as Locale
  }

  return defaultLocale
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setLocaleState(getInitialLocale())
    setMounted(true)
  }, [])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem(STORAGE_KEY, newLocale)
    document.documentElement.lang = newLocale
  }, [])

  // Update html lang attribute
  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = locale
    }
  }, [locale, mounted])

  const value: I18nContextType = {
    locale,
    setLocale,
    t: messages[locale],
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider")
  }
  return context
}

export function useTranslations() {
  return useI18n().t
}
