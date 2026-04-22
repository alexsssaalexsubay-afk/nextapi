import { getTranslations } from "next-intl/server";
import { Card, CardTitle, CardDescription } from "@nextapi/ui";
import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";
import { BenchmarkCta } from "@/components/benchmark-cta";

export async function UseCasePage({ ns }: { ns: "shortDrama" | "adCreative" | "aiApps" }) {
  const t = await getTranslations(ns);
  const pains = [
    { title: t("pain1Title"), desc: t("pain1Desc") },
    { title: t("pain2Title"), desc: t("pain2Desc") },
    { title: t("pain3Title"), desc: t("pain3Desc") },
  ];
  const steps = [
    { title: t("step1Title"), desc: t("step1Desc") },
    { title: t("step2Title"), desc: t("step2Desc") },
    { title: t("step3Title"), desc: t("step3Desc") },
  ];
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-6 py-24">
        <span className="inline-flex items-center rounded-full border border-violet-700/60 bg-violet-950/30 px-3 py-1 text-xs text-violet-300">
          NextAPI for {t("title").split(" — ")[0]}
        </span>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">{t("heroSubtitle")}</p>
      </section>

      <section className="border-y border-zinc-900 bg-zinc-950/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            {t("painTitle")}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {pains.map((p) => (
              <Card key={p.title}>
                <CardTitle>{p.title}</CardTitle>
                <CardDescription className="mt-2">{p.desc}</CardDescription>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          {t("flowTitle")}
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.title}>
              <CardTitle>{s.title}</CardTitle>
              <CardDescription className="mt-2">{s.desc}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      <BenchmarkCta />
      <Footer />
    </div>
  );
}
