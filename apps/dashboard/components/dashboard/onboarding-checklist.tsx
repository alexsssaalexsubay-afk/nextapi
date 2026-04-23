"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Copy, KeyRound, Play, Terminal, Webhook as WebhookIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { CodeBlock } from "@/components/nextapi/code-block"
import { useTranslations } from "@/lib/i18n/context"

type Step = {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  status: "done" | "active" | "todo"
  cta: string
  content?: React.ReactNode
}

export function OnboardingChecklist() {
  const t = useTranslations()
  const [open, setOpen] = useState<string | null>("run-first")
  const [copiedKey, setCopiedKey] = useState(false)

  const copyKey = async () => {
    await navigator.clipboard.writeText("nxa_live_sk_9fa0b1c8f4d2e7a14e2a")
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 1400)
  }

  const steps: Step[] = [
    {
      id: "create-key",
      title: t.dashboard.onboarding.step1.title,
      description: t.dashboard.onboarding.step1.description,
      icon: KeyRound,
      status: "done",
      cta: t.dashboard.onboarding.step1.action,
      content: (
        <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2 font-mono text-[12px]">
          <span className="text-foreground">nxa_live_sk_9fa0b1c8f4d2e7a14e2a</span>
          <button
            onClick={copyKey}
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {copiedKey ? (
              <Check className="size-3.5 text-status-success" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copiedKey ? t.common.copied : t.common.copy}
          </button>
        </div>
      ),
    },
    {
      id: "copy-curl",
      title: t.dashboard.onboarding.step2.title,
      description: t.dashboard.onboarding.step2.description,
      icon: Terminal,
      status: "done",
      cta: t.dashboard.onboarding.step2.action,
      content: (
        <CodeBlock
          tabs={[
            {
              label: "curl",
              language: "bash",
              code: `curl https://api.nextapi.top/v1/video/generations \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"seedance-2.0-pro","prompt":"Sunrise over the Alps","duration_seconds":6}'`,
            },
          ]}
          showLineNumbers={false}
        />
      ),
    },
    {
      id: "run-first",
      title: t.dashboard.onboarding.step3.title,
      description: t.dashboard.onboarding.step3.description,
      icon: Play,
      status: "active",
      cta: t.dashboard.onboarding.step3.action,
      content: (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border/60 bg-background/60 p-3 font-mono text-[12px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground">test payload</span>
              <span className="text-muted-foreground">editable</span>
            </div>
            <div className="text-foreground/90">{`{ "model": "seedance-2.0-pro", "prompt": "Aerial shot of a coastal road", "duration_seconds": 6, "resolution": "1080p" }`}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background transition-opacity hover:opacity-90">
              <Play className="size-3.5" />
              {t.dashboard.onboarding.step3.action}
            </button>
            <span className="font-mono text-[11px] text-muted-foreground">
              1.00 {t.common.credits}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "webhook",
      title: t.dashboard.onboarding.step4.title,
      description: t.dashboard.onboarding.step4.description,
      icon: WebhookIcon,
      status: "todo",
      cta: t.dashboard.onboarding.step4.action,
    },
  ]

  const progress = steps.filter((s) => s.status === "done").length
  const pct = Math.round((progress / steps.length) * 100)

  return (
    <div className="rounded-xl border border-border/80 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium tracking-tight text-foreground">
            {t.dashboard.onboarding.title}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {progress}/{steps.length} · {t.dashboard.onboarding.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">{pct}%</span>
        </div>
      </div>

      <ul className="divide-y divide-border/60">
        {steps.map((s) => {
          const isOpen = open === s.id
          const Icon = s.icon
          return (
            <li key={s.id}>
              <button
                onClick={() => setOpen(isOpen ? null : s.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-card/60"
              >
                <div
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    s.status === "done" &&
                      "border-status-success/40 bg-status-success-dim/40 text-status-success",
                    s.status === "active" && "border-signal/40 bg-signal/10 text-signal",
                    s.status === "todo" && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {s.status === "done" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[13.5px] font-medium",
                        s.status === "done"
                          ? "text-muted-foreground line-through"
                          : "text-foreground",
                      )}
                    >
                      {s.title}
                    </span>
                    {s.status === "active" && (
                      <span className="rounded-full border border-signal/30 bg-signal/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal">
                        next
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-muted-foreground">{s.description}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  {s.cta}
                  <ArrowRight className="size-3" />
                </span>
              </button>
              {isOpen && s.content && (
                <div className="border-t border-border/60 bg-background/40 px-5 py-4">{s.content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
