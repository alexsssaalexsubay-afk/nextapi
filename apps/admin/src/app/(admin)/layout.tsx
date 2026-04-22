"use client";

import { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { DashboardShell, Badge } from "@nextapi/ui";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Coins,
  Activity,
  ShieldAlert,
  Building2,
  Webhook,
  ScrollText,
} from "lucide-react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const nav = [
    { href: "/dashboard", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: "/dashboard/users", label: "Users", icon: <Users className="h-4 w-4" /> },
    { href: "/dashboard/jobs", label: "Jobs", icon: <Briefcase className="h-4 w-4" /> },
    { href: "/dashboard/credits", label: "Credits", icon: <Coins className="h-4 w-4" /> },
    { href: "/dashboard/moderation", label: "Moderation", icon: <ShieldAlert className="h-4 w-4" /> },
    { href: "/dashboard/orgs", label: "Orgs", icon: <Building2 className="h-4 w-4" /> },
    { href: "/dashboard/webhooks", label: "Webhooks", icon: <Webhook className="h-4 w-4" /> },
    { href: "/dashboard/audit", label: "Audit", icon: <ScrollText className="h-4 w-4" /> },
    { href: "/dashboard/system", label: "System Health", icon: <Activity className="h-4 w-4" /> },
  ].map((n) => ({
    ...n,
    active: pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href)),
  }));

  return (
    <DashboardShell
      accent="red"
      brand={<span>NextAPI · Admin</span>}
      nav={nav}
      topRight={
        <>
          <Badge variant="destructive">ADMIN</Badge>
          <UserButton afterSignOutUrl="/login" />
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
