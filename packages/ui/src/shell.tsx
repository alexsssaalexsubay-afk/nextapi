import { ReactNode } from "react";
import { cn } from "./cn";

type NavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
};

export function DashboardShell({
  nav,
  brand,
  topRight,
  children,
  accent = "violet",
}: {
  nav: NavItem[];
  brand: ReactNode;
  topRight?: ReactNode;
  children: ReactNode;
  accent?: "violet" | "red";
}) {
  const accentText =
    accent === "red" ? "text-red-400" : "text-violet-400";
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className={cn("flex h-14 items-center px-5 font-semibold", accentText)}>
          {brand}
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                n.active
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              {n.icon}
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
      </aside>
      <div className="pl-60">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-3 border-b border-zinc-800 bg-zinc-950/80 px-8 backdrop-blur">
          {topRight}
        </header>
        <main className="mx-auto max-w-6xl px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
