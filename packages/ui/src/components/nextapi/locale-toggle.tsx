"use client"

import { useI18n, useTranslations } from "@/lib/i18n/context"
import { locales, localeFlags, type Locale } from "@/lib/i18n/config"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Globe } from "lucide-react"

export function LocaleToggle() {
  const { locale, setLocale } = useI18n()
  const t = useTranslations()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
        >
          <Globe className="size-4" />
          <span className="sr-only">{t.locale.switch}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        {locales.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => setLocale(l as Locale)}
            className={locale === l ? "bg-accent" : ""}
          >
            <span className="mr-2 font-mono text-[11px] text-muted-foreground">
              {localeFlags[l as Locale]}
            </span>
            {l === "en" ? t.locale.english : t.locale.chinese}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
