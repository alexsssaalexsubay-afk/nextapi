"use client"

/**
 * Compatible-with strip. Renders 6 tool wordmarks in a monochrome
 * aesthetic that inverts between light and dark. Pure text + icon — no
 * external brand assets required.
 */

type Integration = {
  name: string
  /** Small decorative glyph rendered before the wordmark. */
  glyph: React.ReactNode
}

const INTEGRATIONS: Integration[] = [
  {
    name: "Cursor",
    glyph: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.31L19 8.27v.01l-7 4.04-7-4.04L12 4.31Zm-8 5.6 7 4.04V22.4l-7-3.89V9.91Zm16 8.6-7 3.89v-8.45l7-4.04v8.6Z" />
      </svg>
    ),
  },
  {
    name: "n8n",
    glyph: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <circle cx="5" cy="12" r="2.2" />
        <circle cx="12" cy="5" r="2.2" />
        <circle cx="12" cy="19" r="2.2" />
        <circle cx="19" cy="12" r="2.2" />
        <path
          d="M7 12h10M12 7v10"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
        />
      </svg>
    ),
  },
  {
    name: "Dify",
    glyph: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M4 6a2 2 0 0 1 2-2h8l6 6v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm10-.5V10h4.5L14 5.5Z" />
      </svg>
    ),
  },
  {
    name: "LangChain",
    glyph: (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M10 14a4 4 0 0 1 0-6l2-2a4 4 0 0 1 6 6l-1 1" />
        <path d="M14 10a4 4 0 0 1 0 6l-2 2a4 4 0 0 1-6-6l1-1" />
      </svg>
    ),
  },
  {
    name: "ComfyUI",
    glyph: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    name: "Make",
    glyph: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M4 4h3l2 10L11 4h2l2 10 2-10h3l-3 16h-3L12 9l-2 11H7L4 4Z" />
      </svg>
    ),
  },
]

export function IntegrationsStrip() {
  return (
    <section className="border-y border-border/70 bg-muted/30 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Works with the tools your team already uses
        </p>
        <div className="mt-8 grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-6">
          {INTEGRATIONS.map((i) => (
            <div
              key={i.name}
              className="flex items-center gap-2.5 text-muted-foreground/70 grayscale transition-colors hover:text-foreground"
            >
              {i.glyph}
              <span className="text-[15px] font-semibold tracking-tight">
                {i.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
