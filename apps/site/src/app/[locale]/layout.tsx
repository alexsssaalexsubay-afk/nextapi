import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ReactNode } from "react";
import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: "NextAPI — OpenRouter for Video AI",
    template: "%s · NextAPI",
  },
  description:
    "Enterprise-grade video generation API. Official Volcengine Seedance partner — 1 of 20 globally.",
  metadataBase: new URL("https://nextapi.top"),
  openGraph: {
    title: "NextAPI — OpenRouter for Video AI",
    description:
      "Enterprise-grade video generation API. Official Volcengine Seedance partner.",
    url: "https://nextapi.top",
    siteName: "NextAPI",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "NextAPI" },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
