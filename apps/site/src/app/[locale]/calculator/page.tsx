import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalculatorForm } from "@/components/calculator-form";
import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("calculator");
  return { title: t("title"), description: t("description") };
}

export default async function Page() {
  const t = await getTranslations("calculator");
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="text-4xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">{t("subheading")}</p>
        <div className="mt-12">
          <CalculatorForm />
        </div>
      </div>
      <Footer />
    </div>
  );
}
