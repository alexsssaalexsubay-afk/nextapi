import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardTitle, CardDescription } from "@nextapi/ui";
import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";
import { BenchmarkCta } from "@/components/benchmark-cta";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("migrate");
  return { title: t("title"), description: t("description") };
}

export default async function MigratePage() {
  const t = await getTranslations("migrate");
  const steps = [
    { title: t("step1Title"), desc: t("step1Desc") },
    { title: t("step2Title"), desc: t("step2Desc") },
    { title: t("step3Title"), desc: t("step3Desc") },
    { title: t("step4Title"), desc: t("step4Desc") },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-6 py-24">
        <span className="inline-flex items-center rounded-full border border-violet-700/60 bg-violet-950/30 px-3 py-1 text-xs text-violet-300">
          Migration guide
        </span>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">{t("heroSubtitle")}</p>
      </section>

      <section className="border-y border-zinc-900 bg-zinc-950/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            {t("checklistTitle")}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {steps.map((s) => (
              <Card key={s.title}>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription className="mt-2">{s.desc}</CardDescription>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-lg font-semibold">{t("compatTitle")}</h2>
        <p className="mt-3 text-zinc-400">{t("compatDesc")}</p>
        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/40 text-left text-zinc-400">
                <th className="px-4 py-3">Feature</th>
                <th className="px-4 py-3">Fal / Replicate</th>
                <th className="px-4 py-3">NextAPI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              <tr><td className="px-4 py-3">Base URL swap</td><td className="px-4 py-3">—</td><td className="px-4 py-3 text-green-400">30 min</td></tr>
              <tr><td className="px-4 py-3">Signed webhooks</td><td className="px-4 py-3">Varies</td><td className="px-4 py-3 text-green-400">HMAC-SHA256</td></tr>
              <tr><td className="px-4 py-3">Idempotency</td><td className="px-4 py-3">Manual</td><td className="px-4 py-3 text-green-400">Built-in header</td></tr>
              <tr><td className="px-4 py-3">Reserved throughput</td><td className="px-4 py-3">No</td><td className="px-4 py-3 text-green-400">Guaranteed slots</td></tr>
              <tr><td className="px-4 py-3">SLA</td><td className="px-4 py-3">Best-effort</td><td className="px-4 py-3 text-green-400">99.9%</td></tr>
              <tr><td className="px-4 py-3">Invoice / Tax ID</td><td className="px-4 py-3">Limited</td><td className="px-4 py-3 text-green-400">Full procurement</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <BenchmarkCta />
      <Footer />
    </div>
  );
}
