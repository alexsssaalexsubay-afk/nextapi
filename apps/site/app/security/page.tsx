import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { Shield, Lock, Eye, Server, FileCheck, Users } from "lucide-react"

const MEASURES = [
  {
    icon: Lock,
    title: "Encryption",
    items: [
      "TLS 1.3 for all API communication",
      "Argon2id hashing for API key storage",
      "HMAC-SHA256 signature for webhook payloads",
      "AES-256 encryption at rest for stored content",
    ],
  },
  {
    icon: Shield,
    title: "Access Control",
    items: [
      "API key authentication with per-key scopes",
      "IP allowlist enforcement for enterprise accounts",
      "Rate limiting at API key and IP level",
      "Admin routes protected with dedicated token + rate limits",
    ],
  },
  {
    icon: Eye,
    title: "Monitoring & Observability",
    items: [
      "Real-time anomaly detection on API traffic",
      "Prometheus + Grafana dashboards with alerting",
      "Structured logging with Loki (no PII in logs)",
      "OpenTelemetry distributed tracing",
    ],
  },
  {
    icon: Server,
    title: "Infrastructure",
    items: [
      "Cloudflare DDoS protection and WAF",
      "Isolated compute for Enterprise queue lanes",
      "Automated backups with point-in-time recovery",
      "Graceful shutdown for zero-downtime deployments",
    ],
  },
  {
    icon: FileCheck,
    title: "Compliance",
    items: [
      "SOC 2 Type II (in progress — target Q3 2026)",
      "GDPR-compliant data processing",
      "Configurable data retention policies",
      "Configurable content moderation profiles",
    ],
  },
  {
    icon: Users,
    title: "Responsible Disclosure",
    items: [
      "Security vulnerabilities: security@nextapi.top",
      "Bug bounty program (coming Q3 2026)",
      "72-hour acknowledgment for all reports",
      "Public post-mortem for significant incidents",
    ],
  },
]

const SUBPROCESSORS = [
  { name: "Model inference", purpose: "Video generation for API requests", location: "Contracted regions" },
  { name: "Clerk", purpose: "Authentication & identity management", location: "United States" },
  { name: "Cloudflare", purpose: "CDN, DDoS protection, DNS", location: "Global" },
  { name: "Aliyun (Alibaba Cloud)", purpose: "Compute, database, storage", location: "Hong Kong" },
]

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main>
        <section className="relative isolate pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[640px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(129,140,248,0.22),transparent_70%)]"
          />
          <div className="mx-auto max-w-7xl px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[12px] font-medium text-foreground/80 backdrop-blur-sm">
              <Shield className="size-3.5 text-indigo-500" />
              Security
            </div>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
              Security at{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                NextAPI
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
              We treat security as a first-class engineering requirement, not a checkbox.
              Here&rsquo;s how we protect your data and your customers&rsquo; data.
            </p>
          </div>
        </section>

        <section className="pb-16 sm:pb-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 md:grid-cols-2 lg:grid-cols-3">
            {MEASURES.map((m) => (
              <div key={m.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500 dark:text-indigo-400">
                  <m.icon className="size-5" />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground">{m.title}</h3>
                <ul className="mt-3 space-y-2">
                  {m.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-muted-foreground">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-indigo-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Subprocessors</h2>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Third-party services that process data on our behalf.
            </p>
            <div className="mt-8 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 font-medium text-foreground">Provider</th>
                    <th className="px-4 py-3 font-medium text-foreground">Purpose</th>
                    <th className="hidden px-4 py-3 font-medium text-foreground sm:table-cell">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {SUBPROCESSORS.map((s) => (
                    <tr key={s.name} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.purpose}</td>
                      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{s.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
