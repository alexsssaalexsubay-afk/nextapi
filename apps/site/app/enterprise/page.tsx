"use client"

import * as React from "react"
import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { CheckCircle2, ArrowRight, Building2, Zap, Shield, HeadphonesIcon } from "lucide-react"

const VOLUME_OPTIONS = [
  { value: "lt-10k", label: "< 10,000 videos / month" },
  { value: "10k-50k", label: "10,000 – 50,000 videos / month" },
  { value: "50k-plus", label: "50,000+ videos / month" },
]

const FEATURES = [
  {
    icon: Zap,
    title: "Dedicated Capacity",
    desc: "Guaranteed throughput with isolated queue lanes — no noisy neighbors.",
  },
  {
    icon: Shield,
    title: "Enterprise SLAs",
    desc: "99.95% uptime, P95 latency guarantees, and 24/7 incident response.",
  },
  {
    icon: Building2,
    title: "Custom Moderation",
    desc: "Configurable trust & safety profiles tailored to your compliance needs.",
  },
  {
    icon: HeadphonesIcon,
    title: "Solutions Architect",
    desc: "A dedicated engineer to design your integration and optimize throughput.",
  },
]

export default function EnterprisePage() {
  const [submitted, setSubmitted] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const form = new FormData(e.currentTarget)
    const payload = {
      name: form.get("name") as string,
      company: form.get("company") as string,
      email: form.get("email") as string,
      volume: form.get("volume") as string,
      latency: form.get("latency") as string,
      message: form.get("message") as string,
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"
      const res = await fetch(`${apiUrl}/v1/sales/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || `Request failed: ${res.status}`)
      }
      setSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[640px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(129,140,248,0.22),transparent_70%)]"
          />
          <div className="mx-auto max-w-7xl px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[12px] font-medium text-foreground/80 backdrop-blur-sm">
              <Building2 className="size-3.5 text-indigo-500" />
              Enterprise
            </div>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl lg:text-6xl">
              Scale your video pipeline with{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                Enterprise SLAs
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
              Dedicated capacity, guaranteed throughput, custom moderation profiles,
              and a solutions architect to design your integration.
            </p>
          </div>
        </section>

        {/* Features Grid */}
        <section className="pb-16 sm:pb-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-indigo-500/30"
              >
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500 dark:text-indigo-400">
                  <f.icon className="size-5" />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Lead Capture Form */}
        <section className="pb-24 sm:pb-32">
          <div className="mx-auto max-w-2xl px-6">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-indigo-500/5 dark:shadow-indigo-500/10">
              <div className="border-b border-border bg-muted/30 px-6 py-5 sm:px-8">
                <h2 className="text-xl font-semibold text-foreground">Contact our Sales team</h2>
                <p className="mt-1 text-[13.5px] text-muted-foreground">
                  Tell us about your use case and we&rsquo;ll design a capacity plan for you.
                </p>
              </div>

              {submitted ? (
                <div className="flex flex-col items-center gap-4 px-6 py-16 text-center sm:px-8">
                  <div className="inline-flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                    <CheckCircle2 className="size-7" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Request received</h3>
                  <p className="max-w-sm text-[14px] leading-relaxed text-muted-foreground">
                    Our solutions architect will contact you within 12 hours to discuss dedicated capacity.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6 sm:px-8">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field label="Name" name="name" required placeholder="Jane Smith" />
                    <Field label="Company" name="company" required placeholder="Acme Inc." />
                  </div>
                  <Field label="Work Email" name="email" type="email" required placeholder="jane@acme.com" />
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-foreground">
                      Monthly Video Volume
                    </label>
                    <select
                      name="volume"
                      required
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Select volume...</option>
                      {VOLUME_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <Field label="Target P95 Latency" name="latency" placeholder="e.g. < 60s per video" />
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-foreground">
                      Tell us more (optional)
                    </label>
                    <textarea
                      name="message"
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Describe your use case, compliance requirements, etc."
                    />
                  </div>

                  {error && (
                    <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-500">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-3 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 transition-all hover:shadow-indigo-500/70 hover:brightness-110 disabled:opacity-60"
                  >
                    {loading ? "Submitting..." : "Request Enterprise Access"}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-foreground">{label}</label>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      />
    </div>
  )
}
