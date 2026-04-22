import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { I18nProvider } from "@/lib/i18n/context"
import { PostHogProvider } from "@/components/posthog-provider"
import "@/globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

const SITE_URL = "https://nextapi.top"

export const metadata: Metadata = {
  title: {
    default: "NextAPI — Production video generation infrastructure",
    template: "%s | NextAPI",
  },
  description:
    "Seedance official access, signed webhooks, transparent billing, and job-level observability. Ship your first video generation in minutes.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    siteName: "NextAPI",
    title: "NextAPI — Production video generation infrastructure",
    description: "Seedance official access, signed webhooks, transparent billing, and job-level observability.",
    url: SITE_URL,
    images: [{ url: "/og/default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NextAPI — Production video generation infrastructure",
    description: "Seedance official access, signed webhooks, transparent billing, and job-level observability.",
    images: ["/og/default.png"],
  },
  icons: {
    icon: [{ url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1c22" },
  ],
  colorScheme: "light dark",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-background font-sans text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            <PostHogProvider />
            {children}
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
