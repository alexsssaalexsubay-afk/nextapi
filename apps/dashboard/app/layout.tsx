import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { I18nProvider } from "@/lib/i18n/context"
import { Toaster } from "sonner"
import "@/globals.css"
import "@xyflow/react/dist/style.css"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Dashboard — NextAPI",
  description: "Manage your team videos",
  icons: {
    icon: [{ url: "/nextapi-logo.png", type: "image/png", sizes: "400x400" }],
    shortcut: [{ url: "/nextapi-logo.png", type: "image/png", sizes: "400x400" }],
    apple: [{ url: "/nextapi-logo.png", type: "image/png", sizes: "400x400" }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background font-sans text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            {children}
            <Toaster richColors position="top-right" />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
