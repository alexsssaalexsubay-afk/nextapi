"use client"

import Link from "next/link"
import { SiteNav } from "@/components/marketing/site-nav"
import { SiteFooter } from "@/components/marketing/cta-footer"
import { CodeBlock } from "@/components/nextapi/code-block"
import { StatusPill } from "@/components/nextapi/status-pill"
import { ArrowRight, BookOpen, KeyRound, Webhook as WebhookIcon, Zap } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"

export default function DocsPage() {
  const t = useTranslations()
  const d = t.docsPage

  const nav = [
    {
      heading: d.nav.gettingStarted,
      items: [
        [d.nav.gettingStartedItems.quickstart, "#quickstart", true] as const,
        [d.nav.gettingStartedItems.auth, "#auth", false] as const,
        [d.nav.gettingStartedItems.idempotency, "#idem", false] as const,
      ],
    },
    {
      heading: d.nav.seedance,
      items: [
        [d.nav.seedanceItems.create, "#create", false] as const,
        [d.nav.seedanceItems.retrieve, "#retrieve", false] as const,
        [d.nav.seedanceItems.list, "#list", false] as const,
      ],
    },
    {
      heading: d.nav.webhooks,
      items: [
        [d.nav.webhooksItems.events, "#events", false] as const,
        [d.nav.webhooksItems.signature, "#sig", false] as const,
        [d.nav.webhooksItems.retries, "#retries", false] as const,
      ],
    },
    {
      heading: d.nav.resources,
      items: [
        [d.nav.resourcesItems.rateLimits, "#limits", false] as const,
        [d.nav.resourcesItems.errors, "#errors", false] as const,
        [d.nav.resourcesItems.changelog, "#changelog", false] as const,
      ],
    },
  ]

  const quickCards = [
    { icon: Zap, t: d.quickstart.stepKey, desc: d.quickstart.stepKeyDesc },
    { icon: ArrowRight, t: d.quickstart.stepSubmit, desc: d.quickstart.stepSubmitDesc },
    { icon: WebhookIcon, t: d.quickstart.stepWebhook, desc: d.quickstart.stepWebhookDesc },
  ]

  const eventRows: readonly [string, "queued" | "running" | "succeeded" | "failed", string][] = [
    ["job.queued", "queued", d.events.rowQueued],
    ["job.running", "running", d.events.rowRunning],
    ["job.succeeded", "succeeded", d.events.rowSucceeded],
    ["job.failed", "failed", d.events.rowFailed],
  ]

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-6 py-12 lg:grid-cols-[220px_1fr_220px]">
        {/* Left nav */}
        <aside className="sticky top-20 hidden h-fit text-[13px] lg:block">
          {nav.map((g) => (
            <div key={g.heading} className="mb-6">
              <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {g.heading}
              </div>
              <ul className="space-y-1">
                {g.items.map(([label, href, active]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className={
                        "block rounded-md px-2 py-1 transition-colors " +
                        (active
                          ? "bg-card text-foreground"
                          : "text-muted-foreground hover:bg-card/50 hover:text-foreground")
                      }
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* Main */}
        <main className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <BookOpen className="size-3.5" />
            <span>{d.breadcrumb.docs}</span>
            <span>/</span>
            <span className="text-foreground">{d.breadcrumb.quickstart}</span>
          </div>
          <h1
            id="quickstart"
            className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-foreground md:text-5xl"
          >
            {d.quickstart.title}
          </h1>
          <p className="mt-4 max-w-[680px] text-pretty text-[15px] leading-relaxed text-muted-foreground">
            {d.quickstart.leadPrefix}{" "}
            <Link
              href="https://app.nextapi.top"
              className="text-indigo-500 underline decoration-indigo-500/40 underline-offset-4 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {d.quickstart.leadLink}
            </Link>
            {d.quickstart.leadSuffix}
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {quickCards.map((i) => (
              <div
                key={i.t}
                className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card/50 p-4"
              >
                <i.icon className="size-4 text-signal" />
                <div className="text-[13px] font-medium text-foreground">{i.t}</div>
                <div className="text-[12.5px] text-muted-foreground">{i.desc}</div>
              </div>
            ))}
          </div>

          <section className="mt-6 overflow-hidden rounded-xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-card to-card p-5 shadow-[0_18px_70px_-48px_rgba(99,102,241,0.7)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-indigo-500/25 bg-indigo-500/10 text-indigo-500">
                  <KeyRound className="size-5" />
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
                    Use your key in ComfyUI-style tools
                  </h2>
                  <p className="mt-1 max-w-[720px] text-[13.5px] leading-relaxed text-muted-foreground">
                    Prefer ComfyUI, n8n, Make, Dify, or a local canvas? See which tools can accept a third-party API key, which need an HTTP/API node, and how to configure NextAPI endpoints safely.
                  </p>
                </div>
              </div>
              <Link
                href="/docs/third-party-tools"
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500 px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-indigo-600"
              >
                View tool setup guide
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </section>

          <section id="auth" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.auth.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.auth.bodyPrefix}
              <span className="font-mono text-foreground/90">{d.auth.live}</span>
              {d.auth.or}
              <span className="font-mono text-foreground/90">{d.auth.test}</span>
              {d.auth.bodySuffix}
            </p>
            <div className="mt-4">
              <CodeBlock
                tabs={[
                  {
                    label: d.auth.tabLabel,
                    language: "bash",
                    code: `Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
                  },
                ]}
                showLineNumbers={false}
              />
            </div>
          </section>

          <section id="create" className="mt-12 scroll-mt-24">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-status-success-dim px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-status-success">
                POST
              </span>
              <span className="font-mono text-[13px] text-foreground">/v1/videos</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.createJob.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.createJob.bodyPrefix}
              <span className="font-mono text-foreground/90">{d.createJob.jobId}</span>
              {d.createJob.bodyMid}
              <span className="font-mono text-foreground/90">{d.createJob.succeededEvent}</span>
              {d.createJob.bodyMid2}
              <span className="font-mono text-foreground/90">{d.createJob.failedEvent}</span>
              {d.createJob.bodySuffix}
            </p>
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <CodeBlock
                tabs={[
                  {
                    label: d.createJob.requestTab,
                    language: "bash",
                    code: `curl https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Idempotency-Key: 9c4fa1b2" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "Drone orbiting a lighthouse at dusk",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }'`,
                  },
                ]}
              />
              <CodeBlock
                tabs={[
                  {
                    label: d.createJob.responseTab,
                    language: "json",
                    code: `{
  "id": "vid_7Hc9Xk2Lm3NpQ4rS",
  "object": "video",
  "model": "seedance-2.0-pro",
  "status": "queued",
  "estimated_cost_cents": 100,
  "created_at": "2026-04-24T12:00:00.000Z"
}`,
                  },
                ]}
              />
            </div>
          </section>

          <section id="events" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.events.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.events.bodyPrefix}
              <span className="font-mono text-foreground/90">{d.events.eventId}</span>
              {d.events.bodySuffix}
            </p>
            <div className="mt-5 overflow-hidden rounded-xl border border-border/80 bg-card/40">
              <table className="w-full text-[13px]">
                <thead className="bg-card/70 text-left text-[11.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-mono font-normal">{d.events.columns.event}</th>
                    <th className="px-5 py-3 font-mono font-normal">{d.events.columns.status}</th>
                    <th className="px-5 py-3 font-mono font-normal">{d.events.columns.emittedWhen}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {eventRows.map((r) => (
                    <tr key={r[0]} className="font-mono text-[12.5px] text-foreground/90">
                      <td className="px-5 py-3 text-foreground">{r[0]}</td>
                      <td className="px-5 py-3">
                        <StatusPill status={r[1]} />
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="sig" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.signature.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.signature.bodyPrefix}
              <span className="font-mono text-foreground/90">{d.signature.header}</span>
              {d.signature.bodySuffix}
            </p>
            <div className="mt-5">
              <CodeBlock
                tabs={[
                  {
                    label: d.signature.nodeTab,
                    language: "javascript",
                    code: `import crypto from "node:crypto"

export function verify(rawBody, header, secret) {
  const [tPart, vPart] = header.split(",")
  const t = tPart.split("=")[1]
  const v = vPart.split("=")[1]

  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex")

  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300
  return fresh && crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(v),
  )
}`,
                  },
                  {
                    label: d.signature.pythonTab,
                    language: "python",
                    code: `import hmac, hashlib, time

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    t = header.split(",")[0].split("=")[1]
    v = header.split(",")[1].split("=")[1]

    expected = hmac.new(
        secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256
    ).hexdigest()

    fresh = abs(time.time() - int(t)) < 300
    return fresh and hmac.compare_digest(expected, v)`,
                  },
                ]}
              />
            </div>
          </section>

          <section id="idem" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.idempotency.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.idempotency.body}
            </p>
          </section>

          <section id="retrieve" className="mt-12 scroll-mt-24">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-indigo-500">
                GET
              </span>
              <span className="font-mono text-[13px] text-foreground">/v1/videos/:id</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.retrieveJob.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.retrieveJob.body}
            </p>
          </section>

          <section id="list" className="mt-12 scroll-mt-24">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-indigo-500">
                GET
              </span>
              <span className="font-mono text-[13px] text-foreground">/v1/videos</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.listJobs.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.listJobs.body}
            </p>
          </section>

          <section id="retries" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.webhookRetries.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.webhookRetries.body}
            </p>
          </section>

          <section id="limits" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.rateLimits.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.rateLimits.body}
            </p>
          </section>

          <section id="errors" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.errorCodes.title}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {d.errorCodes.body}
            </p>
          </section>

          <section id="changelog" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {d.changelog.title}
            </h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-border/80 bg-card/50 p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-500">
                    {d.changelog.v1Badge}
                  </span>
                  <span className="text-[12px] text-muted-foreground">{d.changelog.v1Date}</span>
                </div>
                <p className="mt-2 text-[13.5px] text-muted-foreground">{d.changelog.v1Body}</p>
              </div>
            </div>
          </section>
        </main>

        {/* Right TOC */}
        <aside className="sticky top-20 hidden h-fit text-[12px] lg:block">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {d.toc.title}
          </div>
          <ul className="space-y-1.5 border-l border-border/60 pl-3">
            {[
              [d.toc.quickstart, "#quickstart"],
              [d.toc.auth, "#auth"],
              [d.toc.create, "#create"],
              [d.toc.events, "#events"],
              [d.toc.sig, "#sig"],
              [d.toc.idem, "#idem"],
              [d.toc.retrieve, "#retrieve"],
              [d.toc.list, "#list"],
              [d.toc.retries, "#retries"],
              [d.toc.limits, "#limits"],
              [d.toc.errors, "#errors"],
              [d.toc.changelog, "#changelog"],
            ].map(([l, h]) => (
              <li key={l}>
                <Link
                  href={h}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <SiteFooter />
    </div>
  )
}
