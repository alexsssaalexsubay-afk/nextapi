"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowRight, Check, KeyRound, Play, UserCheck, Webhook as WebhookIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch } from "@/lib/api"

const ONBOARDING_DONE_KEY = "onboarding_done"

export function OnboardingChecklist() {
  const t = useTranslations()
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)
  const [steps, setSteps] = useState({
    accountCreated: true, // always true if Clerk session exists (page requires auth)
    hasApiKey: false,
    hasSucceededJob: false,
    hasWebhook: false,
  })

  // Check localStorage first — if already done, don't even show
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(ONBOARDING_DONE_KEY) === "1") {
      setVisible(false)
    }
  }, [])

  // Fetch real status from API
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    async function load() {
      const [keysRes, videosRes, webhooksRes] = await Promise.allSettled([
        apiFetch("/v1/me/keys"),
        apiFetch("/v1/videos?status=succeeded&limit=1"),
        apiFetch("/v1/webhooks"),
      ])
      if (cancelled) return

      const hasApiKey =
        keysRes.status === "fulfilled"
          ? (keysRes.value?.data ?? []).some(
              (k: { name: string }) => k.name !== "dashboard-session",
            )
          : false

      const hasSucceededJob =
        videosRes.status === "fulfilled"
          ? Array.isArray(videosRes.value?.data) && videosRes.value.data.length > 0
          : false

      const hasWebhook =
        webhooksRes.status === "fulfilled"
          ? Array.isArray(webhooksRes.value?.data) && webhooksRes.value.data.length > 0
          : false

      setSteps({ accountCreated: true, hasApiKey, hasSucceededJob, hasWebhook })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [visible])

  // Auto-dismiss when all steps are done
  useEffect(() => {
    if (steps.accountCreated && steps.hasApiKey && steps.hasSucceededJob && steps.hasWebhook) {
      if (typeof window !== "undefined") {
        localStorage.setItem(ONBOARDING_DONE_KEY, "1")
      }
      setFading(true)
      const t = setTimeout(() => setVisible(false), 600)
      return () => clearTimeout(t)
    }
  }, [steps])

  if (!visible) return null

  const dismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ONBOARDING_DONE_KEY, "1")
    }
    setFading(true)
    setTimeout(() => setVisible(false), 300)
  }

  const allSteps: {
    id: string
    done: boolean
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    cta: string
    href: string
  }[] = [
    {
      id: "account",
      done: steps.accountCreated,
      title: t.dashboard.onboarding.step1.title,
      description: t.dashboard.onboarding.step1.description,
      icon: UserCheck,
      cta: t.dashboard.onboarding.step1.action,
      href: "/",
    },
    {
      id: "api-key",
      done: steps.hasApiKey,
      title: t.dashboard.onboarding.step2.title,
      description: t.dashboard.onboarding.step2.description,
      icon: KeyRound,
      cta: t.dashboard.onboarding.step2.action,
      href: "/keys",
    },
    {
      id: "first-job",
      done: steps.hasSucceededJob,
      title: t.dashboard.onboarding.step3.title,
      description: t.dashboard.onboarding.step3.description,
      icon: Play,
      cta: t.dashboard.onboarding.step3.action,
      href: "/jobs/new",
    },
    {
      id: "webhook",
      done: steps.hasWebhook,
      title: t.dashboard.onboarding.step4.title,
      description: t.dashboard.onboarding.step4.description,
      icon: WebhookIcon,
      cta: t.dashboard.onboarding.step4.action,
      href: "/webhooks",
    },
  ]

  const doneCount = allSteps.filter((s) => s.done).length
  const pct = Math.round((doneCount / allSteps.length) * 100)

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card/40 transition-opacity duration-300",
        fading && "opacity-0",
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium tracking-tight text-foreground">
            {t.dashboard.onboarding.title}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {doneCount}/{allSteps.length} · {t.dashboard.onboarding.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-signal transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">{pct}%</span>
          <button
            onClick={dismiss}
            aria-label={t.dashboard.onboarding.dismiss}
            className="ml-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <ul className="divide-y divide-border/60">
        {allSteps.map((s) => {
          const Icon = s.icon
          return (
            <li key={s.id}>
              <div className="flex w-full items-center gap-4 px-5 py-4">
                <div
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    s.done
                      ? "border-status-success/40 bg-status-success/10 text-status-success"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {s.done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "text-[13.5px] font-medium",
                      s.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {s.title}
                  </span>
                  <div className="mt-0.5 text-[12.5px] text-muted-foreground">{s.description}</div>
                </div>
                {!s.done && (
                  <Link
                    href={s.href}
                    className="inline-flex shrink-0 items-center gap-1 text-[12px] text-signal transition-colors hover:text-signal/80"
                  >
                    {s.cta}
                    <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
