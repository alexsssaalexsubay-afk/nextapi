import { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Footer } from "./footer";
import { SiteHeader } from "./site-header";

export async function LegalShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const t = await getTranslations("legal");
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-zinc-500">{t("lastUpdated")}</p>
        <div className="mt-10 max-w-none text-zinc-300 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_p]:mt-4 [&_p]:leading-relaxed [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_a]:text-violet-400 [&_a:hover]:text-violet-300 [&_table]:mt-6 [&_table]:w-full [&_table]:text-sm [&_th]:border-b [&_th]:border-zinc-800 [&_th]:pb-2 [&_th]:text-left [&_th]:text-zinc-400 [&_td]:border-b [&_td]:border-zinc-900 [&_td]:py-2 [&_td]:text-zinc-300 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:text-violet-300">
          {children}
        </div>
      </article>
      <Footer />
    </div>
  );
}
