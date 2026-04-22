import { getTranslations, getLocale } from "next-intl/server";

export async function SiteHeader() {
  const n = await getTranslations("nav");
  const locale = await getLocale();
  const base = `/${locale}`;
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-900/60 bg-zinc-950/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href={base} className="font-semibold tracking-tight">
          Next<span className="text-violet-400">API</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
          <a href="https://docs.nextapi.top" className="hover:text-zinc-100">{n("docs")}</a>
          <a href={`${base}/pricing`} className="hover:text-zinc-100">{n("pricing")}</a>
          <a href={`${base}/calculator`} className="hover:text-zinc-100">{n("calculator")}</a>
          <a href={`${base}/use-cases/short-drama`} className="hover:text-zinc-100">{n("useCases")}</a>
          <a href={`${base}/migrate`} className="hover:text-zinc-100">{n("migrate")}</a>
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
  );
}
