import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UseCasePage } from "@/components/use-case-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shortDrama");
  return { title: t("title"), description: t("description") };
}

export default function Page() {
  return <UseCasePage ns="shortDrama" />;
}
