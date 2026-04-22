import { getTranslations } from "next-intl/server";

export async function BenchmarkCta() {
  const t = await getTranslations("benchmark");
  return (
    <section className="border-t border-zinc-900 bg-violet-950/10">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h3 className="text-3xl font-semibold tracking-tight">{t("title")}</h3>
        <p className="mt-3 text-zinc-400">{t("subtitle")}</p>
        <a
          href="/contact"
          className="mt-8 inline-block rounded-md bg-violet-600 px-6 py-3 text-sm font-medium text-white hover:bg-violet-500"
        >
          {t("button")}
        </a>
      </div>
    </section>
  );
}
