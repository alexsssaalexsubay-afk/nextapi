"use client"

import * as React from "react"
import { Check, Copy, Play, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { track } from "@/lib/analytics"

const STEPS = [
  { n: 1, title: "Sign Up", body: "Create your account in seconds" },
  { n: 2, title: "Get Access", body: "Use your access key when you are ready" },
  { n: 3, title: "Send an Idea", body: "Describe the scene and choose a video style" },
  { n: 4, title: "Receive Video", body: "Get the finished clip and final cost" },
] as const

type Tab = "cURL" | "Python" | "Node.js" | "Response"
const TABS: Tab[] = ["cURL", "Python", "Node.js", "Response"]

const DEMO_LIMIT = 3
const DEMO_WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(): { allowed: boolean; remaining: number } {
  if (typeof window === "undefined") return { allowed: true, remaining: DEMO_LIMIT }
  const key = "nextapi_demo_timestamps"
  const now = Date.now()
  const raw = localStorage.getItem(key)
  const timestamps: number[] = raw ? JSON.parse(raw).filter((t: number) => now - t < DEMO_WINDOW_MS) : []
  if (timestamps.length >= DEMO_LIMIT) {
    return { allowed: false, remaining: 0 }
  }
  timestamps.push(now)
  localStorage.setItem(key, JSON.stringify(timestamps))
  return { allowed: true, remaining: DEMO_LIMIT - timestamps.length }
}

function generateSampleResponse() {
  const id = `vid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    status: "succeeded",
    model: "seedance-2.0-pro",
    prompt: "drone orbiting a lighthouse at dusk",
    duration_seconds: 6,
    resolution: "1080p",
    url: `https://cdn.nextapi.top/v/${id}.mp4`,
    created_at: Math.floor(Date.now() / 1000),
    usage: { credits: 12, processing_ms: 38420 },
  }
}

