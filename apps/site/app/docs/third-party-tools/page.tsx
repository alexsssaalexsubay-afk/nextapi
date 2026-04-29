import Link from "next/link"
import { ArrowRight, CheckCircle2, KeyRound, MonitorCog, ShieldCheck, TriangleAlert } from "lucide-react"
import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"

const toolRows = [
  {
    tool: "ComfyUI",
    support: "Works through custom HTTP/API request nodes",
    configuration: "Install a trusted HTTP/API request custom node, then POST to /v1/videos with Authorization: Bearer sk_... and poll GET /v1/videos/{id}. There is no core ComfyUI NextAPI provider yet.",
    status: "Integration path available; end-to-end preset pending",
    href: "https://docs.comfy.org/development/core-concepts/custom-nodes",
  },
  {
    tool: "n8n",
    support: "HTTP Request node",
    configuration: "Use HTTP Request: POST https://api.nextapi.top/v1/videos, set Authorization: Bearer sk_..., send JSON body, then add a second HTTP Request to poll the returned video id.",
    status: "Good fit for automation workflows",
    href: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/",
  },
  {
    tool: "Make",
    support: "HTTP app / Make a request",
    configuration: "Use the HTTP module to make a POST request, add Authorization and Content-Type headers, send the video JSON body, then schedule or chain a GET request for polling.",
    status: "Good fit for no-code workflows",
    href: "https://apps.make.com/http",
  },
  {
    tool: "Dify",
    support: "Custom tool / OpenAPI schema",
    configuration: "Create a custom tool from an OpenAPI schema for POST /v1/videos and GET /v1/videos/{id}, then configure bearer-token authentication with the NextAPI key.",
    status: "Good fit for AI app builders; video UX depends on workflow design",
    href: "https://docs.dify.ai/en/use-dify/workspace/tools",
  },
  {
    tool: "AI-CanvasPro",
    support: "BYO install only; generic provider fields appear available",
    configuration: "Install the official upstream yourself. Generic OpenAI-compatible settings may work for some model types, but its video node is not verified against NextAPI /v1/videos yet.",
    status: "Do not redistribute; video adapter pending verification",
    href: "https://github.com/ashuoAI/AI-CanvasPro",
  },
  {
    tool: "Runway / Pika / Luma / Kling / Canva-style hosted editors",
    support: "No generic NextAPI key path verified",
    configuration: "Use only if the product exposes a custom HTTP, OpenAPI, or OpenAI-compatible provider setting. Most hosted editors hardcode their own providers.",
    status: "Not enough evidence",
    href: null,
  },
] as const

const setupSteps = [
  "Sign in at app.nextapi.top.",
  "Open API Keys, create a key, and copy the sk_* value once.",
  "Set the tool base URL to https://api.nextapi.top/v1. If the tool expects a root URL, try https://api.nextapi.top.",
  "Paste the full API key into the tool's API key field.",
  "Use seedance-2.0-pro or seedance-v2-pro only where the tool supports video generation requests.",
] as const

