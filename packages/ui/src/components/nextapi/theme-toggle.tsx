"use client"

import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslations } from "@/lib/i18n/context"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const t = useTranslations()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
        >
          <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          <span className="sr-only">{t.theme.toggle}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="gap-2 text-[13px]"
        >
          <Sun className="size-3.5" />
          {t.theme.light}
          {theme === "light" && (
            <span className="ml-auto size-1.5 rounded-full bg-signal" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="gap-2 text-[13px]"
        >
          <Moon className="size-3.5" />
          {t.theme.dark}
          {theme === "dark" && (
            <span className="ml-auto size-1.5 rounded-full bg-signal" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="gap-2 text-[13px]"
        >
          <Monitor className="size-3.5" />
          {t.theme.system}
          {theme === "system" && (
            <span className="ml-auto size-1.5 rounded-full bg-signal" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
