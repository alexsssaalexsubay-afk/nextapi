import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  return { title: t("title"), description: t("description") };
}

export default async function PricingPage() {
  const t = await getTranslations("pricing");

  const tiers = [
    {
      name: t("payg"),
      price: t("paygPrice"),
      blurb: t("paygBlurb"),
      features: [t("featurePrepaid")],
      cta: t("ctaStart"),
      href: "/signup",
      featured: false,
    },
    {
      name: t("growth"),
      price: t("growthPrice"),
      blurb: t("growthBlurb"),
      features: [t("featurePrepaid"), t("featureCommit")],
      cta: t("ctaUpgrade"),
      href: "/contact",
      featured: false,
    },
    {
      name: t("scale"),
      price: t("scalePrice"),
      blurb: t("scaleBlurb"),
      features: [
        t("featurePrepaid"),
        t("featureCommit"),
        t("featureSla"),
        t("featureReserved"),
        t("featureR2"),
      ],
      cta: t("ctaContact"),
      href: "/contact",
      featured: true,
    },
    {
      name: t("enterprise"),
      price: t("enterprisePrice"),
      blurb: t("enterpriseBlurb"),
      features: [
        t("featureSla"),
        t("featureReserved"),
        t("featureR2"),
        t("featureCommit"),
      ],
      cta: t("ctaContact"),
      href: "/contact",
      featured: false,
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h1 className="text-4xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">{t("subheading")}</p>

        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={
                "flex flex-col rounded-lg border p-6 " +
                (tier.featured
                  ? "border-violet-500/60 bg-violet-950/10"
                  : "border-zinc-800 bg-zinc-950/60")
              }
            >
              <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
                {tier.name}
              </h3>
              <p className="mt-3 text-2xl font-semibold">{tier.price}</p>
              <p className="mt-2 text-sm text-zinc-400">{tier.blurb}</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-400" />
                    <span className="text-zinc-300">{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={tier.href}
                className={
                  "mt-6 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium " +
                  (tier.featured
                    ? "bg-violet-600 text-white hover:bg-violet-500"
                    : "border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800")
                }
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-md border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-300">
          {t("featureInvoice")}
        </div>
      </div>
      <Footer />
    </div>
  );
}

