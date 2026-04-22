"use client"

import { useState, Fragment, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/i18n/context"

type Tab = {
  label: string
  language: string
  code: string
}

export function CodeBlock({
  tabs,
  className,
  filename,
  showLineNumbers = true,
}: {
  tabs: Tab[]
  className?: string
  filename?: string
  showLineNumbers?: boolean
}) {
  const t = useTranslations()
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const current = tabs[active]

  const onCopy = async () => {
    await navigator.clipboard.writeText(current.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const lines = current.code.split("\n")

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/80 bg-syntax-bg shadow-[0_1px_0_0_oklch(1_0_0/0.02)_inset,0_20px_60px_-30px_oklch(0_0_0/0.5)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 bg-card/40 px-3 py-2">
        <div className="flex items-center gap-1">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActive(i)}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-[11px] tracking-tight transition-colors",
                i === active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
          {filename && (
            <span className="ml-2 font-mono text-[11px] text-muted-foreground">{filename}</span>
          )}
        </div>
        <Button
          onClick={onCopy}
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-status-success" /> : <Copy className="size-3.5" />}
          {copied ? t.common.copied : t.common.copy}
        </Button>
      </div>
      <pre className="overflow-x-auto px-0 py-4 font-mono text-[12.5px] leading-[1.65] text-syntax-fg">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span className="w-10 shrink-0 select-none pr-4 text-right text-syntax-comment/70">
                  {i + 1}
                </span>
              )}
              <span className="flex-1 whitespace-pre pr-4">{highlight(line, current.language)}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Highlighter — one-dark-pro inspired.
   Deterministic tokenizer per language; emits <span> nodes.
   ──────────────────────────────────────────────────────────── */

function highlight(line: string, language: string): ReactNode {
  if (language === "bash" || language === "shell") return highlightBash(line)
  if (language === "json") return highlightJson(line)
  if (language === "javascript" || language === "typescript") return highlightJs(line)
  if (language === "python") return highlightPython(line)
  return <span>{line}</span>
}

type Token = { text: string; cls: string }
const render = (tokens: Token[]) =>
  tokens.map((tk, i) => (
    <Fragment key={i}>{tk.text && <span className={tk.cls}>{tk.text}</span>}</Fragment>
  ))

function highlightBash(line: string): ReactNode {
  // Comment
  if (/^\s*#/.test(line)) return <span className="text-syntax-comment">{line}</span>

  const tokens: Token[] = []
  // Match in order: strings, flags, numbers, words
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|--?[A-Za-z-]+|\$[A-Z_][A-Z0-9_]*|\b\d+\b|\s+|[^"'\s]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    const t = m[0]
    if (/^["']/.test(t)) tokens.push({ text: t, cls: "text-syntax-string" })
    else if (/^--?[A-Za-z-]+$/.test(t)) tokens.push({ text: t, cls: "text-syntax-keyword" })
    else if (/^\$[A-Z_]/.test(t)) tokens.push({ text: t, cls: "text-syntax-number" })
    else if (/^\d+$/.test(t)) tokens.push({ text: t, cls: "text-syntax-number" })
    else if (/^(curl|wget|npm|pnpm|yarn|node|python|bash)$/.test(t))
      tokens.push({ text: t, cls: "text-syntax-keyword" })
    else if (/^https?:/.test(t)) tokens.push({ text: t, cls: "text-syntax-string" })
    else tokens.push({ text: t, cls: "text-syntax-fg" })
  }
  return render(tokens)
}

function highlightJson(line: string): ReactNode {
  // Comment (JSON with //)
  if (/^\s*\/\//.test(line)) return <span className="text-syntax-comment">{line}</span>

  const tokens: Token[] = []
  // Indentation
  const indent = line.match(/^\s*/)?.[0] ?? ""
  if (indent) tokens.push({ text: indent, cls: "" })
  let rest = line.slice(indent.length)

  // Key: "word":
  const keyMatch = rest.match(/^("(?:[^"\\]|\\.)*")(\s*:\s*)/)
  if (keyMatch) {
    tokens.push({ text: keyMatch[1], cls: "text-syntax-key" })
    tokens.push({ text: keyMatch[2], cls: "text-syntax-punct" })
    rest = rest.slice(keyMatch[0].length)
  }

  // Value tokenization
  const re = /("(?:[^"\\]|\\.)*"|\b-?\d+(?:\.\d+)?\b|\b(?:true|false|null)\b|[{}\[\],])/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(rest))) {
    if (m.index > lastIdx) tokens.push({ text: rest.slice(lastIdx, m.index), cls: "" })
    const t = m[0]
    if (/^"/.test(t)) tokens.push({ text: t, cls: "text-syntax-string" })
    else if (/^-?\d/.test(t)) tokens.push({ text: t, cls: "text-syntax-number" })
    else if (/^(true|false|null)$/.test(t))
      tokens.push({ text: t, cls: "text-syntax-keyword" })
    else tokens.push({ text: t, cls: "text-syntax-punct" })
    lastIdx = m.index + t.length
  }
  if (lastIdx < rest.length) tokens.push({ text: rest.slice(lastIdx), cls: "" })

  return render(tokens)
}

function highlightJs(line: string): ReactNode {
  if (/^\s*\/\//.test(line)) return <span className="text-syntax-comment">{line}</span>

  const tokens: Token[] = []
  const re =
    /(\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:const|let|var|function|return|await|async|import|from|export|default|if|else|for|while|new|class|extends|try|catch|throw|null|undefined|true|false|this)\b|\b\d+(?:\.\d+)?\b|[A-Za-z_$][A-Za-z0-9_$]*|\s+|[{}\[\]().,;:=+\-*/<>!?&|])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    const t = m[0]
    if (/^\/\//.test(t)) tokens.push({ text: t, cls: "text-syntax-comment" })
    else if (/^["'`]/.test(t)) tokens.push({ text: t, cls: "text-syntax-string" })
    else if (/^\d/.test(t)) tokens.push({ text: t, cls: "text-syntax-number" })
    else if (
      /^(const|let|var|function|return|await|async|import|from|export|default|if|else|for|while|new|class|extends|try|catch|throw|this)$/.test(
        t,
      )
    )
      tokens.push({ text: t, cls: "text-syntax-keyword" })
    else if (/^(null|undefined|true|false)$/.test(t))
      tokens.push({ text: t, cls: "text-syntax-keyword" })
    else tokens.push({ text: t, cls: "text-syntax-fg" })
  }
  return render(tokens)
}

function highlightPython(line: string): ReactNode {
  if (/^\s*#/.test(line)) return <span className="text-syntax-comment">{line}</span>

  const tokens: Token[] = []
  const re =
    /(#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:def|class|import|from|as|return|if|elif|else|for|while|try|except|raise|with|pass|lambda|None|True|False|and|or|not|in|is)\b|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|\s+|[{}\[\]().,;:=+\-*/<>!?&|])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    const t = m[0]
    if (/^#/.test(t)) tokens.push({ text: t, cls: "text-syntax-comment" })
    else if (/^["']/.test(t)) tokens.push({ text: t, cls: "text-syntax-string" })
    else if (/^\d/.test(t)) tokens.push({ text: t, cls: "text-syntax-number" })
    else if (
      /^(def|class|import|from|as|return|if|elif|else|for|while|try|except|raise|with|pass|lambda|and|or|not|in|is)$/.test(
        t,
      )
    )
      tokens.push({ text: t, cls: "text-syntax-keyword" })
    else if (/^(None|True|False)$/.test(t))
      tokens.push({ text: t, cls: "text-syntax-keyword" })
    else tokens.push({ text: t, cls: "text-syntax-fg" })
  }
  return render(tokens)
}
