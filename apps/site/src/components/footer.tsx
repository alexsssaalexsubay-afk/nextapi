import { getTranslations, getLocale } from "next-intl/server";

export async function Footer() {
  const t = await getTranslations("footer");
  const locale = await getLocale();
  const base = `/${locale}`;

  const col = (title: string, links: { href: string; label: string }[]) => (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
        {title}
      </h4>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="text-zinc-400 hover:text-zinc-100">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="border-t border-zinc-900 bg-zinc-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-5">
        <div className="md:col-span-1">
          <span className="font-semibold tracking-tight">
            Next<span className="text-violet-400">API</span>
          </span>
          <p className="mt-3 text-xs text-zinc-500">
            B2B Seedance gateway.
          </p>
        </div>
        {col(t("product"), [
          { href: `${base}/pricing`, label: t("pricing") },
          { href: `${base}/calculator`, label: t("calculator") },
          { href: `${base}/use-cases/short-drama`, label: t("useCases") },
        ])}
        {col(t("developers"), [
          { href: "https://docs.nextapi.top", label: t("docs") },
          { href: "https://status.nextapi.top", label: t("status") },
          { href: "https://docs.nextapi.top/changelog", label: t("changelog") },
        ])}
        {col(t("legal"), [
          { href: `${base}/legal/aup`, label: t("aup") },
          { href: `${base}/legal/terms`, label: t("terms") },
          { href: `${base}/legal/privacy`, label: t("privacy") },
          { href: `${base}/legal/sla`, label: t("sla") },
          { href: `${base}/legal/refund`, label: t("refund") },
        ])}
        {col(t("company"), [
          { href: `${base}/about`, label: t("about") },
          { href: `${base}/contact`, label: t("contact") },
        ])}
      </div>
      <div className="border-t border-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-zinc-500 md:flex-row">
          <span>© {new Date().getFullYear()} NextAPI HK Ltd. {t("rights")}</span>
          <div className="flex gap-4">
            <a href="/en">EN</a>
            <a href="/zh">中文</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
