"use client"

import * as React from "react"
import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { Activity, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type Status = "operational" | "degraded" | "outage" | "loading"

const SERVICES = [
  { key: "api", label: "API Gateway", endpoint: "/health" },
  { key: "dashboard", label: "Dashboard", endpoint: null },
  { key: "webhooks", label: "Webhook Delivery", endpoint: null },
  { key: "generation", label: "Video Generation", endpoint: null },
]

const STATUS_CONFIG: Record<Status, { icon: typeof CheckCircle2; color: string; label: string }> = {
  operational: { icon: CheckCircle2, color: "text-emerald-500", label: "Operational" },
  degraded: { icon: AlertTriangle, color: "text-yellow-500", label: "Degraded" },
  outage: { icon: XCircle, color: "text-red-500", label: "Outage" },
  loading: { icon: Activity, color: "text-muted-foreground", label: "Checking..." },
}

export default function StatusPage() {
  const [apiStatus, setApiStatus] = React.useState<Status>("loading")
  const [latency, setLatency] = React.useState<number | null>(null)

  React.useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"
    const t0 = Date.now()
    fetch(`${apiUrl}/health`, { mode: "cors" })
      .then((res) => {
        setLatency(Date.now() - t0)
        setApiStatus(res.ok ? "operational" : "degraded")
      })
      .catch(() => {
        setLatency(null)
        setApiStatus("outage")
      })
  }, [])

  function getStatus(key: string): Status {
    if (key === "api") return apiStatus
    return apiStatus === "loading" ? "loading" : apiStatus === "outage" ? "outage" : "operational"
  }

  const overallStatus = apiStatus === "outage" ? "outage" : apiStatus === "degraded" ? "degraded" : apiStatus

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main className="py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6">
          {/* Overall status banner */}
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-6",
              overallStatus === "operational"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : overallStatus === "degraded"
                  ? "border-yellow-500/30 bg-yellow-500/5"
                  : overallStatus === "outage"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-border bg-card",
            )}
          >
            {(() => {
              const cfg = STATUS_CONFIG[overallStatus]
              const Icon = cfg.icon
              return (
                <>
                  <Icon className={cn("size-6", cfg.color)} />
                  <div>
                    <h1 className="text-lg font-semibold text-foreground">
                      {overallStatus === "operational"
                        ? "All Systems Operational"
                        : overallStatus === "degraded"
                          ? "Degraded Performance"
                          : overallStatus === "outage"
                            ? "Service Disruption"
                            : "Checking Status..."}
                    </h1>
                    {latency !== null && (
                      <p className="text-[13px] text-muted-foreground">
                        API responded in {latency}ms
                      </p>
                    )}
                  </div>
                </>
              )
            })()}
          </div>

          {/* Service list */}
          <div className="mt-8 overflow-hidden rounded-xl border border-border">
            {SERVICES.map((s, i) => {
              const status = getStatus(s.key)
              const cfg = STATUS_CONFIG[status]
              const Icon = cfg.icon
              return (
                <div
                  key={s.key}
                  className={cn(
                    "flex items-center justify-between px-5 py-4",
                    i < SERVICES.length - 1 && "border-b border-border",
                  )}
                >
                  <span className="text-[14px] font-medium text-foreground">{s.label}</span>
                  <span className={cn("flex items-center gap-2 text-[13px]", cfg.color)}>
                    <Icon className="size-4" />
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            For real-time incident updates, follow{" "}
            <a href="https://twitter.com/nextapi" className="text-indigo-500 hover:underline" target="_blank" rel="noreferrer">
              @nextapi
            </a>{" "}
            on Twitter or subscribe to{" "}
            <a href="mailto:status@nextapi.dev" className="text-indigo-500 hover:underline">
              status notifications
            </a>.
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  )
}
