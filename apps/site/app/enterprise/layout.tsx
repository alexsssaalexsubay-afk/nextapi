import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Enterprise",
  description: "Scale video production with enterprise guarantees, dedicated capacity, and custom review rules.",
  openGraph: {
    title: "Enterprise | NextAPI",
    description: "Scale video production with enterprise guarantees.",
    images: [{ url: "/og/enterprise.png", width: 1200, height: 630 }],
  },
}

export default function EnterpriseLayout({ children }: { children: React.ReactNode }) {
  return children
}
