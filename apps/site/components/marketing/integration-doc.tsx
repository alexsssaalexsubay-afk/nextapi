"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Check, Copy, TriangleAlert } from "lucide-react"

interface IntegrationDocProps {
  name: string
  intro: string
  configSnippet: string
  configLang: string
  curlTest: string
  steps: string[]
  footerNote?: React.ReactNode
}

export function IntegrationDoc({ name, intro, configSnippet, configLang, curlTest, steps, footerNote }: IntegrationDocProps) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
      <Link
        href="/docs/integrations"
        className="mb-8 inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All Integrations
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {name} Integration
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{intro}</p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-foreground">Configuration</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Set the following values in your {name} configuration:
        </p>
        <CodeBlock lang={configLang} code={configSnippet} />
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-foreground">Setup Steps</h2>
        <ol className="mt-4 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-[12px] font-semibold text-indigo-500">
                {i + 1}
              </span>
              <span className="text-[14px] leading-relaxed text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-foreground">Test with cURL</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Verify your setup by running this command with your real{" "}
          <code className="rounded bg-muted px-1 font-mono text-[12px]">sk_live_</code> key:
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-400/40 dark:text-amber-300">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span>Sample command — replace <code className="font-mono">$NEXTAPI_KEY</code> with your actual key from{" "}
            <a href="https://app.nextapi.top" className="underline underline-offset-2">app.nextapi.top</a>.
          </span>
        </div>
        <CodeBlock lang="bash" code={curlTest} />
      </section>

      {footerNote && <div className="mt-10">{footerNote}</div>}

      <section className="mt-12 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-6">
        <h3 className="text-[15px] font-semibold text-foreground">Need help?</h3>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          Contact our integrations team at{" "}
          <a href="mailto:support@nextapi.top" className="text-indigo-500 hover:underline">
            support@nextapi.top
          </a>{" "}
          or check the{" "}
          <Link href="/docs" className="text-indigo-500 hover:underline">
            full API documentation
          </Link>.
        </p>
      </section>
    </div>
  )
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = React.useState(false)

  function onCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="group relative mt-4 overflow-hidden rounded-xl border border-border bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <span className="font-mono text-[11px] text-zinc-500">{lang}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
        >
          {copied ? <><Check className="size-3.5 text-emerald-400" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.75] text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  )
}
