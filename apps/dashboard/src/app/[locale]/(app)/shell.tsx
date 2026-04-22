"use client";

import { DashboardShell } from "@nextapi/ui";
import { UserButton } from "@clerk/nextjs";
import {
  Key,
  CreditCard,
  Video,
  LayoutDashboard,
  Play,
  Webhook,
  BarChart3,
  PiggyBank,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function Shell({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const prefix = `/${locale}/dashboard`;
  const items = [
    { href: prefix, label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: `${prefix}/playground`, label: "Playground", icon: <Play className="h-4 w-4" /> },
    { href: `${prefix}/api-keys`, label: "API Keys", icon: <Key className="h-4 w-4" /> },
    { href: `${prefix}/jobs`, label: "Jobs", icon: <Video className="h-4 w-4" /> },
    { href: `${prefix}/webhooks`, label: "Webhooks", icon: <Webhook className="h-4 w-4" /> },
    { href: `${prefix}/usage`, label: "Usage", icon: <BarChart3 className="h-4 w-4" /> },
    { href: `${prefix}/budget`, label: "Budget", icon: <PiggyBank className="h-4 w-4" /> },
    { href: `${prefix}/throughput`, label: "Throughput", icon: <Gauge className="h-4 w-4" /> },
    { href: `${prefix}/moderation`, label: "Moderation", icon: <ShieldCheck className="h-4 w-4" /> },
    { href: `${prefix}/billing`, label: "Billing", icon: <CreditCard className="h-4 w-4" /> },
  ].map((n) => ({ ...n, active: pathname === n.href }));

  return (
    <DashboardShell
      brand={<span>NextAPI</span>}
      nav={items}
      topRight={<UserButton afterSignOutUrl={`/${locale}/login`} />}
    >
      {children}
    </DashboardShell>
  );
}
