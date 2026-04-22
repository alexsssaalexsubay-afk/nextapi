import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactForm } from "@/components/contact-form";
import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contact");
  return { title: t("title"), description: t("description") };
}

export default async function Page() {
  const t = await getTranslations("contact");
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-4xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="mt-3 text-zinc-400">{t("subheading")}</p>
        <div className="mt-10">
          <ContactForm />
        </div>
      </div>
      <Footer />
    </div>
  );
}
