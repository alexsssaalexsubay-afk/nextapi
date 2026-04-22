import { ReactNode } from "react";
import { Shell } from "./shell";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <Shell locale={locale}>{children}</Shell>;
}
