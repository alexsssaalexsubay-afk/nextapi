"use client"

import { useState } from "react"
import { SiteNav } from "@/components/marketing/site-nav"
import { SiteFooter } from "@/components/marketing/cta-footer"
import { PricingPreview } from "@/components/marketing/pricing-preview"
import { Check, Loader2 } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"

export default function PricingPage() {
  const t = useTranslations()
  const p = t.pricingPage

  const [email, setEmail] = useState("")
  const [company, setCompany] = useState("")
  const [volume, setVolume] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !company.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/v1/sales/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: company.trim(),
          company: company.trim(),
          email: email.trim(),
          volume: volume.trim() || "not specified",
          latency: "standard",
        }),
      })
      if (!res.ok) throw new Error("Request failed")
      setSubmitted(true)
    } catch {
      setError("Something went wrong. Please try again or email sales@nextapi.top.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-50" aria-hidden />
          <div
            className="pointer-events-none absolute left-[10%] top-[-10%] size-[420px] rounded-full bg-indigo-500/10 blur-[120px] dark:bg-indigo-500/20"
            aria-hidden
          />
          <div className="relative mx-auto max-w-[1240px] px-6 pt-24 pb-14">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-indigo-500 dark:text-indigo-400">
              {p.hero.eyebrow}
            </span>
            <h1 className="mt-4 max-w-[900px] text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-6xl lg:text-[72px]">
              {p.hero.title}
            </h1>
            <p className="mt-6 max-w-[640px] text-pretty text-[16px] leading-relaxed text-muted-foreground">
              {p.hero.subtitle}
            </p>
          </div>
        </section>

        <PricingPreview />

        {/* Credit-based model overview — no exact prices */}
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-[1240px] px-6 py-20">
            <div className="mb-10 flex flex-col items-start gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
                {p.creditTable.eyebrow}
              </span>
              <h2 className="text-[28px] font-medium tracking-tight md:text-[32px]">
                {p.creditTable.title}
              </h2>
            </div>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
              <table className="w-full text-[13px]">
                <thead className="bg-card/70 text-left text-[11.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-mono font-normal">{p.creditTable.columns.model}</th>
                    <th className="px-5 py-3 font-mono font-normal">{p.creditTable.columns.mode}</th>
                    <th className="px-5 py-3 font-mono font-normal">{p.creditTable.columns.duration}</th>
                    <th className="px-5 py-3 font-mono font-normal">{p.creditTable.columns.resolution}</th>
                    <th className="px-5 py-3 font-mono font-normal">{p.creditTable.columns.creditsPerJob}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[12.5px]">
                  {[
                    ["seedance-2.0-pro", "t2v", "5s", "720p"],
                    ["seedance-2.0-pro", "t2v", "5s", "1080p"],
                    ["seedance-2.0-fast", "t2v", "6s", "1080p"],
                    ["seedance-2.0-pro", "i2v", "6s", "1080p"],
                    ["seedance-2.0-pro", "t2v", "10s", "1080p"],
                    ["seedance-1.5-pro", "t2v", "6s", "720p"],
                    ["seedance-1.0-pro", "t2v", "6s", "720p"],
                    ["seedance-1.0-pro-fast", "t2v", "6s", "720p"],
                  ].map((r, i) => (
                    <tr key={i} className="text-foreground/90">
                      <td className="px-5 py-3">{r[0]}</td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            "rounded-sm px-1.5 py-0.5 text-[11px] " +
                            (r[1] === "i2v"
                              ? "bg-signal/10 text-signal"
                              : "bg-card text-muted-foreground")
                          }
                        >
                          {r[1]}
                        </span>
                      </td>
                      <td className="px-5 py-3">{r[2]}</td>
                      <td className="px-5 py-3">{r[3]}</td>
                      <td className="px-5 py-3 text-muted-foreground/60 italic">Sign up to view</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              {p.creditTable.footnote}
            </p>
          </div>
        </section>

        <section id="contact" className="border-b border-border/60">
          <div className="mx-auto max-w-[1240px] px-6 py-20">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
                  {p.scalePlan.eyebrow}
                </span>
                <h2 className="mt-3 text-[28px] font-medium tracking-tight md:text-[36px]">
                  {p.scalePlan.title}
                </h2>
                <p className="mt-4 max-w-[480px] text-[14px] leading-relaxed text-muted-foreground">
                  {p.scalePlan.subtitle}
                </p>
                <ul className="mt-6 space-y-3 text-[13.5px]">
                  {p.scalePlan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 text-signal" />
                      <span className="text-foreground/90">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-border/80 bg-card/50 p-6">
                <h3 className="text-[16px] font-medium tracking-tight">{p.contact.title}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {p.contact.subtitle}
                </p>
                {submitted ? (
                  <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-status-success/20 bg-status-success/5 p-6 text-center">
                    <Check className="size-8 text-status-success" />
                    <p className="text-[14px] font-medium text-foreground">Thank you!</p>
                    <p className="text-[13px] text-muted-foreground">
                      We&apos;ll be in touch within 24 hours.
                    </p>
                  </div>
                ) : (
                  <form className="mt-5 space-y-3 text-[13px]" onSubmit={handleSubmit}>
                    <label className="block">
                      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {p.contact.workEmail}
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={p.contact.workEmailPlaceholder}
                        className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-signal/50 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {p.contact.company}
                      </span>
                      <input
                        required
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder={p.contact.companyPlaceholder}
                        className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-signal/50 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {p.contact.volume}
                      </span>
                      <input
                        value={volume}
                        onChange={(e) => setVolume(e.target.value)}
                        placeholder={p.contact.volumePlaceholder}
                        className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-signal/50 focus:outline-none"
                      />
                    </label>
                    {error && (
                      <p className="text-[12px] text-destructive">{error}</p>
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-[13.5px] font-medium text-white shadow-[0_0_24px_-8px] shadow-indigo-500/50 transition-all hover:shadow-indigo-500/70 hover:brightness-110 disabled:opacity-60"
                    >
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : p.contact.submit}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
