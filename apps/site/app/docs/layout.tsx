import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Documentation",
  description: "Integrate NextAPI in minutes. REST API reference, SDKs, and integration guides.",
  openGraph: {
    title: "Documentation | NextAPI",
    description: "Integrate NextAPI in minutes with our REST API.",
    images: [{ url: "/og/docs.png", width: 1200, height: 630 }],
  },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
