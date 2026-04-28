"use client"

import * as React from "react"
import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { Activity, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type ServiceStatus = "ok" | "degraded" | "down" | "checking"

interface ServiceResult {
  status: ServiceStatus
  latencyMs: number | null
  checkedAt: Date | null
}

const ENDPOINTS: { key: string; label: string; url: string; method: "GET" | "HEAD"; cors: boolean }[] = [
  { key: "api", label: "API Gateway", url: "https://api.nextapi.top/health", method: "GET", cors: true },
  { key: "app", label: "Dashboard (app)", url: "https://app.nextapi.top/health", method: "GET", cors: true },
  { key: "admin", label: "Admin", url: "https://admin.nextapi.top/health", method: "GET", cors: true },
  { key: "home", label: "Marketing Site", url: "/health", method: "GET", cors: true },
]

const TIMEOUT_MS = 5000
const DEGRADED_THRESHOLD_MS = 2000
const POLL_INTERVAL_MS = 60_000

const STATUS_CONFIG: Record<
  ServiceStatus,
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  ok: { icon: CheckCircle2, color: "text-emerald-500", label: "Operational" },
  degraded: { icon: AlertTriangle, color: "text-yellow-500", label: "Degraded" },
  down: { icon: XCircle, color: "text-red-500", label: "Down" },
  checking: { icon: Activity, color: "text-muted-foreground", label: "Checking…" },
}

async function checkEndpoint(
  url: string,
  method: "GET" | "HEAD",
  cors: boolean,
): Promise<{ status: ServiceStatus; latencyMs: number | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  try {
    // Read real /health JSON where possible so a 503 actually shows
    // as "down" instead of being hidden behind a no-cors opaque response.
    // User-facing HTML routes stay out of this probe path.
    const res = await fetch(url, {
      method,
      mode: cors ? "cors" : "no-cors",
      cache: "no-store",
      signal: controller.signal,
    })
    const latencyMs = Date.now() - t0
    if (cors) {
      // Real status visible: 2xx ok, 3xx ok, 4xx degraded, 5xx down.
      if (res.status >= 500) return { status: "down", latencyMs }
      if (res.status >= 400) return { status: "degraded", latencyMs }
    }
    return {
      status: latencyMs > DEGRADED_THRESHOLD_MS ? "degraded" : "ok",
      latencyMs,
    }
  } catch {
    return { status: "down", latencyMs: null }
  } finally {
    clearTimeout(timer)
  }
}

function overallStatus(results: Record<string, ServiceResult>): ServiceStatus {
  const statuses = Object.values(results).map((r) => r.status)
  if (statuses.some((s) => s === "checking")) return "checking"
  if (statuses.some((s) => s === "down")) return "down"
  if (statuses.some((s) => s === "degraded")) return "degraded"
  return "ok"
}

export default function StatusPage() {
  const initial: Record<string, ServiceResult> = Object.fromEntries(
    ENDPOINTS.map((e) => [e.key, { status: "checking" as const, latencyMs: null, checkedAt: null }]),
  )
  const [results, setResults] = React.useState<Record<string, ServiceResult>>(initial)
  const [lastChecked, setLastChecked] = React.useState<Date | null>(null)

  const runChecks = React.useCallback(async () => {
    setResults((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, v]) => [k, { ...v, status: "checking" as const }]),
      ),
    )
    const checks = await Promise.all(
      ENDPOINTS.map(async (ep) => {
        const result = await checkEndpoint(ep.url, ep.method, ep.cors)
        return [ep.key, { ...result, checkedAt: new Date() }] as const
      }),
    )
    setResults(Object.fromEntries(checks))
    setLastChecked(new Date())
  }, [])

  React.useEffect(() => {
    runChecks()
    const id = setInterval(runChecks, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [runChecks])

  const overall = overallStatus(results)
  const cfg = STATUS_CONFIG[overall]
  const Icon = cfg.icon

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main className="py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6">
          {/* Overall status banner */}
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-6",
              overall === "ok"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : overall === "degraded"
                  ? "border-yellow-500/30 bg-yellow-500/5"
                  : overall === "down"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-border bg-card",
            )}
          >
            <Icon className={cn("size-6", cfg.color)} />
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {overall === "ok"
                  ? "All Systems Operational"
                  : overall === "degraded"
                    ? "Degraded Performance"
                    : overall === "down"
                      ? "Service Disruption"
                      : "Checking Status…"}
              </h1>
              {lastChecked && (
                <p className="text-[13px] text-muted-foreground">
                  Last checked {lastChecked.toLocaleTimeString()} · auto-refreshes every 60s
                </p>
              )}
            </div>
          </div>

          {/* Service list */}
          <div className="mt-8 overflow-hidden rounded-xl border border-border">
            {ENDPOINTS.map((ep, i) => {
              const r = results[ep.key]
              const scfg = STATUS_CONFIG[r.status]
              const SIcon = scfg.icon
              return (
                <div
                  key={ep.key}
                  className={cn(
                    "flex items-center justify-between px-5 py-4",
                    i < ENDPOINTS.length - 1 && "border-b border-border",
                  )}
                >
                  <div>
                    <span className="text-[14px] font-medium text-foreground">{ep.label}</span>
                    {r.latencyMs !== null && r.status !== "checking" && (
                      <span className="ml-2 text-[12px] text-muted-foreground">
                        {r.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <span className={cn("flex items-center gap-2 text-[13px]", scfg.color)}>
                    <SIcon className="size-4" />
                    {scfg.label}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            For real-time incident updates, follow{" "}
            <a
              href="https://twitter.com/nextapi"
              className="text-indigo-500 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              @nextapi
            </a>{" "}
            on Twitter or contact{" "}
            <a href="mailto:status@nextapi.top" className="text-indigo-500 hover:underline">
              status@nextapi.top
            </a>
            .
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  )
}
