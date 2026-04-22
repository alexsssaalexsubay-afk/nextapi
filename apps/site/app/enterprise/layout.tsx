import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Enterprise",
  description: "Scale your video pipeline with Enterprise SLAs. Dedicated capacity, guaranteed throughput, and custom moderation.",
  openGraph: {
    title: "Enterprise | NextAPI",
    description: "Scale your video pipeline with Enterprise SLAs.",
    images: [{ url: "/og/enterprise.png", width: 1200, height: 630 }],
  },
}

export default function EnterpriseLayout({ children }: { children: React.ReactNode }) {
  return children
}