export function DevexSection() {
  const [tab, setTab] = React.useState<Tab>("cURL")
  const [copied, setCopied] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [demoResult, setDemoResult] = React.useState<string | null>(null)
  const [demoError, setDemoError] = React.useState<string | null>(null)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(
        `curl -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "drone orbiting a lighthouse at dusk",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }'`,
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* noop */ }
  }

  async function onRunDemo() {
    track("demo_run_clicked")
    setDemoError(null)

    const { allowed } = checkRateLimit()
    if (!allowed) {
      setDemoError("Demo limit reached (3/hour). Sign up to continue.")
      setTab("Response")
      return
    }

    setRunning(true)
    setTab("Response")

    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800))

    const resp = generateSampleResponse()
    setDemoResult(JSON.stringify(resp, null, 2))
    setRunning(false)
  }

  const responseContent = demoError ? (
    <span className="text-red-400">{`{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "${demoError}"
  }
}`}</span>
  ) : demoResult ? (
    <span className="text-zinc-300">{demoResult}</span>
  ) : null

  const SNIPPETS: Record<Tab, React.ReactNode> = {
    cURL: (
      <>
        <Line><Cmd>curl</Cmd> -X <Str>POST</Str> <Str>https://api.nextapi.top/v1/videos</Str> \</Line>
        <Line>{"  "}-H <Str>&quot;Authorization: Bearer $NEXTAPI_KEY&quot;</Str> \</Line>
        <Line>{"  "}-H <Str>&quot;Content-Type: application/json&quot;</Str> \</Line>
        <Line>{"  "}-d &apos;{"{"}</Line>
        <Line>{"    "}<Key>&quot;model&quot;</Key>: <Str>&quot;seedance-2.0-pro&quot;</Str>,</Line>
        <Line>{"    "}<Key>&quot;input&quot;</Key>: {"{"}</Line>
        <Line>{"      "}<Key>&quot;prompt&quot;</Key>: <Str>&quot;drone orbiting a lighthouse at dusk&quot;</Str>,</Line>
        <Line>{"      "}<Key>&quot;duration_seconds&quot;</Key>: <Num>6</Num>,</Line>
        <Line>{"      "}<Key>&quot;resolution&quot;</Key>: <Str>&quot;1080p&quot;</Str></Line>
        <Line>{"    "}{"}"}</Line>
        <Line>{"  "}{"}"}&apos;</Line>
      </>
    ),
    Python: (
      <>
        <Line><Kw>import</Kw> os</Line>
        <Line><Kw>from</Kw> nextapi <Kw>import</Kw> Client</Line>
        <Line />
        <Line>client = <Fn>Client</Fn>(api_key=os.environ[<Str>&quot;NEXTAPI_KEY&quot;</Str>])</Line>
        <Line />
        <Line>video = client.<Fn>generate</Fn>(</Line>
        <Line>{"  "}model=<Str>&quot;seedance-2.0-pro&quot;</Str>,</Line>
        <Line>{"  "}prompt=<Str>&quot;drone orbiting a lighthouse at dusk&quot;</Str>,</Line>
        <Line>{"  "}duration_seconds=<Num>6</Num>,</Line>
        <Line>{"  "}resolution=<Str>&quot;1080p&quot;</Str>,</Line>
        <Line>)</Line>
        <Line />
        <Line><Fn>print</Fn>(video[<Str>&quot;id&quot;</Str>])</Line>
      </>
    ),
    "Node.js": (
      <>
        <Line><Kw>import</Kw> {"{"} NextAPI {"}"} <Kw>from</Kw> <Str>&quot;nextapi&quot;</Str>;</Line>
        <Line />
        <Line><Kw>const</Kw> client = <Kw>new</Kw> <Fn>NextAPI</Fn>({"{"}</Line>
        <Line>{"  "}apiKey: process.env.<Key>NEXTAPI_KEY</Key>,</Line>
        <Line>{"}"});</Line>
        <Line />
        <Line><Kw>const</Kw> video = <Kw>await</Kw> client.<Fn>generate</Fn>({"{"}</Line>
        <Line>{"  "}model: <Str>&quot;seedance-2.0-pro&quot;</Str>,</Line>
        <Line>{"  "}prompt: <Str>&quot;drone orbiting a lighthouse at dusk&quot;</Str>,</Line>
        <Line>{"  "}durationSeconds: <Num>6</Num>,</Line>
        <Line>{"  "}resolution: <Str>&quot;1080p&quot;</Str>,</Line>
        <Line>{"}"});</Line>
      </>
    ),
    Response: running ? (
      <div className="flex items-center gap-2 py-8 text-zinc-400">
        <Loader2 className="size-4 animate-spin" />
        <span>Preparing sample response...</span>
      </div>
    ) : responseContent ? (
      <span>{responseContent}</span>
    ) : (
      <>
        <Line>{"{"}</Line>
        <Line>{"  "}<Key>&quot;id&quot;</Key>: <Str>&quot;vid_01HX...&quot;</Str>,</Line>
        <Line>{"  "}<Key>&quot;status&quot;</Key>: <Str>&quot;succeeded&quot;</Str>,</Line>
        <Line>{"  "}<Key>&quot;duration_seconds&quot;</Key>: <Num>6</Num>,</Line>
        <Line>{"  "}<Key>&quot;model&quot;</Key>: <Str>&quot;seedance-2.0-pro&quot;</Str>,</Line>
        <Line>{"  "}<Key>&quot;url&quot;</Key>: <Str>&quot;https://cdn.nextapi.top/v/01HX...mp4&quot;</Str>,</Line>
        <Line>{"  "}<Key>&quot;created_at&quot;</Key>: <Num>1714579200</Num></Line>
        <Line>{"}"}</Line>
      </>
    ),
  }

  return (
    <section id="devex" className="relative py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
            From first idea to first clip,{" "}
            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              in minutes.
            </span>
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Four calm steps. No sales queue, no heavy migration, no long onboarding.
          </p>

          <ol className="mt-10 relative">
            <div
              aria-hidden
              className="absolute left-[17px] top-2 bottom-2 w-px bg-gradient-to-b from-indigo-500/60 via-purple-500/40 to-transparent"
            />
            {STEPS.map((s) => (
              <li key={s.n} className="relative flex gap-4 pb-7 last:pb-0">
                <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 font-mono text-[12px] font-semibold text-white shadow-[0_0_16px_-4px] shadow-indigo-500/60">
                  {s.n}
                </span>
                <div className="pt-1">
                  <h3 className="text-[15px] font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-transparent opacity-60 blur-md"
          />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-zinc-950 shadow-2xl shadow-indigo-500/10 dark:shadow-indigo-500/30">
            <div className="flex items-center justify-between border-b border-white/5 bg-zinc-900 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-red-500/80" />
                <span className="size-3 rounded-full bg-yellow-500/80" />
                <span className="size-3 rounded-full bg-emerald-500/80" />
              </div>
              <span className="font-mono text-[11px] text-zinc-500">starter clip</span>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  example output
                </span>
                <button
                  type="button"
                  onClick={onRunDemo}
                  disabled={running}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 px-2.5 py-1 text-[11px] font-medium text-indigo-300 transition-colors hover:bg-indigo-500/30 disabled:opacity-50"
                >
                  {running ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                  {running ? "Preparing..." : "Show sample"}
                </button>
                <button
                  type="button"
                  onClick={onCopy}
                  aria-label="Copy code"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                >
                  {copied ? (
                    <><Check className="size-3.5 text-emerald-400" /> Copied</>
                  ) : (
                    <><Copy className="size-3.5" /> Copy</>
                  )}
                </button>
              </div>
            </div>

            <div className="flex gap-1 border-b border-white/5 bg-zinc-950 px-2">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative px-3 py-2 font-mono text-[12px] transition-colors",
                    tab === t ? "text-white" : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  {t}
                  {tab === t && (
                    <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-indigo-500 to-purple-500" />
                  )}
                </button>
              ))}
            </div>

            <pre className="scroll-thin max-h-[420px] overflow-auto bg-zinc-950 px-5 py-4 font-mono text-[12.5px] leading-[1.75] text-zinc-300">
              <code>{SNIPPETS[tab]}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}

function Line({ children }: { children?: React.ReactNode }) {
  return <div>{children ?? "\u00A0"}</div>
}
function Cmd({ children }: { children: React.ReactNode }) {
  return <span className="text-purple-400">{children}</span>
}
function Kw({ children }: { children: React.ReactNode }) {
  return <span className="text-purple-400">{children}</span>
}
function Fn({ children }: { children: React.ReactNode }) {
  return <span className="text-yellow-300">{children}</span>
}
function Key({ children }: { children: React.ReactNode }) {
  return <span className="text-cyan-300">{children}</span>
}
function Str({ children }: { children: React.ReactNode }) {
  return <span className="text-emerald-300">{children}</span>
}
function Num({ children }: { children: React.ReactNode }) {
  return <span className="text-orange-300">{children}</span>
}