export default function ThirdPartyToolsPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main>
        <section className="relative isolate overflow-hidden border-b border-border/70 bg-background px-6 py-16 sm:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)] dark:bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(129,140,248,0.24),transparent_70%)]"
          />
          <div className="mx-auto max-w-5xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[12px] font-medium text-indigo-600 dark:text-indigo-300">
              <KeyRound className="size-3.5" />
              Bring your own interface
            </div>
            <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-5xl">
              Use NextAPI inside ComfyUI-style workflows.
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
              If you do not want to generate videos inside our dashboard, use NextAPI as the video backend behind ComfyUI, n8n, Make, Dify, or another tool that can call a custom API.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="https://app.nextapi.top"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 text-[13px] font-medium text-white transition-colors hover:bg-indigo-600"
              >
                Get an API key
                <ArrowRight className="size-3.5" />
              </Link>
              <Link
                href="#compatibility"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                Check tool support
              </Link>
            </div>
          </div>
        </section>

        <section className="px-6 py-14">
          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-status-success/25 bg-status-success-dim text-status-success">
                  <CheckCircle2 className="size-5" />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold text-foreground">Get a key</h2>
                  <p className="text-[13px] text-muted-foreground">The key is shown once. Keep it private.</p>
                </div>
              </div>
              <ol className="mt-5 space-y-3">
                {setupSteps.slice(0, 2).map((step, index) => (
                  <li key={step} className="flex gap-3 text-[13.5px] leading-relaxed text-muted-foreground">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted font-mono text-[11px] text-foreground">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-500">
                  <MonitorCog className="size-5" />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold text-foreground">Configure a tool</h2>
                  <p className="text-[13px] text-muted-foreground">Use these fields when a tool supports a custom provider.</p>
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-border/80">
                <table className="w-full text-left text-[13px]">
                  <tbody className="divide-y divide-border/70">
                    <ConfigRow label="Base URL" value="https://api.nextapi.top/v1" />
                    <ConfigRow label="Fallback root" value="https://api.nextapi.top" />
                    <ConfigRow label="API key" value="sk_..." />
                    <ConfigRow label="Video models" value="seedance-2.0-pro, seedance-v2-pro" />
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-14">
          <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Universal REST configuration</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
              Tools that can send custom HTTP requests can drive NextAPI directly. The create request returns a video id; poll that id until the job succeeds.
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/80 bg-background p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Create video</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-foreground">{`POST https://api.nextapi.top/v1/videos
Authorization: Bearer sk_...
Content-Type: application/json

{
  "model": "seedance-2.0-pro",
  "input": {
    "prompt": "A cinematic product reveal",
    "duration_seconds": 5,
    "resolution": "720p"
  }
}`}</pre>
              </div>
              <div className="rounded-xl border border-border/80 bg-background p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Poll result</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-foreground">{`GET https://api.nextapi.top/v1/videos/{id}
Authorization: Bearer sk_...

Wait until:
status = "succeeded"
output.url is present`}</pre>
              </div>
            </div>
          </div>
        </section>

        <section id="compatibility" className="px-6 pb-14">
          <div className="mx-auto max-w-5xl">
            <div className="mb-5 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Tool setup matrix</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                These are the concrete third-party paths we can document now. Some are direct HTTP workflows rather than native provider integrations.
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-border bg-muted/35 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Tool</th>
                    <th className="px-5 py-3 font-medium">How it accepts NextAPI</th>
                    <th className="px-5 py-3 font-medium">Configuration</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {toolRows.map((row) => (
                    <tr key={row.tool} className="align-top">
                      <td className="px-5 py-4 font-medium text-foreground">
                        {row.href ? (
                          <Link href={row.href} className="text-indigo-500 hover:text-indigo-600">
                            {row.tool}
                          </Link>
                        ) : row.tool}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{row.support}</td>
                      <td className="px-5 py-4 leading-relaxed text-muted-foreground">{row.configuration}</td>
                      <td className="px-5 py-4 font-mono text-[12px] text-indigo-500">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="px-6 pb-14">
          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-[17px] font-semibold text-foreground">AI-CanvasPro note</h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                AI-CanvasPro is a third-party local canvas. Install it yourself from the official upstream repository. NextAPI does not distribute, mirror, modify, or white-label it, and we do not promise that its video node works with NextAPI until a verified adapter exists.
              </p>
              <Link
                href="https://github.com/ashuoAI/AI-CanvasPro"
                className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-indigo-500 hover:text-indigo-600"
              >
                Official AI-CanvasPro repository
                <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300">
                  <TriangleAlert className="size-5" />
                </span>
                <h2 className="text-[17px] font-semibold text-foreground">Security rules</h2>
              </div>
              <ul className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-muted-foreground">
                <li>Prefer tools where the key stays local or inside your own automation account.</li>
                <li>Never paste keys into unofficial hosted mirrors or unknown web clients.</li>
                <li>Revoke and rotate the key in app.nextapi.top if it may have been exposed.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto max-w-5xl rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-indigo-500/25 bg-background text-indigo-500">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold text-foreground">Creator Kit is planned</h2>
                  <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
                    NextAPI plans its own fill-key-and-create local tool, so teams can try video generation without code while keeping billing, tasks, and provider access inside the existing NextAPI gateway.
                  </p>
                </div>
              </div>
              <Link
                href="https://app.nextapi.top"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 text-[13px] font-medium text-white transition-colors hover:bg-indigo-600"
              >
                Create a key
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="w-40 bg-muted/25 px-4 py-3 font-medium text-muted-foreground">{label}</th>
      <td className="px-4 py-3 font-mono text-[12.5px] text-foreground">{value}</td>
    </tr>
  )
}
