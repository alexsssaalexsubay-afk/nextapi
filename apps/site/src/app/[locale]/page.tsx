import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardTitle, CardDescription } from "@nextapi/ui";
import {
  Cpu,
  Shield,
  Webhook,
  Globe2,
  Gauge,
  ReceiptText,
} from "lucide-react";
import { Footer } from "@/components/footer";

const features = [
  { icon: Cpu, title: "Multi-model routing", desc: "One API, future-proof across video providers." },
  { icon: Shield, title: "Official Seedance access", desc: "1 of 20 licensed Volcengine partners globally." },
  { icon: Webhook, title: "Webhook callbacks", desc: "Signed HMAC-SHA256, exponential retries." },
  { icon: Globe2, title: "Global CDN delivery", desc: "Served from Cloudflare R2 with presigned URLs." },
  { icon: Gauge, title: "Enterprise SLA", desc: "99.9% uptime, status page, transparent incidents." },
  { icon: ReceiptText, title: "Transparent pricing", desc: "Per-token billing, no hidden markups." },
];

const snippet = `curl https://api.nextapi.top/v1/video/generations \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "aerial shot of a cyberpunk tokyo at dusk",
    "model":  "seedance-v2-pro",
    "duration_seconds": 5,
    "resolution": "1080p"
  }'`;

export default async function HomePage() {
  const t = await getTranslations("hero");
  const n = await getTranslations("nav");
  const locale = await getLocale();
  const base = `/${locale}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-900/60 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="font-semibold tracking-tight">
            Next<span className="text-violet-400">API</span>
          </span>
          <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
            <a href="https://docs.nextapi.top" className="hover:text-zinc-100">{n("docs")}</a>
            <a href={`${base}/pricing`} className="hover:text-zinc-100">{n("pricing")}</a>
            <a href={`${base}/calculator`} className="hover:text-zinc-100">{n("calculator")}</a>
            <a href={`${base}/use-cases/short-drama`} className="hover:text-zinc-100">{n("useCases")}</a>
            <a href={`${base}/contact`} className="hover:text-zinc-100">{n("contact")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="/signup"
              className="rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              {n("signIn")}
            </a>
            <a
              href="/signup"
              className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
            >
              {n("getKey")}
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-2">
        <div>
          <span className="inline-flex items-center rounded-full border border-violet-700/60 bg-violet-950/30 px-3 py-1 text-xs text-violet-300">
            Video AI Infrastructure · v1 live
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">
            {t("h1")}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-400">{t("h2")}</p>
          <div className="mt-8 flex gap-3">
            <a
              href="/signup"
              className="rounded-md bg-violet-600 px-5 py-3 text-sm font-medium text-white hover:bg-violet-500"
            >
              {t("ctaPrimary")}
            </a>
            <a
              href="https://docs.nextapi.top"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
            >
              {t("ctaSecondary")}
            </a>
          </div>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 text-xs text-zinc-500">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-2 font-mono">POST /v1/video/generations</span>
          </div>
          <pre className="overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-300">
            {snippet}
          </pre>
        </Card>
      </section>

      <section className="border-y border-zinc-900 bg-zinc-950/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Platform
          </h2>
          <h3 className="mt-2 text-3xl font-semibold tracking-tight">
            Everything you need to ship video AI.
          </h3>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title}>
                <f.icon className="h-5 w-5 text-violet-400" />
                <CardTitle className="mt-4">{f.title}</CardTitle>
                <CardDescription className="mt-1">{f.desc}</CardDescription>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h3 className="text-3xl font-semibold tracking-tight">
          Start building for free.
        </h3>
        <p className="mt-3 text-zinc-400">
          500 credits on signup. No credit card. No waitlist.
        </p>
        <div className="mt-8">
          <a
            href="/signup"
            className="inline-block rounded-md bg-violet-600 px-6 py-3 text-sm font-medium text-white hover:bg-violet-500"
          >
            {t("ctaPrimary")}
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
